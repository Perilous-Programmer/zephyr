#!/usr/bin/env node
/**
 * Zephyr build: concatenate src/ modules (in dependency order) into a single
 * IIFE at dist/zephyr.js that exposes window.Zephyr + window.ZephyrEvents.
 * No bundler, no dependencies — mirrors the no-build-step philosophy of the
 * lecture player this project grew out of.
 */
const fs = require('fs');
const path = require('path');

const ORDER = [
    'events.js',
    'utils.js',
    'drm.js',
    'engine.js',
    'headless.js',
    'ads.js',
    'cast.js',
    'analytics.js',
    'ui.js',
    'player.js'
];

const srcDir = path.join(__dirname, 'src');
const outDir = path.join(__dirname, 'dist');

const version = (fs.readFileSync(path.join(srcDir, 'player.js'), 'utf8')
    .match(/ZEPHYR_VERSION = '([^']+)'/) || [])[1] || '0.0.0';

// Vendored hls.js — bundled into dist/zephyr.js so consumers need one script
// tag only. A page-provided window.Hls (any version) always wins over the
// bundled copy; the guard skips executing ours entirely in that case.
const hlsFile = path.join(__dirname, 'vendor', 'hls.min.js');
const hlsSource = fs.readFileSync(hlsFile, 'utf8')
    .replace(/\/\/# sourceMappingURL=.*\s*$/, ''); // no map is shipped
const hlsVersion = (hlsSource.match(/"(1\.\d+\.\d+)"/) || [])[1] || 'unknown';

const body = ORDER.map((name) => {
    const file = path.join(srcDir, name);
    if (!fs.existsSync(file)) {
        console.error(`build: missing src/${name}`);
        process.exit(1);
    }
    return `// ---- src/${name} ----\n${fs.readFileSync(file, 'utf8')}`;
}).join('\n');

const banner = `/*! Zephyr Player v${version} | HLS + DRM + IMA ads + Cast/AirPlay + QoE | MIT | bundles hls.js v${hlsVersion} (Apache-2.0) */`;

const zephyrIife = `(function (window, document) {
'use strict';
${body}
window.Zephyr = Zephyr;
window.ZephyrEvents = ZephyrEvents;
})(window, document);
`;

const bundle = `${banner}
// ---- vendor/hls.min.js (hls.js v${hlsVersion}) — skipped when the page already provides window.Hls ----
if (typeof window.Hls === 'undefined') {
${hlsSource}
}
${zephyrIife}`;

const core = `${banner.replace(' | bundles', ' | core build, BYO')}
${zephyrIife}`;

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'zephyr.js'), bundle);
fs.writeFileSync(path.join(outDir, 'zephyr.core.js'), core);
console.log(`build: dist/zephyr.js      (${(bundle.length / 1024).toFixed(1)} kB, v${version}, hls.js v${hlsVersion} bundled)`);
console.log(`build: dist/zephyr.core.js (${(core.length / 1024).toFixed(1)} kB, v${version}, no hls.js — bring your own)`);
