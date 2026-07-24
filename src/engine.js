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
