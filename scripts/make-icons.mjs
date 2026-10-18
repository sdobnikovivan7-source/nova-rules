/**
 * Иконки приложения и трея из SVG (нейтральные: жёлтый квадрат с книгой lucide BookOpen,
 * без логотипа NOVA RP). SVG рисуется в скрытом окне Electron и сохраняется в PNG / ICO.
 *
 *   pnpm icons   →   resources/icons/{icon.ico, icon.png, tray*.png}
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { app, BrowserWindow } from 'electron';

const OUT = path.resolve(import.meta.dirname, '../resources/icons');
const ACCENT = '#FFC800';
const INK = '#141414';
const BADGE = '#F2706C';

/** Книга lucide BookOpen (24×24) */
const BOOK =
  '<path d="M12 5v16"/><path d="M20.001 19A2 2 0 0022 17V5a2 2 0 00-1.999-2L16 3.002A5 5 0 0012 5a5 5 0 00-4-2H4a2 2 0 00-2 2v12a2 2 0 001.999 2H8a5 5 0 014 2 5 5 0 014-2z"/>';

function svg(size, { badge = false } = {}) {
  // на мелких размерах линии толще, иначе книга расплывается
  const stroke = size <= 16 ? 2.9 : size <= 32 ? 2.5 : 2.1;
  const pad = size <= 16 ? 0 : size * 0.04;
  const r = size * 0.22;
  const inner = size - pad * 2;
  const glyph = inner * 0.66;
  const g = (inner - glyph) / 2 + pad;
  const dot = size * 0.36;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect x="${pad}" y="${pad}" width="${inner}" height="${inner}" rx="${r}" fill="${ACCENT}"/>
  <svg x="${g}" y="${g}" width="${glyph}" height="${glyph}" viewBox="0 0 24 24" fill="none" stroke="${INK}" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">${BOOK}</svg>
  ${badge ? `<circle cx="${size - dot / 2}" cy="${dot / 2}" r="${dot / 2}" fill="${BADGE}" stroke="${INK}" stroke-width="${Math.max(1, size / 16)}"/>` : ''}
</svg>`;
}

/** SVG → canvas → PNG внутри скрытой страницы (capturePage скрытого окна ненадёжен) */
async function render(win, size, opts) {
  const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg(size, opts))}`;
  const dataUrl = await win.webContents.executeJavaScript(`(async () => {
    const img = new Image();
    img.src = ${JSON.stringify(src)};
    await img.decode();
    const c = document.createElement('canvas');
    c.width = c.height = ${size};
    c.getContext('2d').drawImage(img, 0, 0, ${size}, ${size});
    return c.toDataURL('image/png');
  })()`);
  return Buffer.from(dataUrl.split(',')[1], 'base64');
}

/** ICO из PNG-кадров (Windows Vista+ читает PNG внутри ICO) */
function ico(frames) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(frames.length, 4);
  let offset = 6 + frames.length * 16;
  const entries = frames.map(({ size, png }) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0);
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(png.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += png.length;
    return e;
  });
  return Buffer.concat([header, ...entries, ...frames.map((f) => f.png)]);
}

// без top-level await: в ESM-точке входа Electron он задерживает событие ready
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false });
  await win.loadURL('about:blank');
  mkdirSync(OUT, { recursive: true });

  const out = (name, png) => {
    writeFileSync(path.join(OUT, name), png);
    console.log(`${name}: ${png.length} байт`);
  };

  // трей: 16 px и @2x для экранов со 200 %
  out('tray.png', await render(win, 16));
  out('tray@2x.png', await render(win, 32));
  out('tray-badge.png', await render(win, 16, { badge: true }));
  out('tray-badge@2x.png', await render(win, 32, { badge: true }));
  // окно, уведомления, установщик
  out('icon.png', await render(win, 256));
  const frames = [];
  for (const size of [16, 24, 32, 48, 64, 128, 256])
    frames.push({ size, png: await render(win, size) });
  out('icon.ico', ico(frames));

  app.quit();
});
