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
