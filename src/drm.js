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
