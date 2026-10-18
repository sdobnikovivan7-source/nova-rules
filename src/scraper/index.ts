/**
 * Прогон сборщика: списки тем → все темы → RuleDoc[].
 * Чистый Node, без Electron: используется и в GitHub Actions, и в direct-режиме приложения.
 *
 * Принцип: сломанные данные не публикуются. Любая ошибка по теме или разделу →
 * берётся прошлая версия и пишется предупреждение.
 */
import type { Category, RuleDoc, SourcesConfig } from '@shared/schema';
import { RuleDocSchema } from '@shared/schema';
import { Http } from './http';
import { buildDoc, countRules } from './parse/doc';
import { type OfficialNote, parseThread, threadUrl } from './parse/thread';
import { forumPageUrl, parseForumList } from './sources/forumList';
import { parseRss, rssUrl } from './sources/rss';

export type PrevData = { docs: Map<number, RuleDoc> };

export type ScrapeOptions = {
  sources: SourcesConfig;
  prev?: PrevData;
  /** Загрузчик страниц; по умолчанию — вежливый Http */
  fetchText?: (url: string) => Promise<string>;
  log?: (msg: string) => void;
};

export type ScrapeResult = {
  categories: Category[];
  docs: RuleDoc[];
  /** Журналы правок администрации по темам (на будущее, в правила не входят) */
  officialNotes: Record<number, OfficialNote[]>;
  warnings: string[];
  stats: { threads: number; fetched: number; reused: number; requests: number };
};

/** Защита от поломки вёрстки: было ≥ 10 пунктов, стало 0 или меньше половины */
export function looksBroken(prev: RuleDoc | undefined, next: RuleDoc): string | null {
  if (!prev) return null;
  const before = countRules(prev);
  const after = countRules(next);
  if (before >= 10 && (after === 0 || after < before / 2))
    return `пунктов было ${before}, стало ${after}`;
  return null;
}

type ThreadRef = { id: number; categoryId: string };

export async function runScrape(opts: ScrapeOptions): Promise<ScrapeResult> {
  const { sources, prev = { docs: new Map() }, log = () => {} } = opts;
  let requests = 0;
  const http = opts.fetchText ? null : new Http({ userAgent: sources.userAgent, log });
  const fetchText = async (url: string) => {
    requests++;
    return opts.fetchText ? opts.fetchText(url) : http!.getText(url);
  };

  const warnings: string[] = [];
  const warn = (msg: string) => {
    warnings.push(msg);
    log(`⚠ ${msg}`);
  };

  // ---- 1. списки тем
  const refs: ThreadRef[] = [];
  /** Категории, список которых получить не удалось: их документы берём из прошлой версии */
  const failedCategories = new Set<string>();

  for (const cat of sources.categories) {
    const ids: number[] = [];
    try {
      if (cat.forumId) {
        let pages = 1;
        for (let page = 1; page <= pages; page++) {
          const list = parseForumList(await fetchText(forumPageUrl(sources.baseUrl, cat.forumId, page)));
          if (page === 1) pages = Math.min(list.lastPage, 10);
          for (const t of list.threads) if (!ids.includes(t.id)) ids.push(t.id);
        }
        // RSS — сверка: темы, которых почему-то нет в HTML-списке
        try {
          for (const item of parseRss(await fetchText(rssUrl(sources.baseUrl, cat.forumId)))) {
            if (!ids.includes(item.id)) {
              ids.push(item.id);
              warn(`${cat.id}: тема ${item.id} есть в RSS, но не в списке раздела`);
            }
          }
        } catch (e) {
          log(`${cat.id}: RSS недоступен (${(e as Error).message}) — продолжаю без него`);
        }
      }
      for (const id of cat.threadIds ?? []) if (!ids.includes(id)) ids.push(id);

      const prevCount = [...prev.docs.values()].filter((d) => d.categoryId === cat.id).length;
      if (!ids.length && prevCount) throw new Error(`список тем пуст, а раньше было ${prevCount}`);
    } catch (e) {
      warn(`${cat.id}: не удалось получить список тем — ${(e as Error).message}`);
      failedCategories.add(cat.id);
      continue;
    }
    refs.push(...ids.map((id) => ({ id, categoryId: cat.id })));
    log(`${cat.id}: ${ids.length} тем`);
  }

  // ---- 2. темы
  const docs: RuleDoc[] = [];
  const officialNotes: Record<number, OfficialNote[]> = {};
  let fetched = 0;
  let reused = 0;

  const reuse = (id: number, why: string) => {
    const old = prev.docs.get(id);
    warn(`тема ${id}: ${why}${old ? ' — оставлена прошлая версия' : ' — прошлой версии нет, тема пропущена'}`);
    if (old) {
      docs.push(old);
      reused++;
    }
  };

  for (const ref of refs) {
    let doc: RuleDoc;
    try {
      const page = parseThread(await fetchText(threadUrl(sources.baseUrl, ref.id)), ref.id);
      doc = buildDoc(page, ref.categoryId, sources.baseUrl);
      if (page.officialNotes.length) officialNotes[ref.id] = page.officialNotes;
    } catch (e) {
      reuse(ref.id, `ошибка загрузки или разбора (${(e as Error).message})`);
      continue;
    }
    const valid = RuleDocSchema.safeParse(doc);
    if (!valid.success) {
      reuse(ref.id, `не прошла проверку схемы (${valid.error.issues[0]?.message})`);
      continue;
    }
    const broken = looksBroken(prev.docs.get(ref.id), doc);
    if (broken) {
      reuse(ref.id, `похоже на поломку разбора: ${broken}`);
      continue;
    }
    docs.push(valid.data);
    fetched++;
  }

  // документы категорий, список которых не получен, — из прошлой версии
  for (const old of prev.docs.values()) {
    if (failedCategories.has(old.categoryId) && !docs.some((d) => d.id === old.id)) {
      docs.push(old);
      reused++;
    }
  }

  // ---- 3. категории
  const categories: Category[] = sources.categories
    .map((c) => ({
      id: c.id,
      title: c.title,
      fullTitle: c.fullTitle,
      icon: c.icon,
      order: c.order,
      docIds: docs.filter((d) => d.categoryId === c.id).map((d) => d.id),
    }))
    .sort((a, b) => a.order - b.order);

  return {
    categories,
    docs,
    officialNotes,
    warnings,
    stats: { threads: refs.length, fetched, reused, requests },
  };
}
