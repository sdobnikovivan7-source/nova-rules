/**
 * Автообновление приложения (§11.2): electron-updater проверяет GitHub Releases при старте
 * и раз в 6 ч, скачивает в фоне; готово — в строке состояния «Доступна версия X —
 * перезапустить». Если приложением не пользуются (окна скрыты в трее) — ставится само:
 * тихая установка и запуск новой версии сразу в трей. Иначе — по кнопке или при выходе.
 * Работает только в собранном приложении (в dev обновлять нечего).
 */
import type { UpdateStatus } from '@shared/ipc';

const START_DELAY = 15_000;
const INTERVAL = 6 * 3_600_000;
/** Как часто смотреть, не пора ли поставить скачанное обновление */
const IDLE_CHECK = 30_000;
/** Сколько окна должны быть скрыты подряд: только что спрятал быстрый поиск — может открыть снова */
const IDLE_MIN = 2 * 60_000;

/** Нужная часть autoUpdater — в тестах подменяется */
export interface UpdaterLike {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  on(event: string, cb: (arg: unknown) => void): unknown;
  checkForUpdates(): Promise<unknown>;
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void;
}

type Deps = {
  updater: UpdaterLike;
  emit(status: UpdateStatus): void;
  log(level: 'info' | 'warn', msg: string): void;
  /** Приложением сейчас не пользуются — можно перезапустить незаметно */
  isIdle?(): boolean;
  /** Перед тихой установкой: новая версия должна запуститься свёрнутой в трей */
  beforeAutoInstall?(): void;
};

export class UpdateService {
  private status: UpdateStatus = { state: 'idle' };
  private timers: ReturnType<typeof setTimeout>[] = [];
  private idleSince: number | null = null;
  /** Одна попытка: если установщик не запустился, дальше — по кнопке или при выходе */
  private autoTried = false;

  constructor(private readonly deps: Deps) {
    const u = deps.updater;
    u.autoDownload = true;
    u.autoInstallOnAppQuit = true;
    u.on('checking-for-update', () => this.set({ state: 'checking' }));
    u.on('update-not-available', () => this.set({ state: 'idle' }));
    u.on('update-available', (info) =>
      this.set({
        state: 'downloading',
        version: (info as { version: string }).version,
        percent: 0,
      }),
    );
    u.on('download-progress', (p) =>
      this.set({
        ...this.status,
        state: 'downloading',
        percent: Math.round((p as { percent: number }).percent),
      }),
    );
    u.on('update-downloaded', (info) =>
      this.set({ state: 'ready', version: (info as { version: string }).version }),
    );
    u.on('error', (e) => {
      deps.log('warn', `обновление: ${(e as Error).message}`);
      // скачанное обновление ошибка следующей проверки не отменяет
      if (this.status.state !== 'ready') this.set({ state: 'idle' });
    });
  }

  get(): UpdateStatus {
    return this.status;
  }

  private set(s: UpdateStatus): void {
    // после «готово» повторные проверки статус не сбрасывают
    if (this.status.state === 'ready' && s.state !== 'ready') return;
    this.status = s;
    this.deps.emit(s);
  }

  /** Проверить сейчас; во время скачивания и после него — ничего не делать */
  async check(): Promise<void> {
    if (this.status.state === 'downloading' || this.status.state === 'ready') return;
    try {
      await this.deps.updater.checkForUpdates();
    } catch {
      // нет сети, нет релизов — не страшно, попробуем через 6 ч (в лог пишет событие error)
      if (this.status.state === 'checking') this.set({ state: 'idle' });
    }
  }

  /** Перезапустить с установкой; без готового обновления — ничего */
  install(): void {
    if (this.status.state !== 'ready') return;
    // тихая установка (как one-click) и запуск новой версии
    this.deps.updater.quitAndInstall(true, true);
  }

  /** Обновление готово и окна скрыты дольше IDLE_MIN — поставить само */
  autoInstallIfIdle(now = Date.now()): boolean {
    if (this.autoTried) return false;
    if (this.status.state !== 'ready' || !this.deps.isIdle?.()) {
      this.idleSince = null;
      return false;
    }
    this.idleSince ??= now;
    if (now - this.idleSince < IDLE_MIN) return false;
    this.deps.log('info', `обновление ${this.status.version}: окна скрыты — ставлю само`);
    this.autoTried = true;
    this.deps.beforeAutoInstall?.();
    this.deps.updater.quitAndInstall(true, true);
    return true;
  }

  schedule(): () => void {
    this.timers.push(setTimeout(() => void this.check(), START_DELAY));
    this.timers.push(setInterval(() => void this.check(), INTERVAL));
    this.timers.push(setInterval(() => this.autoInstallIfIdle(), IDLE_CHECK));
    return () => this.timers.forEach((t) => clearTimeout(t));
  }
}
