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
