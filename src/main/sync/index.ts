/**
 * Синхронизация (§7): выбор режима и состояние.
 *
 *   auto   — central; если central недоступен больше 3 суток — direct (не чаще раза в сутки).
 *            Как только central снова отвечает, его данные — эталон (перекачиваются целиком).
 *   direct — только с форума (вручную в настройках).
 *
 * Одновременно идёт только одна синхронизация: повторный вызов получает тот же промис.
 * Без Electron — все зависимости передаются снаружи, тестируется в vitest.
 */
import type { SyncMode, SyncStatus } from '@shared/ipc';
import type { ChangeEntry } from '@shared/schema';
import { BlockedError } from '../../scraper/http';
import { IntegrityError, SchemaVersionError } from '../data';
import type { Db } from '../db';
import {
  applyData,
  type DataInput,
  getChangeEntries,
  getDataVersion,
  getMeta,
  setMeta,
} from '../db/repo';
import { AppOutdatedError, CentralUnavailableError, fetchCentral, type Fetcher } from './central';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** Через сколько недоступности central включается direct */
export const DIRECT_FALLBACK_AFTER = 3 * DAY;
/** direct — не чаще раза в сутки (кроме ручного запуска в режиме direct) */
export const DIRECT_MIN_INTERVAL = DAY;

export type SyncDeps = {
  db: Db;
  fetch: Fetcher;
  bases: string[];
  appVersion: string;
  getMode: () => SyncMode;
  /** Сбор с форума (scrapeDirect с настроенными источниками) */
  direct: () => Promise<DataInput>;
  /** Новое состояние → renderer (`sync:status`) */
  emit?: (status: SyncStatus) => void;
  /** Данные записаны (`data:updated`, уведомление о новых изменениях) */
  onUpdated?: (info: { newChanges: ChangeEntry[] }) => void;
  log?: (level: 'info' | 'warn' | 'error', msg: string) => void;
  now?: () => Date;
};

type Transient = Pick<SyncStatus, 'state' | 'mode' | 'error' | 'appOutdated'>;

export class SyncService {
  private running: Promise<void> | null = null;
  private transient: Transient = { state: 'idle', mode: 'central' };

  constructor(private readonly deps: SyncDeps) {}

  private now = () => (this.deps.now ? this.deps.now() : new Date());
  private log = (level: 'info' | 'warn' | 'error', msg: string) => this.deps.log?.(level, msg);

  status(): SyncStatus {
    const { db } = this.deps;
    const s: SyncStatus = { ...this.transient, dataVersion: getDataVersion(db) };
    const builtAt = getMeta(db, 'data_built_at');
    const lastSync = getMeta(db, 'last_sync_at');
    if (builtAt) s.dataBuiltAt = builtAt;
    if (lastSync) s.lastSuccessAt = lastSync;
    if (!s.error) delete s.error;
    if (!s.appOutdated) delete s.appOutdated;
    return s;
  }

  get busy(): boolean {
    return this.running !== null;
  }

  /** manual — кнопка «Проверить» / F5 / трей */
  run(opts: { manual?: boolean } = {}): Promise<void> {
    this.running ??= this.doRun(opts.manual ?? false).finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private set(t: Partial<Transient>) {
    this.transient = { ...this.transient, error: undefined, ...t };
    this.deps.emit?.(this.status());
  }

  private apply(data: DataInput) {
    const { db } = this.deps;
    const before = new Set(getChangeEntries(db).map((c) => c.id));
    applyData(db, data);
    const newChanges = (data.changes ?? []).filter((c) => !before.has(c.id));
    this.deps.onUpdated?.({ newChanges });
  }

  private async doRun(manual: boolean): Promise<void> {
    if (this.deps.getMode() === 'direct') return this.runDirect(true, manual);

    const { db } = this.deps;
    this.set({ state: 'checking', mode: 'central', appOutdated: false });
    try {
      const res = await fetchCentral(this.deps);
      setMeta(db, 'central_failing_since', null);
      setMeta(db, 'last_sync_at', this.now().toISOString());
      setMeta(db, 'data_checked_at', res.manifest.checkedAt);
      if (res.kind === 'updated') {
        this.apply(res.data);
        this.log('info', `sync: версия ${res.manifest.version}, файлов ${res.downloaded.length}`);
      }
      this.set({ state: 'idle' });
    } catch (e) {
      const msg = (e as Error).message;
      if (e instanceof SchemaVersionError || e instanceof AppOutdatedError) {
        // central отвечает — откат на direct не нужен, нужна новая версия приложения
        setMeta(db, 'central_failing_since', null);
        this.log('warn', `sync: ${msg}`);
        this.set({ state: 'error', appOutdated: true, error: 'Обновите приложение' });
        return;
      }
      if (e instanceof CentralUnavailableError) {
        const since = getMeta(db, 'central_failing_since') ?? this.now().toISOString();
        setMeta(db, 'central_failing_since', since);
        this.log('warn', `sync: ${msg}`);
        if (this.now().getTime() - new Date(since).getTime() > DIRECT_FALLBACK_AFTER)
          return this.runDirect(false, manual);
        this.set({
          state: 'offline',
          error: e.reachable ? 'Сервер данных недоступен' : 'Нет сети',
        });
        return;
      }
      this.log('error', `sync: ${msg}`);
      this.set({
        state: 'error',
        error: e instanceof IntegrityError ? 'Данные повреждены' : 'Ошибка синхронизации',
      });
    }
  }

  /** chosen — режим direct выбран пользователем; иначе это откат из auto */
  private async runDirect(chosen: boolean, manual: boolean): Promise<void> {
    const { db } = this.deps;
    const last = getMeta(db, 'last_direct_at');
    const recent = last && this.now().getTime() - new Date(last).getTime() < DIRECT_MIN_INTERVAL;
    if (recent && !(chosen && manual)) {
      // форум не дёргаем чаще раза в сутки — остаёмся на сохранённых данных
      this.set({
        state: chosen ? 'idle' : 'offline',
        mode: 'direct',
        ...(chosen ? {} : { error: 'Нет сети' }),
      });
      return;
    }

    this.set({ state: 'checking', mode: 'direct' });
    setMeta(db, 'last_direct_at', this.now().toISOString());
    try {
      this.apply(await this.deps.direct());
      setMeta(db, 'last_sync_at', this.now().toISOString());
      this.log('info', 'sync: данные собраны с форума');
      this.set({ state: 'idle', mode: 'direct' });
    } catch (e) {
      const msg = (e as Error).message;
      this.log('warn', `sync direct: ${msg}`);
      this.set(
        e instanceof BlockedError
          ? { state: 'error', mode: 'direct', error: 'Форум закрыт проверкой браузера' }
          : { state: 'offline', mode: 'direct', error: 'Нет сети' },
      );
    }
  }
}
