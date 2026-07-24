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
