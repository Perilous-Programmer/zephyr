# Zephyr Player

A **global, dependency-light web player**. Plays HLS — live and on-demand — with adaptive bitrate, and includes DRM, ad insertion, casting and QoE analytics behind a single `window.Zephyr` global.

One script tag. No framework. No build step required for consumers.

## Features

| Capability | How |
|---|---|
| HLS + ABR | hls.js (MSE) with native Safari HLS fallback, tunable ABR (`hlsJS*` settings) |
| DRM | Widevine / PlayReady / ClearKey via hls.js EME; **FairPlay** natively on Safari (`src/drm.js`) |
| Ads | Google IMA (VAST/VMAP `adTagUrl`), ad-blocker detection, content pause/resume, quartile events |
| Casting | Chromecast (Cast sender framework) + AirPlay (WebKit) |
| QoE / analytics | Startup time, rebuffer count/duration, watch time, bitrate; periodic `heartbeat` (concurrency hook); pluggable adapter; GTM `dataLayer`; MUX Data integration |
| Failover | Automatic `backupSrc` switch after the network/media recovery ladder is exhausted |
| UI | Skinnable control bar (accent/background/button colors), settings menu (quality + speed), captions, PiP, fullscreen, quick rewind/forward, volume, live badge + go-to-live, watermark logo, sharing, keyboard shortcuts, auto-hiding controls |
| Autoplay policy | Detects rejection, retries muted, emits `autoplayfailure` / `autoplaymuted` |

## Quick start

One script — hls.js is bundled inside `dist/zephyr.js` (a page-provided `window.Hls` always wins over the bundled copy; use `dist/zephyr.core.js` to bring your own hls.js). Google's ima3.js / cast_sender.js are unversioned rolling loaders and cannot carry SRI — load them only if you need ads/cast.

```html
<script src="dist/zephyr.js"></script>

<div id="playerContainer"></div>
<script>
  const player = new Zephyr('playerContainer');
  player.on('playing', () => console.log('playing'));
  player.on('heartbeat', (qoe) => navigator.sendBeacon('/api/watch', JSON.stringify(qoe)));
  player.init({
    src: { hls: 'https://example.com/master.m3u8' },
    backupSrc: { hls: 'https://backup.example.com/master.m3u8' },
    autoplay: true,
    skin: { accentColor: '#ED5555' },
    drm: {
      widevine: { licenseUrl: 'https://license.example.com/wv' },
      playready: { licenseUrl: 'https://license.example.com/pr' },
      fairplay: { certificateUrl: '/fairplay.cer', licenseUrl: 'https://license.example.com/fps' }
    },
    ads: { adTagUrl: 'https://pubads.g.doubleclick.net/gampad/ads?...', adBlockerDetection: true },
    googleCast: true,
    analytics: { heartbeatInterval: 30, adapter: (name, data) => myTracker(name, data) },
    mux: { envKey: 'MUX_ENV_KEY', metadata: { video_title: 'My Title' } }
  });
</script>
```

Try it: `npm run build && npm start` → http://localhost:8080/demo/

## Settings

All settings with defaults live in `ZEPHYR_DEFAULTS` ([src/player.js](src/player.js)). Highlights:

| Key | Default | Notes |
|---|---|---|
| `src` / `backupSrc` | — | `{ hls: url }`; backup is used for automatic failover |
| `autoplay`, `mutedAutoplayFallback` | `false`, `true` | muted retry on autoplay rejection |
| `crossOrigin` | `null` | `'anonymous'`/`'use-credentials'` on the `<video>`. Leave unset unless you need canvas capture or cross-origin `<track>` subtitles — see the CORS note below |
| `isLive` | `false` | live badge, go-to-live, hides progress/speed |
| `hlsJSMaxBufferLength`, `hlsJSLiveSyncDuration`, `hlsJSStartLevel`, `hlsJSMinAutoBitrate`, `hlsJSAbrBandWidthFactor`, `hlsJSAbrBandWidthUpFactor`, `hlsJSLiveBackBufferLength` | ABR tuning | mapped onto hls.js config; `hlsConfig: {}` is a raw escape hatch |
| `skin` | `{accentColor, backgroundColor, buttonColor}` | CSS custom properties |
| `quickRewind` / `quickForward` | `10` / `10` | seconds; `0`/`null` hides the button |
| `logoWatermark`, `logoPosition` | `null`, `'topleft'` | watermark image |
| `delayToFade` | `3000` | ms before controls auto-hide |
| `pip`, `sharing`, `airplay`, `googleCast` | `true`, `false`, `true`, `false` | feature toggles |
| `errorCustomText`, `errorOnlyShowCustomText` | set / `false` | viewer-facing error copy |
| `drm` | `null` | `widevine`/`playready`/`clearkey` (hls.js EME) + `fairplay` (native) |
| `ads` | `null` | `adTagUrl`, `showAdOnPlay`, `adBlockerDetection`, `adBlockerDetectedMessage`, `locale` |
| `analytics` | `null` | `adapter(name, data)`, `dataLayerEvents`, `heartbeatInterval` (s, `0` off) |
| `mux` | `null` | `envKey`, `metadata` (needs `mux-embed` on the page) |

### CORS and `crossOrigin`

The two playback pipelines have different CORS requirements, and the `crossOrigin` attribute only affects one of them:

- **hls.js / MSE** (Chrome, Firefox, Edge, and Safari unless FairPlay or `forceNativeHlsOnAppleDevices`): hls.js fetches the playlist and segments itself over XHR, so the origin must send `Access-Control-Allow-Origin` regardless. The `<video>` element's `src` is a `blob:` URL, so `crossOrigin` changes nothing here.
- **Native HLS** (Safari with FairPlay/forced-native, or wherever MSE is unavailable): the browser's media stack does the fetching. With `crossOrigin` **unset** it loads in no-cors mode and works against any origin. Setting it to `'anonymous'` switches the whole media load to CORS mode — the playlist, *every* segment and *every* key must then carry `Access-Control-Allow-Origin`, or playback fails with a bare `MEDIA_ERR_SRC_NOT_SUPPORTED`. Signed/token-gated origins (Nginx `secure_link`, CloudFront signed URLs) frequently don't.

So `crossOrigin` defaults to `null`. Set it only when the page draws the video to a `<canvas>` (thumbnails, scrubbing previews) or loads cross-origin `<track>` subtitles, and only once the origin actually sends CORS headers on the media.

## API

`new Zephyr(elementId)` → `player.init(settings)`

**Playback:** `play() pause() togglePlay() seekTo(sec) getCurrentTime() getDuration() setVolume(v) getVolume() setMute(bool) getMute() setPlaybackRate(r) getPlaybackRate() setSrc(src, backupSrc?)`
**Quality:** `getLevels()` → `[{index, height, bitrate, label}]`, `setLevel(index | -1 for auto)`, `getCurrentLevel()`
**UI/state:** `toggleFullscreen() isFullscreen() togglePiP() setControls(bool) hasPlaybackStarted() getQoESnapshot()`
**Events:** `on(name, cb) off(name, cb) once(name, cb)` (`one` is an alias for `once`), wildcard `on('*', (name, data) => …)`
**Teardown:** `destroy()` → emits `destroycompleted`

### Events

Lowercase strings (constants on `Zephyr.Events` / `window.ZephyrEvents`):

`ready srcchanged destroycompleted` · `playing pause ended seeking seeked timeupdate waiting volumechange ratechange autoplayfailure autoplaymuted` · `error warning` · `hlsmanifestloaded hlserror levelsparsed levelswitch srcfailover` · `drmkeysystemselected drmlicenseacquired drmerror` · `adblockerdetected adloaded adstarted adfirstquartile admidpoint adthirdquartile adcomplete adskipped adclick aderror adsallcompleted` · `castavailable castconnected castdisconnected airplayavailable airplayactive` · `fullscreenchange pipchange` · `rebufferstart rebufferend heartbeat`

## Headless mode (engine without UI)

For surfaces that own their UI and `<video>` element (reels/shorts feeds, hover previews), use the engine alone — HLS + ABR, DRM, the recovery ladder and `backupSrc` failover, with none of Zephyr's chrome:

```js
const engine = Zephyr.headless(videoElement, {
  src: { hls: url },
  hlsJSMaxBufferLength: 15,
  hlsConfig: { capLevelToPlayerSize: true }
});
engine.on('error', retry);   // fires only after internal recovery is exhausted
engine.load();
// engine.getLevels() / setLevel() / getCurrentLevel() / isNative() / getHls()
engine.destroy();            // detaches; never touches the caller's <video>
```

Headless emits engine-level events only (`hlsmanifestloaded`, `levelsparsed`, `levelswitch`, `hlserror`, `srcfailover`, `drm*`, `error`, `warning`, `destroycompleted`); media-element events stay on the caller's `<video>`.

## Migrating from Radiant Media Player

Zephyr's settings, methods and event names line up closely with RMP's, so most migrations are mechanical:

| RMP | Zephyr |
|---|---|
| `new RadiantMP(id)` + `rmp.init(settings)` | `new Zephyr(id)` + `player.init(settings)` |
| `licenseKey: '…'` | **delete** — no license key |
| `src: {hls}`, `backupSrc`, `hlsJS*`, `quickRewind/Forward`, `delayToFade`, `autoHeightMode`, `isLive`, `playsInline`, `initialVolume`, `srcChangeAutoplay`, `logoWatermark/logoPosition`, `googleCast`, `airplay`, `pip`, `sharing`, `adTagUrl/adBlockerDetection` | same names (ads keys move under `ads: {…}`) |
| `skin: "s2"`, `skinAccentColor: "ED5555"` | `skin: { accentColor: '#ED5555', … }` |
| `muxDataSettings` | `mux: { envKey, metadata }` |
| `rmp.on("playing"/"ready"/"hlserror"/…)` | identical event names |
| `rmp.getDuration()` (**ms**) | `player.getDuration()` (**seconds**) |
| `rmp.setVolume() setControls() destroy()` | same |

## Development

```
src/            events, utils, drm (FairPlay), engine (hls.js/native + EME),
                headless (engine-only mode), ads (IMA), cast (Chromecast/AirPlay),
                analytics (QoE/MUX), ui (controls/skin/overlays), player (main class)
vendor/         hls.min.js — pinned copy bundled into dist/zephyr.js
build.js        concatenates vendor + src/ (ordered) into dist/ — plain node, no deps
server.js       static dev server for the demo
demo/           demo page with a live event log
```

- `npm run build` — regenerates both `dist/zephyr.js` (hls.js bundled) and `dist/zephyr.core.js` (BYO hls.js); commit them, consumers use the files directly
- To update the vendored hls.js: `curl -o vendor/hls.min.js https://cdn.jsdelivr.net/npm/hls.js@<ver>/dist/hls.min.js`, verify its published SRI hash, rebuild
- `npm start` — serve; open http://localhost:8080/demo/
- Source files are classic scripts sharing one scope: **load order matters** and is defined once, in `build.js` (`ORDER`).
- No test framework yet; verify with the demo page (`node --check src/*.js` for syntax).

## Security notes

- Player CSS/DOM is built with `createElement`/`textContent`; `innerHTML` is only used for static built-in SVG icon constants — never for stream/API data.
- hls.js is vendored (`vendor/hls.min.js`, hash-verified against its jsdelivr release) and bundled at build time — no runtime CDN fetch at all. Google's IMA and Cast loaders are unversioned and cannot be SRI-pinned — a known, accepted property of those ecosystems; scope them to pages that need ads/casting.
- FairPlay/Widevine license URLs and headers are integrator-supplied; keep tokens short-lived.
