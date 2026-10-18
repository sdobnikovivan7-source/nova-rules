/** Автообновление: статусы UpdateService на подменённом autoUpdater */
import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import type { UpdateStatus } from '../src/shared/ipc';
import { UpdateService, type UpdaterLike } from '../src/main/updater';

class FakeUpdater extends EventEmitter implements UpdaterLike {
  autoDownload = false;
  autoInstallOnAppQuit = false;
  checkForUpdates = vi.fn(async () => {
    this.emit('checking-for-update');
    return null;
  });
  quitAndInstall = vi.fn();
}

function setup() {
  const updater = new FakeUpdater();
  const seen: UpdateStatus[] = [];
  const service = new UpdateService({ updater, emit: (s) => seen.push(s), log: () => {} });
  return { updater, service, seen };
}

describe('UpdateService', () => {
  it('включает фоновое скачивание и установку при выходе', () => {
    const { updater } = setup();
    expect(updater.autoDownload).toBe(true);
    expect(updater.autoInstallOnAppQuit).toBe(true);
  });

  it('нет обновления → idle', async () => {
    const { updater, service, seen } = setup();
    await service.check();
    updater.emit('update-not-available');
    expect(seen.map((s) => s.state)).toEqual(['checking', 'idle']);
  });

  it('скачивание → готово → перезапуск', async () => {
    const { updater, service } = setup();
    await service.check();
    updater.emit('update-available', { version: '1.2.0' });
    updater.emit('download-progress', { percent: 41.7 });
    expect(service.get()).toEqual({ state: 'downloading', version: '1.2.0', percent: 42 });
    updater.emit('update-downloaded', { version: '1.2.0' });
    expect(service.get()).toEqual({ state: 'ready', version: '1.2.0' });
    service.install();
    expect(updater.quitAndInstall).toHaveBeenCalledWith(true, true);
  });

  it('после «готово» проверки и ошибки статус не сбрасывают', async () => {
    const { updater, service } = setup();
    updater.emit('update-downloaded', { version: '1.2.0' });
    await service.check();
    expect(updater.checkForUpdates).not.toHaveBeenCalled();
    updater.emit('error', new Error('net::ERR_INTERNET_DISCONNECTED'));
    expect(service.get().state).toBe('ready');
  });

  it('без готового обновления install ничего не делает', () => {
    const { updater, service } = setup();
    service.install();
    expect(updater.quitAndInstall).not.toHaveBeenCalled();
  });

  it('ошибка проверки (нет сети, нет релизов) → idle, без исключения', async () => {
    const { updater, service } = setup();
    updater.checkForUpdates.mockImplementationOnce(async () => {
      updater.emit('checking-for-update');
      throw new Error('404');
    });
    await expect(service.check()).resolves.toBeUndefined();
    expect(service.get().state).toBe('idle');
  });
});
