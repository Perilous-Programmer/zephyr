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
