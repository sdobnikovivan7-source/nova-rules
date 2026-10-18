/**
 * Картинки из правил (§5.11): renderer не ходит в сеть (CSP `img-src nova-img:`), а
 * запрашивает `nova-img://img/<base64url адреса>`. Main скачивает картинку один раз,
 * кладёт в %APPDATA%/NovaRules/images и дальше отдаёт с диска — офлайн тоже работает.
 */
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { net, protocol } from 'electron';
import log from 'electron-log/main';
import { isAllowedImage } from './urls';

export const IMG_SCHEME = 'nova-img';

const MAX_BYTES = 10 * 1024 * 1024;
const TIMEOUT_MS = 20_000;

const EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/bmp': 'bmp',
};
const MIME = Object.fromEntries(Object.entries(EXT).map(([m, e]) => [e, m]));

/** Вызывается до app.ready */
export function registerImageScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: IMG_SCHEME, privileges: { standard: true, secure: true } },
  ]);
}

const decode = (b64: string) => Buffer.from(b64, 'base64url').toString('utf8');

export function installImageProtocol(cacheDir: string): void {
  const inflight = new Map<string, Promise<{ data: Buffer; mime: string } | null>>();

  async function fromCache(key: string) {
    const files = await readdir(cacheDir).catch(() => [] as string[]);
    const name = files.find((f) => f.startsWith(`${key}.`));
    if (!name) return null;
    const ext = name.slice(key.length + 1);
    return { data: await readFile(path.join(cacheDir, name)), mime: MIME[ext] ?? 'image/png' };
  }

  async function download(url: string, key: string) {
    const res = await net.fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const mime = (res.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
    const ext = EXT[mime];
    if (!ext) throw new Error(`не картинка: ${mime || 'без типа'}`);
    const data = Buffer.from(await res.arrayBuffer());
    if (data.length > MAX_BYTES) throw new Error(`слишком большая: ${data.length} байт`);
    await mkdir(cacheDir, { recursive: true });
    // запись через временный файл: оборванная загрузка не оставит битый кеш
    const file = path.join(cacheDir, `${key}.${ext}`);
    await writeFile(`${file}.tmp`, data);
    await rename(`${file}.tmp`, file);
    return { data, mime };
  }

  async function load(url: string) {
    const key = createHash('sha1').update(url).digest('hex');
    const cached = await fromCache(key);
    if (cached) return cached;
    try {
      return await download(url, key);
    } catch (e) {
      log.warn(`картинка ${url}: ${(e as Error).message}`);
      return null;
    }
  }

  protocol.handle(IMG_SCHEME, async (req) => {
    const { hostname, pathname } = new URL(req.url);
    const url = hostname === 'img' ? decode(pathname.slice(1)) : '';
    if (!isAllowedImage(url)) return new Response(null, { status: 403 });

    let p = inflight.get(url);
    if (!p) {
      p = load(url).finally(() => inflight.delete(url));
      inflight.set(url, p);
    }
    const img = await p;
    if (!img) return new Response(null, { status: 404 });
    return new Response(new Uint8Array(img.data), {
      headers: { 'content-type': img.mime, 'cache-control': 'max-age=31536000' },
    });
  });
}
