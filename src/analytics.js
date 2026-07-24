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
