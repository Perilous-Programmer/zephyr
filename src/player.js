/**
 * Zephyr Player — main class + global export.
 *
 * Usage (RMP-style, to keep migrations mechanical):
 *   const player = new Zephyr('playerContainer');
 *   player.on('playing', () => { ... });
 *   player.init({ src: { hls: 'https://.../master.m3u8' }, autoplay: true });
 *
 * Unlike RMP there is no licenseKey — Zephyr is open source. Times are in
 * SECONDS (RMP used milliseconds; divide by 1000 when migrating).
 */

const ZEPHYR_VERSION = '1.2.0';

const ZEPHYR_DEFAULTS = {
    src: null,                 // { hls: url } — required
    backupSrc: null,           // { hls: url } — automatic failover target
    title: null,

    // Playback
    autoplay: false,
    mutedAutoplayFallback: true,
    srcChangeAutoplay: true,
    playsInline: true,
    preload: 'metadata',
    crossOrigin: null,         // null | 'anonymous' | 'use-credentials' — see init()
    initialVolume: 1,
    isLive: false,
    lowLatencyMode: false,
    forceNativeHlsOnAppleDevices: false,
    speed: [0.5, 0.75, 1, 1.25, 1.5, 2],

    // hls.js ABR tuning (RMP-compatible names)
    hlsJSMaxBufferLength: 30,
    hlsJSLiveSyncDuration: 12,
    hlsJSStartLevel: -1,
    hlsJSMinAutoBitrate: 0,
    hlsJSAbrBandWidthFactor: 0.95,
    hlsJSAbrBandWidthUpFactor: 0.7,
    hlsJSLiveBackBufferLength: 0,
    hlsConfig: null,           // raw hls.js overrides (escape hatch)

    // UI
    skin: { accentColor: '#ED5555', backgroundColor: 'rgba(0,0,0,0.7)', buttonColor: '#FFFFFF' },
    autoHeightMode: true,
    delayToFade: 3000,
    quickRewind: 10,
    quickForward: 10,
    pip: true,
    sharing: false,
    logoWatermark: null,       // image URL
    logoPosition: 'topleft',
    errorCustomText: 'This content is currently unavailable. Please try again later.',
    errorOnlyShowCustomText: false,

    // Modules
    drm: null,                 // { widevine: {licenseUrl}, playready: {...}, fairplay: {...}, clearkey: {...} }
    ads: null,                 // { adTagUrl, showAdOnPlay, adBlockerDetection, adBlockerDetectedMessage }
    googleCast: false,
    airplay: true,
    cast: null,                // { receiverApplicationId, customData }
    analytics: null,           // { adapter, dataLayerEvents, heartbeatInterval }
    mux: null                  // { envKey, metadata }
};

class Zephyr {
    constructor(elementId) {
        this.container = document.getElementById(elementId);
        if (!this.container) {
            throw new Error(`Zephyr: no element with id "${elementId}"`);
        }
        this.emitter = new ZephyrEmitter();
        this.settings = null;
        this.video = null;
        this.engine = null;
        this.ui = null;
        this.ads = null;
        this.cast = null;
        this.analytics = null;
        this._initialized = false;
        this._destroyed = false;
        this._playbackStarted = false;
    }

    init(settings) {
        if (this._initialized) {
            throw new Error('Zephyr: init() called twice — use setSrc() to change streams');
        }
        this._initialized = true;
        this.settings = ZephyrUtils.deepMerge(ZEPHYR_DEFAULTS, settings || {});

        // Media element
        this.video = document.createElement('video');
        this.video.preload = this.settings.preload;
        this.video.volume = ZephyrUtils.clamp(this.settings.initialVolume, 0, 1);
        if (this.settings.playsInline) {
            this.video.playsInline = true;
            this.video.setAttribute('playsinline', '');
            this.video.setAttribute('webkit-playsinline', '');
        }
        // Left unset by default. On Safari's native HLS pipeline the attribute
        // switches media loading to CORS mode, which then demands
        // Access-Control-Allow-Origin on the playlist, every segment and every
        // key — token-gated/signed origins commonly don't send those, and
        // playback fails outright. It buys nothing on the hls.js/MSE path
        // (the element's src is a blob: URL there), so opt in only when the
        // page needs canvas capture or cross-origin <track> subtitles.
        if (this.settings.crossOrigin) {
            this.video.crossOrigin = this.settings.crossOrigin;
        }

        // Modules (UI first: it owns the DOM the others hang off)
        this.ui = new ZephyrUI(this);
        this.ui.build();
        this.engine = new ZephyrEngine(this);
        this.analytics = new ZephyrAnalytics(this);
        this.analytics.init();
        this.cast = new ZephyrCast(this);
        this.cast.init();
        this.ads = new ZephyrAds(this);
        this.ads.init();

        this._wireMediaEvents();

        this.once(ZephyrEvents.MANIFEST_LOADED, () => {
            this.emit(ZephyrEvents.READY, { version: ZEPHYR_VERSION });
            if (this.settings.autoplay) {
                this._attemptAutoplay();
            } else {
                this.ui.showBigPlay();
            }
        });

        this.engine.load(this.settings.src);
        return this;
    }

    _wireMediaEvents() {
        const video = this.video;
        const map = [
            ['playing', ZephyrEvents.PLAYING],
            ['pause', ZephyrEvents.PAUSE],
            ['ended', ZephyrEvents.ENDED],
            ['seeking', ZephyrEvents.SEEKING],
            ['seeked', ZephyrEvents.SEEKED],
            ['waiting', ZephyrEvents.WAITING]
        ];
        map.forEach(([domEvent, zephyrEvent]) => {
            video.addEventListener(domEvent, () => this.emit(zephyrEvent, {
                position: video.currentTime
            }));
        });
        video.addEventListener('playing', () => {
            this._playbackStarted = true;
        });
        video.addEventListener('timeupdate', () => this.emit(ZephyrEvents.TIME_UPDATE, {
            position: video.currentTime,
            duration: video.duration
        }));
        video.addEventListener('volumechange', () => this.emit(ZephyrEvents.VOLUME_CHANGE, {
            volume: video.volume,
            muted: video.muted
        }));
        video.addEventListener('ratechange', () => this.emit(ZephyrEvents.RATE_CHANGE, {
            rate: video.playbackRate
        }));
        video.addEventListener('error', () => {
            const mediaError = video.error;
            // MEDIA_ERR_SRC_NOT_SUPPORTED etc. on the native path (hls.js has its own handler)
            if (this.engine && this.engine.usingNative && mediaError) {
                this.engine._failover({ details: `native:${mediaError.code}` });
            }
        });
    }

    async _attemptAutoplay() {
        try {
            await this.video.play();
        } catch (err) {
            if (!this.settings.mutedAutoplayFallback) {
                this.emit(ZephyrEvents.AUTOPLAY_FAILURE, {});
                this.ui.showBigPlay();
                return;
            }
            this.video.muted = true;
            try {
                await this.video.play();
                this.emit(ZephyrEvents.AUTOPLAY_MUTED, {});
                this.ui.showNotice('Tap the volume icon to unmute');
            } catch (err2) {
                this.video.muted = false;
                this.emit(ZephyrEvents.AUTOPLAY_FAILURE, {});
                this.ui.showBigPlay();
            }
        }
    }

    // ---- Events ----------------------------------------------------------------

    on(name, callback) { this.emitter.on(name, callback); return this; }
    off(name, callback) { this.emitter.off(name, callback); return this; }
    once(name, callback) { this.emitter.once(name, callback); return this; }
    /** RMP alias for once(). */
    one(name, callback) { return this.once(name, callback); }
    emit(name, data) { if (!this._destroyed) this.emitter.emit(name, data); }

    // ---- Playback API ------------------------------------------------------------

    play() {
        const p = this.video.play();
        if (p && p.catch) p.catch(() => this.ui.showBigPlay());
        // First user-gesture play is the moment IMA is allowed to start.
        if (this.ads && this.settings.ads && this.settings.ads.showAdOnPlay !== false) {
            this.ads.start();
        }
        return p;
    }

    pause() { this.video.pause(); }

    togglePlay() {
        if (this.video.paused) this.play();
        else this.pause();
    }

    /** seconds */
    seekTo(seconds) {
        const duration = this.getDuration();
        const max = isFinite(duration) ? duration : Number.MAX_SAFE_INTEGER;
        this.video.currentTime = ZephyrUtils.clamp(seconds, 0, max);
    }

    getCurrentTime() { return this.video.currentTime; }

    /** seconds (RMP returned milliseconds — divide by 1000 when migrating) */
    getDuration() { return this.video.duration; }

    setVolume(volume) { this.video.volume = ZephyrUtils.clamp(volume, 0, 1); }
    getVolume() { return this.video.volume; }
    setMute(muted) { this.video.muted = Boolean(muted); }
    getMute() { return this.video.muted; }

    setPlaybackRate(rate) { this.video.playbackRate = rate; }
    getPlaybackRate() { return this.video.playbackRate; }

    getLevels() { return this.engine.getLevels(); }
    setLevel(index) { this.engine.setLevel(index); }
    getCurrentLevel() { return this.engine.getCurrentLevel(); }

    isFullscreen() {
        return Boolean(document.fullscreenElement || document.webkitFullscreenElement);
    }

    toggleFullscreen() {
        if (this.isFullscreen()) {
            (document.exitFullscreen || document.webkitExitFullscreen).call(document);
        } else {
            const el = this.container;
            (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
        }
    }

    togglePiP() {
        const video = this.video;
        if (document.pictureInPictureEnabled) {
            if (document.pictureInPictureElement) {
                document.exitPictureInPicture().catch(() => {});
            } else {
                video.requestPictureInPicture().catch(() => {});
            }
        } else if (video.webkitSetPresentationMode) {
            // Safari
            const mode = video.webkitPresentationMode === 'picture-in-picture'
                ? 'inline' : 'picture-in-picture';
            video.webkitSetPresentationMode(mode);
            this.emit(ZephyrEvents.PIP_CHANGE, { pip: mode === 'picture-in-picture' });
        }
    }

    /** RMP-compatible: show/hide the control bar. */
    setControls(visible) { this.ui.setControlsVisible(visible); }

    hasPlaybackStarted() { return this._playbackStarted; }

    getQoESnapshot() { return this.analytics.getQoESnapshot(); }

    /** Switch streams in place: setSrc({hls: url}, backupSrc?) */
    setSrc(src, backupSrc) {
        this.settings.src = src;
        this.settings.backupSrc = backupSrc || null;
        this.engine.destroy();
        this.engine = new ZephyrEngine(this);
        this.emit(ZephyrEvents.SRC_CHANGED, { src });
        this.once(ZephyrEvents.MANIFEST_LOADED, () => {
            if (this.settings.srcChangeAutoplay) this._attemptAutoplay();
        });
        this.engine.load(src);
    }

    // ---- Errors -------------------------------------------------------------------

    _fatal(code, message, detail) {
        const custom = this.settings && this.settings.errorCustomText;
        const display = (this.settings && this.settings.errorOnlyShowCustomText && custom)
            ? custom
            : (custom || message);
        if (this.ui) this.ui.showError(display);
        this.emit(ZephyrEvents.ERROR, { code, message, detail: detail || null });
    }

    // ---- Teardown -------------------------------------------------------------------

    destroy() {
        if (this._destroyed) return;
        if (this.analytics) this.analytics.destroy();
        if (this.ads) this.ads.destroy();
        if (this.cast) this.cast.destroy();
        if (this.engine) this.engine.destroy();
        if (this.ui) this.ui.destroy();
        if (this.video) {
            this.video.pause();
            this.video.removeAttribute('src');
            this.video.load();
        }
        this.container.classList.remove(
            'zephyr', 'zephyr--live', 'zephyr--idle', 'zephyr--bigplay',
            'zephyr--buffering', 'zephyr--admode', 'zephyr--autoheight'
        );
        this.container.innerHTML = '';
        this.emitter.emit(ZephyrEvents.DESTROY_COMPLETED, {});
        this.emitter.removeAll();
        this._destroyed = true;
    }
}

Zephyr.version = ZEPHYR_VERSION;
Zephyr.Events = ZephyrEvents;
Zephyr.Headless = ZephyrHeadless;
/** Engine-only mode for custom UIs (reels/previews): attaches to an existing <video>. */
Zephyr.headless = function (videoElement, settings) {
    return new ZephyrHeadless(videoElement, settings);
};
