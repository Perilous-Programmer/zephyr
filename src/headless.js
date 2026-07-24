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
