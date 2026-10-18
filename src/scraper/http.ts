/**
 * Вежливый HTTP-клиент сборщика: одна очередь, паузы между запросами,
 * ретраи с экспонентой, длинная пауза на 429/503. Без зависимостей от Electron.
 */
import pRetry, { AbortError } from 'p-retry';

export type HttpOptions = {
  userAgent: string;
  /** Минимальная пауза между запросами, мс */
  pauseMs?: number;
  /** Случайная добавка к паузе, мс */
  jitterMs?: number;
  retries?: number;
  /** Пауза при 429/503, мс */
  throttleMs?: number;
  timeoutMs?: number;
  /** Начальная пауза между ретраями, мс (растёт ×2) */
  retryDelayMs?: number;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  log?: (msg: string) => void;
};

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
  ) {
    super(`HTTP ${status}: ${url}`);
  }
}

/**
 * Форум закрыт антибот-проверкой («Проверка браузера», 401/403 на все запросы).
 * Прогон останавливается целиком: продолжать бессмысленно, а публиковать нечего.
 */
export class BlockedError extends Error {
  constructor(readonly url: string) {
    super(`форум закрыт проверкой браузера (антибот): ${url}`);
  }
}

/** Страница-заглушка антибот-защиты вместо содержимого форума */
export function isChallengePage(html: string): boolean {
  return (
    html.includes('id="l7-config"') ||
    /<title>[^<]*(Checking your browser|Проверка браузера)/i.test(html)
  );
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class Http {
  private last = 0;
  private queue: Promise<unknown> = Promise.resolve();
  private readonly o: Required<Omit<HttpOptions, 'log'>> & Pick<HttpOptions, 'log'>;
  requests = 0;

  constructor(opts: HttpOptions) {
    this.o = {
      pauseMs: 1500,
      jitterMs: 500,
      retries: 3,
      throttleMs: 30_000,
      timeoutMs: 30_000,
      retryDelayMs: 2000,
      fetch: globalThis.fetch.bind(globalThis),
      sleep: defaultSleep,
      ...opts,
    };
  }

  /** GET → текст. Запросы выполняются строго по одному. */
  getText(url: string): Promise<string> {
    const run = this.queue.then(() => this.fetchWithRetry(url));
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async pace() {
    const wait = this.last + this.o.pauseMs + Math.random() * this.o.jitterMs - Date.now();
    if (wait > 0) await this.o.sleep(wait);
    this.last = Date.now();
  }

  private fetchWithRetry(url: string): Promise<string> {
    return pRetry(
      async () => {
        await this.pace();
        this.requests++;
        const res = await this.o.fetch(url, {
          headers: { 'User-Agent': this.o.userAgent, Accept: 'text/html,application/xml' },
          signal: AbortSignal.timeout(this.o.timeoutMs),
        });
        if (res.status === 429 || res.status === 503) {
          this.o.log?.(`${res.status} ${url} — пауза ${this.o.throttleMs / 1000} с`);
          await this.o.sleep(this.o.throttleMs);
          throw new HttpError(res.status, url);
        }
        if (res.status >= 500) throw new HttpError(res.status, url);
        // 4xx (кроме 429) повторять бессмысленно
        if (!res.ok) throw new AbortError(new HttpError(res.status, url));
        return res.text();
      },
      {
        retries: this.o.retries,
        minTimeout: this.o.retryDelayMs,
        factor: 2,
        onFailedAttempt: ({ error, attemptNumber }) =>
          this.o.log?.(`попытка ${attemptNumber}: ${error.message}`),
      },
    );
  }
}
