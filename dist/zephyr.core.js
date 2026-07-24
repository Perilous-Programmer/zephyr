/*! Zephyr Player v1.2.0 | HLS + DRM + IMA ads + Cast/AirPlay + QoE | MIT | core build, BYO hls.js v1.5.13 (Apache-2.0) */
(function (window, document) {
'use strict';
// ---- src/events.js ----
/**
 * Zephyr Player — canonical event names + a minimal event emitter.
 *
 * Event name strings intentionally mirror the RMP-style lowercase names used
 * by existing integrations (`player.on("playing", ...)`,
 * `player.on("hlsmanifestloaded", ...)`) so a migration from Radiant Media
 * Player maps 1:1.
 */
const ZephyrEvents = {
    // Lifecycle
    READY: 'ready',
    SRC_CHANGED: 'srcchanged',
    DESTROY_COMPLETED: 'destroycompleted',

    // Playback
    PLAYING: 'playing',
    PAUSE: 'pause',
    ENDED: 'ended',
    SEEKING: 'seeking',
    SEEKED: 'seeked',
    TIME_UPDATE: 'timeupdate',
    WAITING: 'waiting',
    VOLUME_CHANGE: 'volumechange',
    RATE_CHANGE: 'ratechange',
    AUTOPLAY_FAILURE: 'autoplayfailure',
    AUTOPLAY_MUTED: 'autoplaymuted',

    // Errors / diagnostics
    ERROR: 'error',
    WARNING: 'warning',

    // HLS / ABR
    MANIFEST_LOADED: 'hlsmanifestloaded',
    HLS_ERROR: 'hlserror',
    LEVELS_PARSED: 'levelsparsed',
    LEVEL_SWITCH: 'levelswitch',
    SRC_FAILOVER: 'srcfailover',

    // DRM
    DRM_KEY_SYSTEM_SELECTED: 'drmkeysystemselected',
    DRM_LICENSE_ACQUIRED: 'drmlicenseacquired',
    DRM_ERROR: 'drmerror',

    // Ads (Google IMA)
    AD_BLOCKER_DETECTED: 'adblockerdetected',
    AD_LOADED: 'adloaded',
    AD_STARTED: 'adstarted',
    AD_FIRST_QUARTILE: 'adfirstquartile',
    AD_MIDPOINT: 'admidpoint',
    AD_THIRD_QUARTILE: 'adthirdquartile',
    AD_COMPLETE: 'adcomplete',
    AD_SKIPPED: 'adskipped',
    AD_CLICK: 'adclick',
    AD_ERROR: 'aderror',
    ADS_ALL_COMPLETED: 'adsallcompleted',

    // Cast / AirPlay
    CAST_AVAILABLE: 'castavailable',
    CAST_CONNECTED: 'castconnected',
    CAST_DISCONNECTED: 'castdisconnected',
    AIRPLAY_AVAILABLE: 'airplayavailable',
    AIRPLAY_ACTIVE: 'airplayactive',

    // UI
    FULLSCREEN_CHANGE: 'fullscreenchange',
    PIP_CHANGE: 'pipchange',

    // QoE
    REBUFFER_START: 'rebufferstart',
    REBUFFER_END: 'rebufferend',
    HEARTBEAT: 'heartbeat'
};

class ZephyrEmitter {
    constructor() {
        this._listeners = {};
    }

    /**
     * Subscribe. Use the wildcard '*' to receive every event as (name, data) —
     * that is how the analytics module forwards the full stream.
     */
    on(name, callback) {
        if (typeof callback !== 'function') return this;
        (this._listeners[name] = this._listeners[name] || []).push(callback);
        return this;
    }

    off(name, callback) {
        const list = this._listeners[name];
        if (!list) return this;
        if (!callback) {
            delete this._listeners[name];
        } else {
            this._listeners[name] = list.filter((cb) => cb !== callback);
        }
        return this;
    }

    once(name, callback) {
        const wrapper = (data) => {
            this.off(name, wrapper);
            callback(data);
        };
        return this.on(name, wrapper);
    }

    emit(name, data) {
        (this._listeners[name] || []).slice().forEach((cb) => {
            try {
                cb(data);
            } catch (err) {
                // A broken listener must never take down playback.
                console.error(`Zephyr: listener for "${name}" threw`, err);
            }
        });
        (this._listeners['*'] || []).slice().forEach((cb) => {
            try {
                cb(name, data);
            } catch (err) {
                console.error('Zephyr: wildcard listener threw', err);
            }
        });
    }

    removeAll() {
        this._listeners = {};
    }
}

// ---- src/utils.js ----
/**
 * Zephyr Player — small shared helpers.
 */
const ZephyrUtils = {
    /** 125 -> "2:05", 3725 -> "1:02:05". Infinity/NaN -> "0:00" (live/unknown). */
    formatTime(seconds) {
        if (!isFinite(seconds) || isNaN(seconds) || seconds < 0) return '0:00';
        const s = Math.floor(seconds % 60);
        const m = Math.floor((seconds / 60) % 60);
        const h = Math.floor(seconds / 3600);
        const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
        const ss = String(s).padStart(2, '0');
        return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
    },

    clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    },

    /** createEl('button', 'zephyr-btn', {title: 'Play'}) */
    createEl(tag, className, attrs) {
        const el = document.createElement(tag);
        if (className) el.className = className;
        if (attrs) {
            Object.keys(attrs).forEach((key) => el.setAttribute(key, attrs[key]));
        }
        return el;
    },

    /** Recursive merge of plain objects; arrays and non-objects are replaced. */
    deepMerge(base, override) {
        const out = Object.assign({}, base);
        if (!override) return out;
        Object.keys(override).forEach((key) => {
            const b = base ? base[key] : undefined;
            const o = override[key];
            if (
                o && b &&
                typeof o === 'object' && typeof b === 'object' &&
                !Array.isArray(o) && !Array.isArray(b)
            ) {
                out[key] = ZephyrUtils.deepMerge(b, o);
            } else {
                out[key] = o;
            }
        });
        return out;
    },

    isAppleDevice() {
        const ua = navigator.userAgent;
        return /iPhone|iPad|iPod|Macintosh/.test(ua);
    },

    hasNativeHls(video) {
        return Boolean(video.canPlayType && video.canPlayType('application/vnd.apple.mpegurl'));
    },

    uuid() {
        if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
        // RFC4122-ish fallback for older browsers
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = (Math.random() * 16) | 0;
            const v = c === 'x' ? r : (r & 0x3) | 0x8;
            return v.toString(16);
        });
    },

    /**
     * Bait-element ad-blocker detection. Ad blockers with cosmetic filtering
     * hide elements matching well-known ad class names. Resolves true when a
     * blocker is likely active. Complemented in ZephyrAds by checking whether
     * the IMA SDK itself was blocked from loading.
     */
    detectAdBlocker() {
        return new Promise((resolve) => {
            const bait = ZephyrUtils.createEl('div', 'ads ad adsbox ad-banner ad-placement carbon-ads');
            bait.style.cssText = 'position:absolute;left:-9999px;top:-9999px;width:1px;height:1px;';
            bait.setAttribute('aria-hidden', 'true');
            document.body.appendChild(bait);
            // Cosmetic filters apply asynchronously; give them a beat.
            setTimeout(() => {
                const blocked =
                    bait.offsetParent === null ||
                    bait.offsetHeight === 0 ||
                    getComputedStyle(bait).display === 'none';
                bait.remove();
                resolve(blocked);
            }, 120);
        });
    },

    base64ToArrayBuffer(b64) {
        const binary = atob(b64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return bytes.buffer;
    },

    arrayBufferToBase64(buffer) {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        return btoa(binary);
    }
};

// ---- src/drm.js ----
/**
 * Zephyr Player — FairPlay Streaming (Safari native HLS) via modern EME.
 *
 * Widevine / PlayReady / ClearKey are handled by hls.js's built-in EME
 * support and configured in ZephyrEngine._buildHlsConfig(). This class only
 * covers the Safari path, where playback is native HLS and Zephyr must drive
 * the `encrypted` -> certificate -> SPC -> license (CKC) exchange itself.
 *
 * Config shape (settings.drm.fairplay):
 *   {
 *     certificateUrl: 'https://.../fairplay.cer',   // required
 *     licenseUrl:     'https://.../fps/license',    // required
 *     licenseHeaders: { Authorization: '...' },     // optional
 *     // Optional hooks for servers that wrap SPC/CKC in JSON/base64:
 *     prepareLicenseRequest: (spcArrayBuffer) => bodyAndHeaders,
 *     parseLicenseResponse:  (response) => ckcArrayBufferPromise,
 *   }
 */
class ZephyrFairPlay {
    constructor(player, config) {
        this.player = player;
        this.config = config || {};
        this.video = null;
        this.keySystemAccess = null;
        this._certificate = null;
        this._onEncrypted = null;
    }

    attach(video) {
        this.video = video;
        this._onEncrypted = (event) => {
            this._handleEncrypted(event).catch((err) => {
                this.player.emit(ZephyrEvents.DRM_ERROR, { message: err && err.message, error: err });
                this.player._fatal('DRM_FAIRPLAY', 'FairPlay license exchange failed');
            });
        };
        video.addEventListener('encrypted', this._onEncrypted);
    }

    detach() {
        if (this.video && this._onEncrypted) {
            this.video.removeEventListener('encrypted', this._onEncrypted);
        }
        this.video = null;
        this._onEncrypted = null;
    }

    async _handleEncrypted(event) {
        const video = event.target;

        if (!video.mediaKeys) {
            if (!this.keySystemAccess) {
                this.keySystemAccess = await navigator.requestMediaKeySystemAccess('com.apple.fps', [{
                    initDataTypes: [event.initDataType || 'sinf', 'sinf', 'skd', 'cenc'],
                    videoCapabilities: [
                        { contentType: 'application/vnd.apple.mpegurl', robustness: '' }
                    ],
                    distinctiveIdentifier: 'not-allowed',
                    persistentState: 'not-allowed'
                }]);
                this.player.emit(ZephyrEvents.DRM_KEY_SYSTEM_SELECTED, { keySystem: 'com.apple.fps' });
            }
            const mediaKeys = await this.keySystemAccess.createMediaKeys();
            const certificate = await this._loadCertificate();
            await mediaKeys.setServerCertificate(certificate);
            await video.setMediaKeys(mediaKeys);
        }

        const session = video.mediaKeys.createSession();
        session.addEventListener('message', (messageEvent) => {
            this._exchangeLicense(messageEvent.message)
                .then((ckc) => session.update(ckc))
                .then(() => this.player.emit(ZephyrEvents.DRM_LICENSE_ACQUIRED, { keySystem: 'com.apple.fps' }))
                .catch((err) => {
                    this.player.emit(ZephyrEvents.DRM_ERROR, { message: err && err.message, error: err });
                    this.player._fatal('DRM_LICENSE', 'FairPlay license request failed');
                });
        });
        await session.generateRequest(event.initDataType, event.initData);
    }

    async _loadCertificate() {
        if (this._certificate) return this._certificate;
        if (!this.config.certificateUrl) {
            throw new Error('drm.fairplay.certificateUrl is required');
        }
        const response = await fetch(this.config.certificateUrl);
        if (!response.ok) throw new Error(`FairPlay certificate fetch failed: HTTP ${response.status}`);
        this._certificate = await response.arrayBuffer();
        return this._certificate;
    }

    /** SPC (from CDM) -> POST license server -> CKC ArrayBuffer. */
    async _exchangeLicense(spcMessage) {
        if (!this.config.licenseUrl) {
            throw new Error('drm.fairplay.licenseUrl is required');
        }

        let body = spcMessage;
        let headers = Object.assign(
            { 'Content-Type': 'application/octet-stream' },
            this.config.licenseHeaders || {}
        );
        if (typeof this.config.prepareLicenseRequest === 'function') {
            const prepared = this.config.prepareLicenseRequest(spcMessage) || {};
            if (prepared.body !== undefined) body = prepared.body;
            if (prepared.headers) headers = Object.assign(headers, prepared.headers);
        }

        const response = await fetch(this.config.licenseUrl, { method: 'POST', headers, body });
        if (!response.ok) throw new Error(`FairPlay license request failed: HTTP ${response.status}`);

        if (typeof this.config.parseLicenseResponse === 'function') {
            return this.config.parseLicenseResponse(response);
        }
        return response.arrayBuffer();
    }
}

// ---- src/engine.js ----
/**
 * Zephyr Player — playback engine.
 *
 * Descends from video-lectures-fe's VideoPlayerModel (hls.js + native Safari
 * HLS with a fatal-error recovery ladder), extended with:
 *   - DRM: Widevine / PlayReady / ClearKey via hls.js EME, FairPlay via
 *     ZephyrFairPlay on the native path
 *   - backup-source failover after the recovery ladder is exhausted
 *   - full quality API (levels list, manual level lock, auto/ABR)
 */
class ZephyrEngine {
    constructor(player) {
        this.player = player;
        this.hls = null;
        this.fairplay = null;
        this.usingNative = false;
        this.currentUrl = null;
        this._networkRetries = 0;
        this._mediaRecoveries = 0;
        this._triedBackup = false;
    }

    load(src) {
        const url = src && src.hls;
        if (!url) {
            this.player._fatal('E_NO_SRC', 'No HLS source provided (settings.src.hls)');
            return;
        }
        this.currentUrl = url;

        const { video, settings } = this.player;
        const drm = settings.drm || {};
        const HlsCtor = window.Hls;
        const hlsJsUsable = Boolean(HlsCtor && HlsCtor.isSupported && HlsCtor.isSupported());
        const native = ZephyrUtils.hasNativeHls(video);

        // FairPlay only works on the native pipeline; Widevine/PlayReady only
        // on the MSE (hls.js) pipeline — pick accordingly, else prefer hls.js
        // for its ABR control, unless the integrator forces native on Apple.
        const preferNative =
            native &&
            (Boolean(drm.fairplay) ||
                !hlsJsUsable ||
                (settings.forceNativeHlsOnAppleDevices && ZephyrUtils.isAppleDevice()));

        if (preferNative) {
            this._loadNative(url, drm);
        } else if (hlsJsUsable) {
            this._loadHlsJs(HlsCtor, url);
        } else {
            this.player._fatal('E_UNSUPPORTED', 'HLS is not supported in this browser');
        }
    }

    _loadNative(url, drm) {
        this.usingNative = true;
        const video = this.player.video;
        if (drm.fairplay) {
            this.fairplay = new ZephyrFairPlay(this.player, drm.fairplay);
            this.fairplay.attach(video);
        }
        video.src = url;
        // Native path has no manifest event; synthesize it from metadata.
        video.addEventListener('loadedmetadata', () => {
            this.player.emit(ZephyrEvents.MANIFEST_LOADED, { native: true, url });
        }, { once: true });
    }

    _loadHlsJs(HlsCtor, url) {
        this.usingNative = false;
        const hls = (this.hls = new HlsCtor(this._buildHlsConfig()));
        this._wireHlsEvents(HlsCtor, hls, url);
        hls.loadSource(url);
        hls.attachMedia(this.player.video);
    }

    _buildHlsConfig() {
        const s = this.player.settings;
        const config = {
            enableWorker: true,
            lowLatencyMode: Boolean(s.lowLatencyMode),
            maxBufferLength: s.hlsJSMaxBufferLength,
            liveSyncDuration: s.hlsJSLiveSyncDuration,
            startLevel: s.hlsJSStartLevel,
            minAutoBitrate: s.hlsJSMinAutoBitrate,
            abrBandWidthFactor: s.hlsJSAbrBandWidthFactor,
            abrBandWidthUpFactor: s.hlsJSAbrBandWidthUpFactor,
            backBufferLength: s.isLive ? s.hlsJSLiveBackBufferLength : 90
        };

        const drm = s.drm || {};
        const drmSystems = {};
        if (drm.widevine) {
            drmSystems['com.widevine.alpha'] = {
                licenseUrl: drm.widevine.licenseUrl,
                serverCertificateUrl: drm.widevine.certificateUrl
            };
            // hls.js <= 1.4 used a flat key for Widevine; harmless on newer builds.
            config.widevineLicenseUrl = drm.widevine.licenseUrl;
        }
        if (drm.playready) {
            drmSystems['com.microsoft.playready'] = { licenseUrl: drm.playready.licenseUrl };
        }
        if (drm.clearkey) {
            drmSystems['org.w3.clearkey'] = { licenseUrl: drm.clearkey.licenseUrl };
        }
        if (Object.keys(drmSystems).length > 0) {
            config.emeEnabled = true;
            config.drmSystems = drmSystems;
            if (typeof drm.licenseXhrSetup === 'function') {
                config.licenseXhrSetup = drm.licenseXhrSetup;
            }
        }

        // Escape hatch: raw hls.js options win over everything above.
        return Object.assign(config, s.hlsConfig || {});
    }

    _wireHlsEvents(HlsCtor, hls, url) {
        const player = this.player;

        hls.on(HlsCtor.Events.MANIFEST_PARSED, (event, data) => {
            this._networkRetries = 0;
            player.emit(ZephyrEvents.MANIFEST_LOADED, { native: false, url, levels: data.levels });
            player.emit(ZephyrEvents.LEVELS_PARSED, { levels: this.getLevels() });
        });

        hls.on(HlsCtor.Events.LEVEL_SWITCHED, (event, data) => {
            const level = hls.levels && hls.levels[data.level];
            player.emit(ZephyrEvents.LEVEL_SWITCH, {
                index: data.level,
                height: level ? level.height : null,
                bitrate: level ? level.bitrate : null,
                auto: hls.autoLevelEnabled
            });
        });

        if (HlsCtor.Events.KEY_SYSTEM_SELECTED) {
            hls.on(HlsCtor.Events.KEY_SYSTEM_SELECTED, (event, data) => {
                player.emit(ZephyrEvents.DRM_KEY_SYSTEM_SELECTED, { keySystem: data && data.keySystem });
            });
        }

        hls.on(HlsCtor.Events.ERROR, (event, data) => {
            player.emit(ZephyrEvents.HLS_ERROR, {
                type: data.type,
                details: data.details,
                fatal: data.fatal
            });
            if (!data.fatal) {
                player.emit(ZephyrEvents.WARNING, { source: 'hls', details: data.details });
                return;
            }
            this._recoverFatal(HlsCtor, data);
        });
    }

    /**
     * Recovery ladder (same shape as the lecture player, plus failover):
     * network fatal -> retry startLoad (x3) -> backupSrc -> fatal error
     * media fatal   -> recoverMediaError (x2) -> backupSrc -> fatal error
     * anything else -> backupSrc -> fatal error
     */
    _recoverFatal(HlsCtor, data) {
        if (data.details && data.details.indexOf('keySystem') !== -1) {
            this.player.emit(ZephyrEvents.DRM_ERROR, { details: data.details });
        }
        if (data.type === HlsCtor.ErrorTypes.NETWORK_ERROR && this._networkRetries < 3) {
            this._networkRetries++;
            this.player.emit(ZephyrEvents.WARNING, {
                source: 'hls',
                message: `Network error, retrying (${this._networkRetries}/3)`
            });
            this.hls.startLoad();
        } else if (data.type === HlsCtor.ErrorTypes.MEDIA_ERROR && this._mediaRecoveries < 2) {
            this._mediaRecoveries++;
            this.player.emit(ZephyrEvents.WARNING, {
                source: 'hls',
                message: `Media error, recovering (${this._mediaRecoveries}/2)`
            });
            this.hls.recoverMediaError();
        } else {
            this._failover(data);
        }
    }

    _failover(data) {
        const backup = this.player.settings.backupSrc;
        const backupUrl = backup && backup.hls;
        if (backupUrl && !this._triedBackup && backupUrl !== this.currentUrl) {
            this._triedBackup = true;
            this._networkRetries = 0;
            this._mediaRecoveries = 0;
            this.player.emit(ZephyrEvents.SRC_FAILOVER, { from: this.currentUrl, to: backupUrl });
            this._teardownEngine();
            this.load(backup);
        } else {
            this.player._fatal(
                'E_PLAYBACK',
                'Playback failed and could not be recovered',
                { hls: data && data.details }
            );
        }
    }

    // ---- Quality / ABR API -------------------------------------------------

    /** [{index, height, bitrate, label}] sorted high -> low. Empty on native. */
    getLevels() {
        if (!this.hls || !this.hls.levels) return [];
        return this.hls.levels
            .map((level, index) => ({
                index,
                height: level.height,
                bitrate: level.bitrate,
                label: level.height ? `${level.height}p` : `${Math.round(level.bitrate / 1000)} kbps`
            }))
            .sort((a, b) => (b.height || 0) - (a.height || 0));
    }

    /** index of an hls.js level, or -1 for auto (ABR). */
    setLevel(index) {
        if (!this.hls) return;
        this.hls.currentLevel = index;
    }

    getCurrentLevel() {
        if (!this.hls) return { index: -1, auto: true };
        return { index: this.hls.currentLevel, auto: this.hls.autoLevelEnabled };
    }

    isAutoLevel() {
        return this.hls ? this.hls.autoLevelEnabled : true;
    }

    /** For live streams: jump to the live edge. */
    seekToLive() {
        const video = this.player.video;
        if (this.hls && typeof this.hls.liveSyncPosition === 'number') {
            video.currentTime = this.hls.liveSyncPosition;
        } else if (video.seekable && video.seekable.length > 0) {
            video.currentTime = video.seekable.end(video.seekable.length - 1);
        }
    }

    _teardownEngine() {
        if (this.hls) {
            this.hls.destroy();
            this.hls = null;
        }
        if (this.fairplay) {
            this.fairplay.detach();
            this.fairplay = null;
        }
    }

    destroy() {
        this._teardownEngine();
        this.currentUrl = null;
    }
}

// ---- src/headless.js ----
/**
 * Zephyr Player — headless mode: the engine without the chrome.
 *
 * For surfaces that render their own UI around an existing <video> element
 * (reels/shorts feeds, background previews, thumbnails-on-hover), the full
 * player's control bar, overlays and container ownership are unwanted — but
 * the engine's HLS wiring, DRM, recovery ladder and backup failover are not.
 *
 *   const engine = Zephyr.headless(videoElement, {
 *       src: { hls: url },
 *       hlsJSMaxBufferLength: 15,            // same setting names as Zephyr
 *       hlsConfig: { capLevelToPlayerSize: true }
 *   });
 *   engine.on('error', retry);               // fires only after the internal
 *   engine.load();                           // recovery ladder is exhausted
 *   ...
 *   engine.destroy();
 *
 * Headless emits the engine-level events only (hlsmanifestloaded,
 * levelsparsed, levelswitch, hlserror, srcfailover, drm*, error, warning,
 * destroycompleted). Media-element events (play/pause/timeupdate/...) are the
 * caller's business — they own the <video>.
 */

const ZEPHYR_HEADLESS_DEFAULTS = {
    src: null,
    backupSrc: null,
    isLive: false,
    lowLatencyMode: false,
    forceNativeHlsOnAppleDevices: false,
    hlsJSMaxBufferLength: 30,
    hlsJSLiveSyncDuration: 12,
    hlsJSStartLevel: -1,
    hlsJSMinAutoBitrate: 0,
    hlsJSAbrBandWidthFactor: 0.95,
    hlsJSAbrBandWidthUpFactor: 0.7,
    hlsJSLiveBackBufferLength: 0,
    hlsConfig: null,
    drm: null
};

class ZephyrHeadless {
    constructor(videoElement, settings) {
        if (!videoElement || String(videoElement.tagName).toUpperCase() !== 'VIDEO') {
            throw new Error('Zephyr.headless: first argument must be a <video> element');
        }
        this.video = videoElement;
        this.settings = ZephyrUtils.deepMerge(ZEPHYR_HEADLESS_DEFAULTS, settings || {});
        this.emitter = new ZephyrEmitter();
        this.engine = new ZephyrEngine(this);
        this._destroyed = false;
        this._onNativeError = null;
    }

    // ---- player-shim surface ZephyrEngine expects ---------------------------

    emit(name, data) {
        if (!this._destroyed) this.emitter.emit(name, data);
    }

    _fatal(code, message, detail) {
        this.emit(ZephyrEvents.ERROR, { code, message, detail: detail || null });
    }

    // ---- events ---------------------------------------------------------------

    on(name, callback) { this.emitter.on(name, callback); return this; }
    off(name, callback) { this.emitter.off(name, callback); return this; }
    once(name, callback) { this.emitter.once(name, callback); return this; }

    // ---- lifecycle ------------------------------------------------------------

    /** Load settings.src (or an explicit {hls: url} override). */
    load(src) {
        if (src) this.settings.src = src;
        this.engine.load(this.settings.src);
        // On the native pipeline the full player routes <video> errors into
        // the engine's failover; replicate that here.
        if (this.engine.usingNative && !this._onNativeError) {
            this._onNativeError = () => {
                const mediaError = this.video.error;
                if (this.engine.usingNative && mediaError) {
                    this.engine._failover({ details: `native:${mediaError.code}` });
                }
            };
            this.video.addEventListener('error', this._onNativeError);
        }
        return this;
    }

    // ---- engine API pass-through ------------------------------------------------

    getLevels() { return this.engine.getLevels(); }
    setLevel(index) { this.engine.setLevel(index); }
    getCurrentLevel() { return this.engine.getCurrentLevel(); }
    seekToLive() { this.engine.seekToLive(); }
    isNative() { return this.engine.usingNative; }
    /** The underlying hls.js instance (null on the native pipeline). */
    getHls() { return this.engine.hls; }

    /** Detach from the video element. Never removes or rewrites the caller's <video>. */
    destroy() {
        if (this._destroyed) return;
        if (this._onNativeError) {
            this.video.removeEventListener('error', this._onNativeError);
            this._onNativeError = null;
        }
        this.engine.destroy();
        this.emitter.emit(ZephyrEvents.DESTROY_COMPLETED, {});
        this.emitter.removeAll();
        this._destroyed = true;
    }
}

// ---- src/ads.js ----
/**
 * Zephyr Player — Google IMA (client-side ad insertion) + ad-blocker detection.
 *
 * The IMA SDK must be loaded by the page:
 *   <script src="https://imasdk.googleapis.com/js/sdkloader/ima3.js"></script>
 *
 * Config (settings.ads):
 *   {
 *     adTagUrl: 'https://pubads.g.doubleclick.net/gampad/ads?...',  // VAST/VMAP
 *     showAdOnPlay: true,               // start ads with first playback
 *     adBlockerDetection: true,
 *     adBlockerDetectedMessage: 'Please disable your ad blocker.',
 *     locale: 'en',
 *   }
 *
 * Degrades gracefully: without adTagUrl or the IMA SDK, content plays with a
 * WARNING event instead of ads.
 */
class ZephyrAds {
    constructor(player) {
        this.player = player;
        this.settings = player.settings.ads || null;
        this.adContainer = null;
        this.adDisplayContainer = null;
        this.adsLoader = null;
        this.adsManager = null;
        this._displayInitialized = false;
        this._started = false;
        this._adPlaying = false;
        this._resumeContent = null;
    }

    init() {
        const s = this.settings;
        if (!s) return;

        if (s.adBlockerDetection) {
            ZephyrUtils.detectAdBlocker().then((blocked) => {
                // The bait may survive but the IMA SDK itself be blocked — both count.
                const imaBlocked = Boolean(s.adTagUrl) && !(window.google && window.google.ima);
                if (blocked || imaBlocked) {
                    this.player.emit(ZephyrEvents.AD_BLOCKER_DETECTED, { baitBlocked: blocked, imaBlocked });
                    if (s.adBlockerDetectedMessage) {
                        this.player.ui.showNotice(s.adBlockerDetectedMessage);
                    }
                }
            });
        }

        if (!s.adTagUrl) return;
        if (!(window.google && window.google.ima)) {
            this.player.emit(ZephyrEvents.WARNING, {
                source: 'ads',
                message: 'ads.adTagUrl set but the IMA SDK (ima3.js) is not loaded — skipping ads'
            });
            return;
        }

        this._setupIma();
    }

    _setupIma() {
        const ima = window.google.ima;
        const player = this.player;

        this.adContainer = ZephyrUtils.createEl('div', 'zephyr-ad-container');
        player.container.appendChild(this.adContainer);

        if (this.settings.locale) ima.settings.setLocale(this.settings.locale);
        ima.settings.setDisableCustomPlaybackForIOS10Plus(true);

        this.adDisplayContainer = new ima.AdDisplayContainer(this.adContainer, player.video);
        this.adsLoader = new ima.AdsLoader(this.adDisplayContainer);

        this.adsLoader.addEventListener(
            ima.AdsManagerLoadedEvent.Type.ADS_MANAGER_LOADED,
            (event) => this._onAdsManagerLoaded(event),
            false
        );
        this.adsLoader.addEventListener(
            ima.AdErrorEvent.Type.AD_ERROR,
            (event) => this._onAdError(event),
            false
        );

        // Notify IMA when content finishes so post-rolls can play.
        player.video.addEventListener('ended', () => {
            if (this.adsLoader) this.adsLoader.contentComplete();
        });

        const request = new ima.AdsRequest();
        request.adTagUrl = this.settings.adTagUrl;
        const rect = player.container.getBoundingClientRect();
        request.linearAdSlotWidth = Math.round(rect.width) || 640;
        request.linearAdSlotHeight = Math.round(rect.height) || 360;
        request.nonLinearAdSlotWidth = request.linearAdSlotWidth;
        request.nonLinearAdSlotHeight = Math.round(request.linearAdSlotHeight / 3);
        this.adsLoader.requestAds(request);
    }

    _onAdsManagerLoaded(event) {
        const ima = window.google.ima;
        const player = this.player;

        const renderingSettings = new ima.AdsRenderingSettings();
        renderingSettings.restoreCustomPlaybackStateOnAdBreakComplete = true;
        renderingSettings.enablePreloading = true;

        this.adsManager = event.getAdsManager(player.video, renderingSettings);
        const Events = ima.AdEvent.Type;

        const forward = (imaType, zephyrEvent) => {
            this.adsManager.addEventListener(imaType, (adEvent) => {
                const ad = adEvent.getAd && adEvent.getAd();
                player.emit(zephyrEvent, {
                    adId: ad && ad.getAdId ? ad.getAdId() : null,
                    title: ad && ad.getTitle ? ad.getTitle() : null
                });
            });
        };
        forward(Events.LOADED, ZephyrEvents.AD_LOADED);
        forward(Events.STARTED, ZephyrEvents.AD_STARTED);
        forward(Events.FIRST_QUARTILE, ZephyrEvents.AD_FIRST_QUARTILE);
        forward(Events.MIDPOINT, ZephyrEvents.AD_MIDPOINT);
        forward(Events.THIRD_QUARTILE, ZephyrEvents.AD_THIRD_QUARTILE);
        forward(Events.COMPLETE, ZephyrEvents.AD_COMPLETE);
        forward(Events.SKIPPED, ZephyrEvents.AD_SKIPPED);
        forward(Events.CLICK, ZephyrEvents.AD_CLICK);
        forward(Events.ALL_ADS_COMPLETED, ZephyrEvents.ADS_ALL_COMPLETED);

        this.adsManager.addEventListener(Events.CONTENT_PAUSE_REQUESTED, () => {
            this._adPlaying = true;
            this.adContainer.classList.add('zephyr-ad-container--active');
            player.ui.setAdMode(true);
            player.video.pause();
        });
        this.adsManager.addEventListener(Events.CONTENT_RESUME_REQUESTED, () => {
            this._adPlaying = false;
            this.adContainer.classList.remove('zephyr-ad-container--active');
            player.ui.setAdMode(false);
            if (!player.video.ended) player.video.play();
        });
        this.adsManager.addEventListener(
            ima.AdErrorEvent.Type.AD_ERROR,
            (errorEvent) => this._onAdError(errorEvent)
        );

        if (this.settings.showAdOnPlay !== false) {
            // Start the pre-roll alongside the first play attempt.
            if (player.hasPlaybackStarted()) {
                this.start();
            } else {
                player.once(ZephyrEvents.PLAYING, () => this.start());
            }
        }
    }

    /** Kick off the loaded ad break (pre-roll). Safe to call once. */
    start() {
        if (this._started || !this.adsManager) return;
        this._started = true;
        const ima = window.google.ima;
        try {
            if (!this._displayInitialized) {
                this.adDisplayContainer.initialize();
                this._displayInitialized = true;
            }
            const rect = this.player.container.getBoundingClientRect();
            this.adsManager.init(
                Math.round(rect.width) || 640,
                Math.round(rect.height) || 360,
                ima.ViewMode.NORMAL
            );
            this.adsManager.start();
        } catch (err) {
            this._onAdError(err);
        }
    }

    resize() {
        if (!this.adsManager || !(window.google && window.google.ima)) return;
        const rect = this.player.container.getBoundingClientRect();
        this.adsManager.resize(
            Math.round(rect.width),
            Math.round(rect.height),
            window.google.ima.ViewMode.NORMAL
        );
    }

    isAdPlaying() {
        return this._adPlaying;
    }

    _onAdError(event) {
        const error = event && event.getError ? event.getError() : event;
        this.player.emit(ZephyrEvents.AD_ERROR, {
            message: error && error.getMessage ? error.getMessage() : String(error)
        });
        // Ads must never block content.
        this._adPlaying = false;
        if (this.adContainer) this.adContainer.classList.remove('zephyr-ad-container--active');
        this.player.ui.setAdMode(false);
        if (this.adsManager) {
            this.adsManager.destroy();
            this.adsManager = null;
        }
        if (!this.player.video.ended && this.player.video.paused) {
            this.player.video.play().catch(() => {});
        }
    }

    destroy() {
        if (this.adsManager) this.adsManager.destroy();
        if (this.adsLoader) this.adsLoader.destroy();
        if (this.adDisplayContainer) this.adDisplayContainer.destroy();
        if (this.adContainer) this.adContainer.remove();
        this.adsManager = null;
        this.adsLoader = null;
        this.adDisplayContainer = null;
        this.adContainer = null;
    }
}

// ---- src/cast.js ----
/**
 * Zephyr Player — remote playback: Google Cast (Chromecast) + AirPlay.
 *
 * Chromecast requires the sender SDK loaded by the page:
 *   <script src="https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1"></script>
 * (Google's sender loader is unversioned, so it cannot carry an SRI hash.)
 *
 * AirPlay uses Safari's native WebKit APIs and needs no SDK.
 * Both degrade to hidden buttons when unavailable.
 */
class ZephyrCast {
    constructor(player) {
        this.player = player;
        this.castContext = null;
        this.castAvailable = false;
        this.airplayAvailable = false;
        this._remotePlayer = null;
        this._remoteController = null;
    }

    init() {
        const settings = this.player.settings;
        if (settings.airplay) this._initAirPlay();
        if (settings.googleCast) this._initChromecast();
    }

    // ---- AirPlay -----------------------------------------------------------

    _initAirPlay() {
        const video = this.player.video;
        if (!window.WebKitPlaybackTargetAvailabilityEvent) return;

        video.addEventListener('webkitplaybacktargetavailabilitychanged', (event) => {
            this.airplayAvailable = event.availability === 'available';
            this.player.emit(ZephyrEvents.AIRPLAY_AVAILABLE, { available: this.airplayAvailable });
            this.player.ui.setAirPlayAvailable(this.airplayAvailable);
        });
        video.addEventListener('webkitcurrentplaybacktargetiswirelesschanged', () => {
            const active = Boolean(video.webkitCurrentPlaybackTargetIsWireless);
            this.player.emit(ZephyrEvents.AIRPLAY_ACTIVE, { active });
        });
    }

    showAirPlayPicker() {
        const video = this.player.video;
        if (video.webkitShowPlaybackTargetPicker) {
            video.webkitShowPlaybackTargetPicker();
        }
    }

    // ---- Chromecast ----------------------------------------------------------

    _initChromecast() {
        // The framework may load after us; Google exposes this callback hook.
        if (window.cast && window.cast.framework) {
            this._setupCastContext();
        } else {
            const previous = window.__onGCastApiAvailable;
            window.__onGCastApiAvailable = (isAvailable) => {
                if (typeof previous === 'function') previous(isAvailable);
                if (isAvailable) this._setupCastContext();
            };
        }
    }

    _setupCastContext() {
        const cast = window.cast;
        const chromeCast = window.chrome && window.chrome.cast;
        if (!cast || !cast.framework || !chromeCast) return;

        this.castContext = cast.framework.CastContext.getInstance();
        this.castContext.setOptions({
            receiverApplicationId:
                (this.player.settings.cast && this.player.settings.cast.receiverApplicationId) ||
                chromeCast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
            autoJoinPolicy: chromeCast.AutoJoinPolicy.ORIGIN_SCOPED
        });

        this.castAvailable = true;
        this.player.emit(ZephyrEvents.CAST_AVAILABLE, { available: true });
        this.player.ui.setCastAvailable(true);

        this._remotePlayer = new cast.framework.RemotePlayer();
        this._remoteController = new cast.framework.RemotePlayerController(this._remotePlayer);
        this._remoteController.addEventListener(
            cast.framework.RemotePlayerEventType.IS_CONNECTED_CHANGED,
            () => {
                if (this._remotePlayer.isConnected) {
                    this.player.emit(ZephyrEvents.CAST_CONNECTED, {
                        device: this._deviceName()
                    });
                    this.player.video.pause();
                } else {
                    this.player.emit(ZephyrEvents.CAST_DISCONNECTED, {});
                }
            }
        );
    }

    _deviceName() {
        const session = this.castContext && this.castContext.getCurrentSession();
        return session ? session.getCastDevice().friendlyName : null;
    }

    /** Open the device picker; on success, hand the current stream to the receiver. */
    requestCast() {
        if (!this.castContext) return;
        this.castContext
            .requestSession()
            .then(() => this._loadRemoteMedia())
            .catch((err) => {
                // 'cancel' = user closed the picker; not an error.
                if (err !== 'cancel') {
                    this.player.emit(ZephyrEvents.WARNING, { source: 'cast', message: String(err) });
                }
            });
    }

    _loadRemoteMedia() {
        const chromeCast = window.chrome.cast;
        const session = this.castContext.getCurrentSession();
        if (!session) return;

        const url = this.player.engine.currentUrl;
        const mediaInfo = new chromeCast.media.MediaInfo(url, 'application/x-mpegurl');
        mediaInfo.metadata = new chromeCast.media.GenericMediaMetadata();
        mediaInfo.metadata.title = this.player.settings.title || document.title;
        // Receivers that handle license acquisition read it from customData.
        const castSettings = this.player.settings.cast || {};
        if (castSettings.customData || this.player.settings.drm) {
            mediaInfo.customData = castSettings.customData || { drm: this.player.settings.drm };
        }

        const request = new chromeCast.media.LoadRequest(mediaInfo);
        request.currentTime = this.player.getCurrentTime();
        request.autoplay = true;
        return session.loadMedia(request);
    }

    destroy() {
        if (this.castContext) {
            const session = this.castContext.getCurrentSession();
            if (session) session.endSession(false);
        }
        this.castContext = null;
        this._remotePlayer = null;
        this._remoteController = null;
    }
}

// ---- src/analytics.js ----
/**
 * Zephyr Player — analytics + QoE.
 *
 *   - forwards every player event to a pluggable adapter and/or GTM dataLayer
 *   - tracks QoE: startup time, rebuffer count/duration, watch time, bitrate
 *   - emits a periodic HEARTBEAT (position + QoE + session id) — the hook for
 *     concurrency enforcement and server-side watch tracking
 *   - integrates MUX Data when the page loads mux-embed and settings.mux is set
 *
 * Config:
 *   settings.analytics = {
 *     adapter: (eventName, data) => {},   // your own sink (Firebase/GA/etc.)
 *     dataLayerEvents: true,              // push {event: 'zephyr:<name>'} to window.dataLayer
 *     heartbeatInterval: 30,              // seconds; 0 disables
 *   }
 *   settings.mux = { envKey: '...', metadata: { video_title: '...' } }
 */
class ZephyrAnalytics {
    constructor(player) {
        this.player = player;
        this.sessionId = ZephyrUtils.uuid();
        this._heartbeatTimer = null;
        this._initTime = performance.now();
        this._startupTime = null;      // ms from init() to first 'playing'
        this._rebufferCount = 0;
        this._rebufferDuration = 0;    // ms
        this._rebufferStart = null;
        this._watchTime = 0;           // seconds actually played
        this._lastTimeUpdate = null;
        this._currentBitrate = null;
        this._playbackStarted = false;
        this._forwarder = null;
    }

    init() {
        const s = this.player.settings.analytics || {};

        // Forward the full event stream to integrator sinks.
        this._forwarder = (name, data) => {
            if (typeof s.adapter === 'function') {
                s.adapter(name, data);
            }
            if (s.dataLayerEvents && Array.isArray(window.dataLayer)) {
                window.dataLayer.push(Object.assign({ event: `zephyr:${name}` }, data || {}));
            }
        };
        this.player.on('*', this._forwarder);

        this._wireQoE();
        this._initMux();

        const interval = s.heartbeatInterval === undefined ? 30 : s.heartbeatInterval;
        if (interval > 0) this._startHeartbeat(interval);
    }

    _wireQoE() {
        const player = this.player;
        const video = player.video;

        player.on(ZephyrEvents.PLAYING, () => {
            if (!this._playbackStarted) {
                this._playbackStarted = true;
                this._startupTime = Math.round(performance.now() - this._initTime);
            }
            if (this._rebufferStart !== null) {
                const duration = performance.now() - this._rebufferStart;
                this._rebufferDuration += duration;
                this._rebufferStart = null;
                player.emit(ZephyrEvents.REBUFFER_END, { duration: Math.round(duration) });
            }
        });

        player.on(ZephyrEvents.WAITING, () => {
            // Only count stalls after startup, and never during seeks (UX noise, not QoE).
            if (this._playbackStarted && this._rebufferStart === null && !video.seeking) {
                this._rebufferStart = performance.now();
                this._rebufferCount++;
                player.emit(ZephyrEvents.REBUFFER_START, { count: this._rebufferCount });
            }
        });

        player.on(ZephyrEvents.LEVEL_SWITCH, (data) => {
            this._currentBitrate = data ? data.bitrate : null;
        });

        video.addEventListener('timeupdate', () => {
            const now = video.currentTime;
            if (this._lastTimeUpdate !== null && !video.paused && !video.seeking) {
                const delta = now - this._lastTimeUpdate;
                if (delta > 0 && delta < 2) this._watchTime += delta;
            }
            this._lastTimeUpdate = now;
        });
    }

    _initMux() {
        const muxSettings = this.player.settings.mux;
        if (!muxSettings || !muxSettings.envKey) return;
        if (!window.mux || typeof window.mux.monitor !== 'function') {
            this.player.emit(ZephyrEvents.WARNING, {
                source: 'analytics',
                message: 'settings.mux set but mux-embed is not loaded — skipping MUX Data'
            });
            return;
        }
        window.mux.monitor(this.player.video, {
            debug: Boolean(muxSettings.debug),
            hlsjs: this.player.engine.hls || undefined,
            Hls: window.Hls || undefined,
            data: Object.assign(
                {
                    env_key: muxSettings.envKey,
                    player_name: 'Zephyr',
                    player_version: ZEPHYR_VERSION,
                    view_session_id: this.sessionId
                },
                muxSettings.metadata || {}
            )
        });
    }

    _startHeartbeat(intervalSeconds) {
        this._heartbeatTimer = setInterval(() => {
            // Heartbeats only while actually playing — that is the concurrency contract.
            if (this.player.video.paused || this.player.video.ended) return;
            this.player.emit(ZephyrEvents.HEARTBEAT, this.getQoESnapshot());
        }, intervalSeconds * 1000);
    }

    getQoESnapshot() {
        const video = this.player.video;
        return {
            sessionId: this.sessionId,
            src: this.player.engine.currentUrl,
            live: Boolean(this.player.settings.isLive),
            position: Math.round(video.currentTime * 10) / 10,
            duration: isFinite(video.duration) ? Math.round(video.duration) : null,
            watchTime: Math.round(this._watchTime),
            startupTime: this._startupTime,
            rebufferCount: this._rebufferCount,
            rebufferDuration: Math.round(this._rebufferDuration),
            bitrate: this._currentBitrate,
            volume: video.muted ? 0 : video.volume,
            playbackRate: video.playbackRate,
            fullscreen: this.player.isFullscreen()
        };
    }

    destroy() {
        if (this._heartbeatTimer) clearInterval(this._heartbeatTimer);
        this._heartbeatTimer = null;
        if (this._forwarder) this.player.off('*', this._forwarder);
        this._forwarder = null;
    }
}

// ---- src/ui.js ----
/**
 * Zephyr Player — UI: control bar, menus, overlays, watermark, skin.
 *
 * The player injects its own stylesheet once per page, so a single
 * <script src="zephyr.js"> is fully self-contained (no separate CSS file).
 * Colors come from CSS custom properties set per-instance from settings.skin.
 */

const ZEPHYR_ICONS = {
    play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>',
    pause: '<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>',
    rewind: '<svg viewBox="0 0 24 24"><path d="M11 18V6l-8.5 6L11 18zm.5-6l8.5 6V6l-8.5 6z"/></svg>',
    forward: '<svg viewBox="0 0 24 24"><path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z"/></svg>',
    volume: '<svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>',
    muted: '<svg viewBox="0 0 24 24"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>',
    settings: '<svg viewBox="0 0 24 24"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>',
    pip: '<svg viewBox="0 0 24 24"><path d="M19 11h-8v6h8v-6zm4 8V4.98C23 3.88 22.1 3 21 3H3c-1.1 0-2 .88-2 1.98V19c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2zm-2 .02H3V4.97h18v14.05z"/></svg>',
    cast: '<svg viewBox="0 0 24 24"><path d="M1 18v3h3c0-1.66-1.34-3-3-3zm0-4v2c2.76 0 5 2.24 5 5h2c0-3.87-3.13-7-7-7zm0-4v2c4.97 0 9 4.03 9 9h2c0-6.08-4.93-11-11-11zm20-7H3c-1.1 0-2 .9-2 2v3h2V5h18v14h-7v2h7c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z"/></svg>',
    airplay: '<svg viewBox="0 0 24 24"><path d="M6 22h12l-6-6-6 6zM21 3H3c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h4v-2H3V5h18v10h-4v2h4c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z"/></svg>',
    fullscreen: '<svg viewBox="0 0 24 24"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>',
    fullscreenExit: '<svg viewBox="0 0 24 24"><path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/></svg>',
    captions: '<svg viewBox="0 0 24 24"><path d="M19 4H5c-1.11 0-2 .9-2 2v12c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm-8 7H9.5v-.5h-2v3h2V13H11v1c0 .55-.45 1-1 1H7c-.55 0-1-.45-1-1v-4c0-.55.45-1 1-1h3c.55 0 1 .45 1 1v1zm7 0h-1.5v-.5h-2v3h2V13H18v1c0 .55-.45 1-1 1h-3c-.55 0-1-.45-1-1v-4c0-.55.45-1 1-1h3c.55 0 1 .45 1 1v1z"/></svg>',
    share: '<svg viewBox="0 0 24 24"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z"/></svg>'
};

const ZEPHYR_CSS = `
.zephyr{position:relative;background:#000;overflow:hidden;width:100%;
  font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  --zephyr-accent:#ED5555;--zephyr-bg:rgba(0,0,0,.7);--zephyr-btn:#fff;
  -webkit-user-select:none;user-select:none;outline:none}
.zephyr video{width:100%;height:100%;display:block;background:#000}
.zephyr--autoheight video{height:auto}
.zephyr-controls{position:absolute;left:0;right:0;bottom:0;z-index:20;padding:28px 12px 8px;
  display:flex;flex-direction:column;gap:4px;
  background:linear-gradient(transparent,rgba(0,0,0,.75));
  opacity:1;transition:opacity .25s ease}
.zephyr--idle .zephyr-controls{opacity:0;pointer-events:none}
.zephyr--idle{cursor:none}
.zephyr-controls-row{display:flex;align-items:center;gap:2px}
.zephyr-btn{background:none;border:0;padding:6px;margin:0;cursor:pointer;border-radius:4px;
  width:36px;height:36px;display:inline-flex;align-items:center;justify-content:center;flex:none}
.zephyr-btn svg{width:22px;height:22px;fill:var(--zephyr-btn);pointer-events:none}
.zephyr-btn:hover{background:rgba(255,255,255,.15)}
.zephyr-btn:focus-visible{outline:2px solid var(--zephyr-accent)}
.zephyr-btn[hidden]{display:none}
.zephyr-time{color:var(--zephyr-btn);font-size:13px;font-variant-numeric:tabular-nums;
  margin:0 8px;white-space:nowrap}
.zephyr-live-badge{display:none;align-items:center;gap:6px;color:var(--zephyr-btn);font-size:12px;
  font-weight:700;letter-spacing:.08em;margin:0 8px;cursor:pointer;background:none;border:0;padding:4px 6px;border-radius:4px}
.zephyr-live-badge::before{content:"";width:8px;height:8px;border-radius:50%;background:var(--zephyr-accent)}
.zephyr-live-badge:hover{background:rgba(255,255,255,.15)}
.zephyr--live .zephyr-live-badge{display:inline-flex}
.zephyr--live .zephyr-time,.zephyr--live .zephyr-progress{display:none}
.zephyr-progress{flex:1;display:flex;align-items:center;height:20px;margin:0 4px}
.zephyr-progress input{width:100%;-webkit-appearance:none;appearance:none;height:4px;border-radius:2px;
  background:linear-gradient(to right,var(--zephyr-accent) var(--zephyr-played,0%),rgba(255,255,255,.3) var(--zephyr-played,0%));
  cursor:pointer;outline:none}
.zephyr-progress input::-webkit-slider-thumb{-webkit-appearance:none;width:13px;height:13px;border-radius:50%;
  background:var(--zephyr-accent);border:0}
.zephyr-progress input::-moz-range-thumb{width:13px;height:13px;border-radius:50%;background:var(--zephyr-accent);border:0}
.zephyr-volume{display:flex;align-items:center}
.zephyr-volume input{width:0;opacity:0;-webkit-appearance:none;appearance:none;height:4px;border-radius:2px;
  background:rgba(255,255,255,.3);cursor:pointer;transition:width .2s,opacity .2s;accent-color:var(--zephyr-accent)}
.zephyr-volume:hover input,.zephyr-volume input:focus-visible{width:64px;opacity:1;margin-right:6px}
.zephyr-volume input::-webkit-slider-thumb{-webkit-appearance:none;width:12px;height:12px;border-radius:50%;background:var(--zephyr-btn)}
.zephyr-spacer{flex:1}
.zephyr-menu{position:absolute;right:12px;bottom:56px;z-index:30;background:var(--zephyr-bg);
  border-radius:8px;padding:8px 0;min-width:180px;max-height:60%;overflow-y:auto;display:none}
.zephyr-menu--open{display:block}
.zephyr-menu-title{color:rgba(255,255,255,.6);font-size:11px;text-transform:uppercase;
  letter-spacing:.08em;padding:8px 16px 4px}
.zephyr-menu-item{display:flex;justify-content:space-between;align-items:center;width:100%;
  background:none;border:0;color:var(--zephyr-btn);font-size:13px;padding:8px 16px;cursor:pointer;text-align:left}
.zephyr-menu-item:hover{background:rgba(255,255,255,.12)}
.zephyr-menu-item--active::after{content:"\\2713";color:var(--zephyr-accent);font-weight:700;margin-left:12px}
.zephyr-bigplay{position:absolute;inset:0;margin:auto;width:76px;height:76px;z-index:15;
  border-radius:50%;border:0;background:var(--zephyr-bg);cursor:pointer;display:none;
  align-items:center;justify-content:center}
.zephyr-bigplay svg{width:40px;height:40px;fill:var(--zephyr-btn);margin-left:4px}
.zephyr-bigplay:hover{background:var(--zephyr-accent)}
.zephyr--bigplay .zephyr-bigplay{display:inline-flex}
.zephyr-spinner{position:absolute;inset:0;margin:auto;width:48px;height:48px;z-index:15;display:none;
  border:4px solid rgba(255,255,255,.25);border-top-color:var(--zephyr-accent);border-radius:50%;
  animation:zephyr-spin .8s linear infinite}
.zephyr--buffering .zephyr-spinner{display:block}
@keyframes zephyr-spin{to{transform:rotate(360deg)}}
.zephyr-watermark{position:absolute;z-index:12;max-width:16%;max-height:14%;opacity:.85;pointer-events:none}
.zephyr-watermark--topleft{top:12px;left:12px}
.zephyr-watermark--topright{top:12px;right:12px}
.zephyr-watermark--bottomleft{bottom:60px;left:12px}
.zephyr-watermark--bottomright{bottom:60px;right:12px}
.zephyr-overlay{position:absolute;inset:0;z-index:40;display:none;align-items:center;justify-content:center;
  background:rgba(0,0,0,.85);color:#fff;font-size:15px;text-align:center;padding:24px}
.zephyr-overlay--visible{display:flex}
.zephyr-notice{position:absolute;top:12px;left:50%;transform:translateX(-50%);z-index:35;
  background:var(--zephyr-bg);color:#fff;font-size:13px;padding:8px 16px;border-radius:6px;
  display:none;max-width:80%}
.zephyr-notice--visible{display:block}
.zephyr-ad-container{position:absolute;inset:0;z-index:25;display:none}
.zephyr-ad-container--active{display:block}
.zephyr--admode .zephyr-controls,.zephyr--admode .zephyr-bigplay,.zephyr--admode .zephyr-watermark{display:none!important}
.zephyr:fullscreen{width:100%;height:100%}
.zephyr:fullscreen video{height:100%}
`;

class ZephyrUI {
    constructor(player) {
        this.player = player;
        this.controls = null;
        this._fadeTimer = null;
        this._noticeTimer = null;
        this._els = {};
    }

    static injectStyles() {
        if (document.getElementById('zephyr-styles')) return;
        const style = ZephyrUtils.createEl('style', null, { id: 'zephyr-styles' });
        style.textContent = ZEPHYR_CSS;
        document.head.appendChild(style);
    }

    build() {
        ZephyrUI.injectStyles();
        const player = this.player;
        const s = player.settings;
        const container = player.container;

        container.classList.add('zephyr');
        container.setAttribute('tabindex', '0');
        if (s.autoHeightMode) container.classList.add('zephyr--autoheight');
        if (s.isLive) container.classList.add('zephyr--live');

        const skin = s.skin || {};
        if (skin.accentColor) container.style.setProperty('--zephyr-accent', skin.accentColor);
        if (skin.backgroundColor) container.style.setProperty('--zephyr-bg', skin.backgroundColor);
        if (skin.buttonColor) container.style.setProperty('--zephyr-btn', skin.buttonColor);

        container.appendChild(player.video);
        this._buildOverlays();
        this._buildControls();
        this._bindContainerEvents();
        this._bindVideoEvents();
        this._bindKeyboard();
    }

    _buildOverlays() {
        const { container, settings } = this.player;

        this._els.spinner = ZephyrUtils.createEl('div', 'zephyr-spinner');
        container.appendChild(this._els.spinner);

        this._els.bigPlay = ZephyrUtils.createEl('button', 'zephyr-bigplay', { 'aria-label': 'Play' });
        this._els.bigPlay.innerHTML = ZEPHYR_ICONS.play;
        this._els.bigPlay.addEventListener('click', () => this.player.play());
        container.appendChild(this._els.bigPlay);

        this._els.notice = ZephyrUtils.createEl('div', 'zephyr-notice');
        container.appendChild(this._els.notice);

        this._els.errorOverlay = ZephyrUtils.createEl('div', 'zephyr-overlay');
        container.appendChild(this._els.errorOverlay);

        if (settings.logoWatermark) {
            const position = settings.logoPosition || 'topleft';
            const logo = ZephyrUtils.createEl('img', `zephyr-watermark zephyr-watermark--${position}`, {
                src: settings.logoWatermark,
                alt: ''
            });
            container.appendChild(logo);
        }
    }

    _button(icon, label, onClick) {
        const btn = ZephyrUtils.createEl('button', 'zephyr-btn', { 'aria-label': label, title: label });
        btn.innerHTML = ZEPHYR_ICONS[icon];
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            onClick();
        });
        return btn;
    }

    _buildControls() {
        const player = this.player;
        const s = player.settings;

        this.controls = ZephyrUtils.createEl('div', 'zephyr-controls');
        const row = ZephyrUtils.createEl('div', 'zephyr-controls-row');

        // Play / pause
        this._els.playBtn = this._button('play', 'Play', () => player.togglePlay());
        row.appendChild(this._els.playBtn);

        // Quick rewind / forward
        if (s.quickRewind) {
            row.appendChild(this._button('rewind', `Rewind ${s.quickRewind}s`, () =>
                player.seekTo(player.getCurrentTime() - s.quickRewind)));
        }
        if (s.quickForward && !s.isLive) {
            row.appendChild(this._button('forward', `Forward ${s.quickForward}s`, () =>
                player.seekTo(player.getCurrentTime() + s.quickForward)));
        }

        // Volume
        const volume = ZephyrUtils.createEl('div', 'zephyr-volume');
        this._els.muteBtn = this._button('volume', 'Mute', () => player.setMute(!player.video.muted));
        this._els.volumeSlider = ZephyrUtils.createEl('input', null, {
            type: 'range', min: '0', max: '1', step: '0.05', 'aria-label': 'Volume'
        });
        this._els.volumeSlider.addEventListener('input', (e) => {
            player.setMute(false);
            player.setVolume(parseFloat(e.target.value));
        });
        volume.appendChild(this._els.muteBtn);
        volume.appendChild(this._els.volumeSlider);
        row.appendChild(volume);

        // Time / live badge
        this._els.time = ZephyrUtils.createEl('span', 'zephyr-time');
        this._els.time.textContent = '0:00 / 0:00';
        row.appendChild(this._els.time);
        this._els.liveBadge = ZephyrUtils.createEl('button', 'zephyr-live-badge', { title: 'Go to live edge' });
        this._els.liveBadge.textContent = 'LIVE';
        this._els.liveBadge.addEventListener('click', () => player.engine.seekToLive());
        row.appendChild(this._els.liveBadge);

        // Progress
        const progress = ZephyrUtils.createEl('div', 'zephyr-progress');
        this._els.seekBar = ZephyrUtils.createEl('input', null, {
            type: 'range', min: '0', max: '100', step: '0.1', value: '0', 'aria-label': 'Seek'
        });
        this._els.seekBar.addEventListener('input', (e) => {
            const duration = player.getDuration();
            if (isFinite(duration) && duration > 0) {
                player.seekTo((parseFloat(e.target.value) / 100) * duration);
            }
        });
        progress.appendChild(this._els.seekBar);
        row.appendChild(progress);
        if (s.isLive) row.appendChild(ZephyrUtils.createEl('div', 'zephyr-spacer'));

        // Captions
        this._els.ccBtn = this._button('captions', 'Captions', () => this._toggleCaptions());
        this._els.ccBtn.hidden = true;
        row.appendChild(this._els.ccBtn);

        // Settings (quality / speed)
        this._els.settingsBtn = this._button('settings', 'Settings', () => this._toggleMenu());
        row.appendChild(this._els.settingsBtn);

        // Share
        if (s.sharing) {
            row.appendChild(this._button('share', 'Share', () => this._share()));
        }

        // PiP
        if (s.pip && (document.pictureInPictureEnabled || player.video.webkitSetPresentationMode)) {
            row.appendChild(this._button('pip', 'Picture in picture', () => player.togglePiP()));
        }

        // AirPlay / Cast (revealed when available)
        this._els.airplayBtn = this._button('airplay', 'AirPlay', () => player.cast.showAirPlayPicker());
        this._els.airplayBtn.hidden = true;
        row.appendChild(this._els.airplayBtn);
        this._els.castBtn = this._button('cast', 'Cast', () => player.cast.requestCast());
        this._els.castBtn.hidden = true;
        row.appendChild(this._els.castBtn);

        // Fullscreen
        this._els.fsBtn = this._button('fullscreen', 'Fullscreen', () => player.toggleFullscreen());
        row.appendChild(this._els.fsBtn);

        this.controls.appendChild(row);
        player.container.appendChild(this.controls);

        // Settings menu
        this._els.menu = ZephyrUtils.createEl('div', 'zephyr-menu');
        player.container.appendChild(this._els.menu);
        document.addEventListener('click', (e) => {
            if (this._els.menu.classList.contains('zephyr-menu--open') &&
                !this._els.menu.contains(e.target) && e.target !== this._els.settingsBtn) {
                this._els.menu.classList.remove('zephyr-menu--open');
            }
        });
    }

    // ---- Menu (quality + speed) ---------------------------------------------

    _toggleMenu() {
        const menu = this._els.menu;
        if (menu.classList.contains('zephyr-menu--open')) {
            menu.classList.remove('zephyr-menu--open');
            return;
        }
        this._renderMenu();
        menu.classList.add('zephyr-menu--open');
    }

    _renderMenu() {
        const player = this.player;
        const menu = this._els.menu;
        menu.innerHTML = '';

        const addItem = (parent, label, active, onClick) => {
            const item = ZephyrUtils.createEl('button',
                'zephyr-menu-item' + (active ? ' zephyr-menu-item--active' : ''));
            item.textContent = label;
            item.addEventListener('click', () => {
                onClick();
                menu.classList.remove('zephyr-menu--open');
            });
            parent.appendChild(item);
        };

        const levels = player.getLevels();
        if (levels.length > 0) {
            const title = ZephyrUtils.createEl('div', 'zephyr-menu-title');
            title.textContent = 'Quality';
            menu.appendChild(title);
            const current = player.engine.getCurrentLevel();
            addItem(menu, 'Auto', current.auto, () => player.setLevel(-1));
            levels.forEach((level) => {
                addItem(menu, level.label, !current.auto && current.index === level.index,
                    () => player.setLevel(level.index));
            });
        }

        const speeds = player.settings.speed;
        if (Array.isArray(speeds) && speeds.length > 0 && !player.settings.isLive) {
            const title = ZephyrUtils.createEl('div', 'zephyr-menu-title');
            title.textContent = 'Speed';
            menu.appendChild(title);
            speeds.forEach((rate) => {
                addItem(menu, rate === 1 ? 'Normal' : `${rate}x`, player.video.playbackRate === rate,
                    () => player.setPlaybackRate(rate));
            });
        }
    }

    _toggleCaptions() {
        const tracks = this.player.video.textTracks;
        if (!tracks || tracks.length === 0) return;
        let anyShowing = false;
        for (let i = 0; i < tracks.length; i++) {
            if (tracks[i].mode === 'showing') anyShowing = true;
        }
        for (let i = 0; i < tracks.length; i++) {
            tracks[i].mode = !anyShowing && i === 0 ? 'showing' : 'hidden';
        }
    }

    _share() {
        const data = { title: this.player.settings.title || document.title, url: window.location.href };
        if (navigator.share) {
            navigator.share(data).catch(() => {});
        } else if (navigator.clipboard) {
            navigator.clipboard.writeText(data.url)
                .then(() => this.showNotice('Link copied to clipboard'))
                .catch(() => {});
        }
    }

    // ---- Event wiring --------------------------------------------------------

    _bindContainerEvents() {
        const player = this.player;
        const container = player.container;

        const wake = () => {
            container.classList.remove('zephyr--idle');
            clearTimeout(this._fadeTimer);
            this._fadeTimer = setTimeout(() => {
                if (!player.video.paused && !this._els.menu.classList.contains('zephyr-menu--open')) {
                    container.classList.add('zephyr--idle');
                }
            }, player.settings.delayToFade);
        };
        container.addEventListener('mousemove', wake);
        container.addEventListener('touchstart', wake, { passive: true });

        player.video.addEventListener('click', () => {
            wake();
            player.togglePlay();
        });
        player.video.addEventListener('dblclick', () => player.toggleFullscreen());

        const onFsChange = () => {
            const fs = player.isFullscreen();
            this._els.fsBtn.innerHTML = fs ? ZEPHYR_ICONS.fullscreenExit : ZEPHYR_ICONS.fullscreen;
            player.emit(ZephyrEvents.FULLSCREEN_CHANGE, { fullscreen: fs });
            if (player.ads) player.ads.resize();
        };
        document.addEventListener('fullscreenchange', onFsChange);
        document.addEventListener('webkitfullscreenchange', onFsChange);
    }

    _bindVideoEvents() {
        const player = this.player;
        const video = player.video;
        const container = player.container;

        video.addEventListener('play', () => {
            this._els.playBtn.innerHTML = ZEPHYR_ICONS.pause;
            this._els.playBtn.setAttribute('aria-label', 'Pause');
            container.classList.remove('zephyr--bigplay');
        });
        video.addEventListener('pause', () => {
            this._els.playBtn.innerHTML = ZEPHYR_ICONS.play;
            this._els.playBtn.setAttribute('aria-label', 'Play');
            container.classList.remove('zephyr--idle');
        });
        video.addEventListener('waiting', () => container.classList.add('zephyr--buffering'));
        video.addEventListener('playing', () => container.classList.remove('zephyr--buffering'));
        video.addEventListener('canplay', () => container.classList.remove('zephyr--buffering'));

        video.addEventListener('timeupdate', () => this._updateTime());
        video.addEventListener('durationchange', () => this._updateTime());
        video.addEventListener('volumechange', () => this._updateVolume());
        this._updateVolume();

        video.addEventListener('enterpictureinpicture', () =>
            player.emit(ZephyrEvents.PIP_CHANGE, { pip: true }));
        video.addEventListener('leavepictureinpicture', () =>
            player.emit(ZephyrEvents.PIP_CHANGE, { pip: false }));

        if (video.textTracks) {
            const refreshCc = () => {
                this._els.ccBtn.hidden = video.textTracks.length === 0;
            };
            video.textTracks.addEventListener('addtrack', refreshCc);
            video.textTracks.addEventListener('removetrack', refreshCc);
        }
    }

    _bindKeyboard() {
        const player = this.player;
        player.container.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT') return;
            const s = player.settings;
            switch (e.key) {
                case ' ':
                case 'k':
                    e.preventDefault();
                    player.togglePlay();
                    break;
                case 'ArrowLeft':
                    e.preventDefault();
                    player.seekTo(player.getCurrentTime() - (s.quickRewind || 10));
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    player.seekTo(player.getCurrentTime() + (s.quickForward || 10));
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    player.setVolume(ZephyrUtils.clamp(player.getVolume() + 0.1, 0, 1));
                    break;
                case 'ArrowDown':
                    e.preventDefault();
                    player.setVolume(ZephyrUtils.clamp(player.getVolume() - 0.1, 0, 1));
                    break;
                case 'm':
                    player.setMute(!player.video.muted);
                    break;
                case 'f':
                    player.toggleFullscreen();
                    break;
                case 'p':
                    if (s.pip) player.togglePiP();
                    break;
            }
        });
    }

    _updateTime() {
        const video = this.player.video;
        const duration = video.duration;
        this._els.time.textContent =
            `${ZephyrUtils.formatTime(video.currentTime)} / ${ZephyrUtils.formatTime(duration)}`;
        if (isFinite(duration) && duration > 0) {
            const pct = (video.currentTime / duration) * 100;
            this._els.seekBar.value = String(pct);
            this._els.seekBar.style.setProperty('--zephyr-played', `${pct}%`);
            // Keep the played gradient in sync (the CSS var lives on the input's background)
            this._els.seekBar.style.background =
                `linear-gradient(to right, var(--zephyr-accent) ${pct}%, rgba(255,255,255,.3) ${pct}%)`;
        }
    }

    _updateVolume() {
        const video = this.player.video;
        const muted = video.muted || video.volume === 0;
        this._els.muteBtn.innerHTML = muted ? ZEPHYR_ICONS.muted : ZEPHYR_ICONS.volume;
        this._els.muteBtn.setAttribute('aria-label', muted ? 'Unmute' : 'Mute');
        this._els.volumeSlider.value = String(video.muted ? 0 : video.volume);
    }

    // ---- Hooks used by player + modules ---------------------------------------

    showBigPlay() {
        this.player.container.classList.add('zephyr--bigplay');
    }

    setAdMode(active) {
        this.player.container.classList.toggle('zephyr--admode', active);
    }

    setCastAvailable(available) {
        this._els.castBtn.hidden = !available;
    }

    setAirPlayAvailable(available) {
        this._els.airplayBtn.hidden = !available;
    }

    setControlsVisible(visible) {
        this.controls.style.display = visible ? '' : 'none';
    }

    showNotice(message, timeoutMs) {
        const notice = this._els.notice;
        notice.textContent = message;
        notice.classList.add('zephyr-notice--visible');
        clearTimeout(this._noticeTimer);
        this._noticeTimer = setTimeout(
            () => notice.classList.remove('zephyr-notice--visible'),
            timeoutMs || 5000
        );
    }

    showError(message) {
        this._els.errorOverlay.textContent = message;
        this._els.errorOverlay.classList.add('zephyr-overlay--visible');
        this.player.container.classList.remove('zephyr--buffering', 'zephyr--bigplay');
    }

    destroy() {
        clearTimeout(this._fadeTimer);
        clearTimeout(this._noticeTimer);
        // The container is emptied by the player; nothing else to release here.
    }
}

// ---- src/player.js ----
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
        this.video.crossOrigin = 'anonymous';

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

window.Zephyr = Zephyr;
window.ZephyrEvents = ZephyrEvents;
})(window, document);
