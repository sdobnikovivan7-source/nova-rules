/** Тип картинки по сигнатуре файла. Без Electron — тестируется в vitest. */
export function sniffImage(b: Uint8Array): string | undefined {
  const at = (off: number, s: string) =>
    b.length >= off + s.length && [...s].every((c, i) => b[off + i] === c.charCodeAt(0));
  if (at(0, '\x89PNG')) return 'image/png';
  if (at(0, '\xFF\xD8\xFF')) return 'image/jpeg';
  if (at(0, 'GIF8')) return 'image/gif';
  if (at(0, 'RIFF') && at(8, 'WEBP')) return 'image/webp';
  if (at(4, 'ftypavif')) return 'image/avif';
  if (at(0, 'BM')) return 'image/bmp';
  return undefined;
}
