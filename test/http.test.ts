import { describe, expect, it } from 'vitest';
import { Http, HttpError } from '../src/scraper/http';

function fakeFetch(statuses: number[]) {
  const calls: { url: string; ua: string | null }[] = [];
  const fn = (async (url: string, init?: RequestInit) => {
    calls.push({ url, ua: new Headers(init?.headers).get('User-Agent') });
    const status = statuses.shift() ?? 200;
    return new Response(status === 200 ? 'ok' : 'err', { status });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

function make(statuses: number[]) {
  const f = fakeFetch(statuses);
  const sleeps: number[] = [];
  const http = new Http({
    userAgent: 'TestBot/1.0',
    pauseMs: 0,
    jitterMs: 0,
    retryDelayMs: 1,
    throttleMs: 30_000,
    fetch: f.fn,
    sleep: async (ms) => void sleeps.push(ms),
  });
  return { http, sleeps, ...f };
}

describe('Http', () => {
  it('отдаёт текст и шлёт User-Agent', async () => {
    const { http, calls } = make([200]);
    expect(await http.getText('https://x/a')).toBe('ok');
    expect(calls[0]?.ua).toBe('TestBot/1.0');
  });

  it('повторяет запрос при 5xx', async () => {
    const { http, calls } = make([502, 500, 200]);
    expect(await http.getText('https://x/a')).toBe('ok');
    expect(calls).toHaveLength(3);
  });

  it('не повторяет 404', async () => {
    const { http, calls } = make([404, 200]);
    await expect(http.getText('https://x/a')).rejects.toBeInstanceOf(HttpError);
    expect(calls).toHaveLength(1);
  });

  it('при 429 делает длинную паузу', async () => {
    const { http, sleeps } = make([429, 200]);
    expect(await http.getText('https://x/a')).toBe('ok');
    expect(sleeps).toContain(30_000);
  });

  it('сдаётся после исчерпания ретраев', async () => {
    const { http, calls } = make([500, 500, 500, 500, 500]);
    await expect(http.getText('https://x/a')).rejects.toThrow('HTTP 500');
    expect(calls).toHaveLength(4);
  });

  it('выполняет запросы последовательно', async () => {
    const { http, calls } = make([200, 200, 200]);
    await Promise.all(['1', '2', '3'].map((p) => http.getText(`https://x/${p}`)));
    expect(calls.map((c) => c.url)).toEqual(['https://x/1', 'https://x/2', 'https://x/3']);
  });
});
