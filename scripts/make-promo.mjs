/**
 * Промо-картинки 1920×1080 из docs/promo/promo.html (скриншоты — docs/screenshots).
 * Рендер в невидимом окне Electron (offscreen), на экране ничего не появляется.
 *
 *   pnpm promo   →   docs/promo/{hero,search,changes}.png
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { app, BrowserWindow } from 'electron';

const DIR = path.resolve(import.meta.dirname, '../docs/promo');
const SLIDES = ['hero', 'search', 'changes'];

app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1920,
    height: 1080,
    show: false,
    useContentSize: true,
    webPreferences: { offscreen: true },
  });
  win.webContents.setFrameRate(5);
  for (const slide of SLIDES) {
    await win.loadFile(path.join(DIR, 'promo.html'), { query: { slide } });
    // шрифты и картинки
    await win.webContents.executeJavaScript(
      `Promise.all([document.fonts.ready, ...[...document.images].map((i) => i.decode())]).then(() => new Promise((r) => setTimeout(r, 300)))`,
    );
    const img = await win.webContents.capturePage({ x: 0, y: 0, width: 1920, height: 1080 });
    const file = path.join(DIR, `${slide}.png`);
    writeFileSync(file, img.toPNG());
    console.log(`${slide}: ${img.getSize().width}×${img.getSize().height} → ${file}`);
  }
  app.quit();
});
