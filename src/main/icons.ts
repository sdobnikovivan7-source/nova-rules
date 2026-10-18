/** Иконки окна, трея и уведомлений (resources/icons, генерирует `pnpm icons`) */
import { nativeImage, type NativeImage } from 'electron';
import appPng from '../../resources/icons/icon.png?asset';
import trayBadge1x from '../../resources/icons/tray-badge.png?asset';
import trayBadge2x from '../../resources/icons/tray-badge@2x.png?asset';
import tray1x from '../../resources/icons/tray.png?asset';
import tray2x from '../../resources/icons/tray@2x.png?asset';

export const appIconPath = appPng;

/** 16 px и @2x — Windows сам выберет под масштаб экрана */
function multiScale(x1: string, x2: string): NativeImage {
  const img = nativeImage.createFromPath(x1);
  img.addRepresentation({ scaleFactor: 2, buffer: nativeImage.createFromPath(x2).toPNG() });
  return img;
}

let cache: { plain: NativeImage; badge: NativeImage } | null = null;

/** badge — с точкой: есть непросмотренные изменения */
export function trayIcon(badge: boolean): NativeImage {
  cache ??= {
    plain: multiScale(tray1x, tray2x),
    badge: multiScale(trayBadge1x, trayBadge2x),
  };
  return badge ? cache.badge : cache.plain;
}
