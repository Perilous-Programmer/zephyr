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
