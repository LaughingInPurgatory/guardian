// One-off generator for build/icon.png: renders the app icon with a canvas
// (same vector ship as the in-game sprite) and captures it via Electron's
// own offscreen rendering, so no image-editing tool or new dependency is
// needed. Run manually with `npx electron scripts/generate-icon.js` whenever
// the icon design changes; the output PNG is committed to the repo.
'use strict';
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const SIZE = 1024;

const html = `<!doctype html><html><head><style>
html,body{margin:0;background:transparent;}
</style></head><body>
<canvas id="c" width="${SIZE}" height="${SIZE}"></canvas>
<script>
const ctx = document.getElementById('c').getContext('2d');
const s = ${SIZE};
const cx = s / 2, cy = s / 2, r = s * 0.46;

const bg = ctx.createRadialGradient(cx, cy * 0.85, r * 0.1, cx, cy, r);
bg.addColorStop(0, '#152552');
bg.addColorStop(1, '#050014');
ctx.fillStyle = bg;
ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();

ctx.strokeStyle = '#4df0ff';
ctx.lineWidth = s * 0.02;
ctx.beginPath(); ctx.arc(cx, cy, r * 0.93, 0, Math.PI * 2); ctx.stroke();

ctx.save();
ctx.translate(cx, cy * 1.02);
const k = s / 40;
ctx.scale(k, k);
ctx.strokeStyle = '#0a1420';
ctx.fillStyle = '#dffaff';
ctx.lineWidth = 16 / k;
ctx.beginPath();
ctx.moveTo(18, 0);
ctx.lineTo(8, -3);
ctx.lineTo(2, -11);
ctx.lineTo(-6, -6);
ctx.lineTo(-14, -3);
ctx.lineTo(-10, 0);
ctx.lineTo(-14, 3);
ctx.lineTo(-6, 6);
ctx.lineTo(2, 11);
ctx.lineTo(8, 3);
ctx.closePath();
ctx.fill();
ctx.stroke();

ctx.fillStyle = '#152552';
ctx.beginPath();
ctx.ellipse(6, 0, 3.6, 2.4, 0, 0, Math.PI * 2);
ctx.fill();
ctx.restore();
<\/script>
</body></html>`;

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: SIZE,
    height: SIZE,
    useContentSize: true,
    show: false,
    transparent: true,
    backgroundColor: '#00000000',
    webPreferences: { offscreen: false },
  });
  win.setContentSize(SIZE, SIZE);
  await win.loadURL('data:text/html,' + encodeURIComponent(html));
  await new Promise((resolve) => setTimeout(resolve, 150));
  const image = await win.webContents.capturePage();
  const resized = image.resize({ width: SIZE, height: SIZE });
  const outDir = path.join(__dirname, '..', 'build');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'icon.png'), resized.toPNG());
  app.quit();
});
