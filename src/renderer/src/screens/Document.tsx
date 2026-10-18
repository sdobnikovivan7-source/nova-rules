/**
 * Документ правил (макет «Документ»): шапка с мета-строкой, чипы-оглавление разделов
 * (прокрутка к разделу, подсветка текущего), виртуализированный список пунктов,
 * правая панель выбранного пункта. Выбранный пункт хранится в адресе: /doc/:id?rule=<id>.
 */
import { useVirtualizer } from '@tanstack/react-virtual';
import { ExternalLink } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router';
import type { ChangeView, RuleView } from '@shared/ipc';
import type { Rule, RuleDoc, Section } from '@shared/schema';
import { api } from '../api';
import { RichHtml } from '../components/RichHtml';
import { RuleCard } from '../components/RuleCard';
import { RulePanel } from '../components/RulePanel';
import { Chip } from '../components/ui';
import { useRuleMenu } from '../contextMenu';
import { CHANGES, count, fmtDay, isRecent, RULES, stripSectionNumber } from '../format';
import { useApp } from '../store';

type Item =
  | { kind: 'section'; key: string; section: number; title: string }
  | { kind: 'intro'; key: string; section: number; html: string }
  | { kind: 'rule'; key: string; section: number; rule: Rule };

function flatten(doc: RuleDoc): Item[] {
  const items: Item[] = [];
  doc.sections.forEach((s, i) => {
    if (s.title) items.push({ kind: 'section', key: s.id, section: i, title: s.title });
    if (s.intro) items.push({ kind: 'intro', key: `${s.id}:intro`, section: i, html: s.intro });
    for (const rule of s.rules) items.push({ kind: 'rule', key: rule.id, section: i, rule });
  });
  return items;
}

const ruleView = (doc: RuleDoc, s: Section, rule: Rule): RuleView => ({
  ...rule,
  docId: doc.id,
  docTitle: doc.title,
  docUrl: doc.url,
  categoryId: doc.categoryId,
  sectionTitle: s.title,
  path: s.title ? `${doc.title} › ${s.title}` : doc.title,
});

export function Document() {
  const docId = Number(useParams().id);
  const revision = useApp((s) => s.dataRevision);
  const [doc, setDoc] = useState<RuleDoc | null | undefined>(undefined);
  const category = useApp((s) => s.categories.find((c) => c.id === doc?.categoryId));
  const [changes, setChanges] = useState<ChangeView[]>([]);
  const [params, setParams] = useSearchParams();
  const selectedId = params.get('rule');

  useEffect(() => {
    let alive = true;
    void Promise.all([api.getDoc(docId), api.getChanges()]).then(([d, all]) => {
      if (!alive) return;
      setDoc(d);
      setChanges(all.filter((c) => c.docId === docId));
      useApp.setState({ openDocCategory: d?.categoryId ?? null });
    });
    return () => void (alive = false);
  }, [docId, revision]);

  useEffect(() => () => useApp.setState({ openDocCategory: null }), []);

  const items = useMemo(() => (doc ? flatten(doc) : []), [doc]);

  /** Последнее изменение каждого пункта (лента отсортирована от новых к старым) */
  const lastChange = useMemo(() => {
    const m = new Map<string, ChangeView>();
    for (const c of changes) if (c.ruleId && !m.has(c.ruleId)) m.set(c.ruleId, c);
    return m;
  }, [changes]);
  const weekCount = changes.filter((c) => isRecent(c.date)).length;

  const select = useCallback(
    (rule: Rule | null) =>
      setParams(rule ? { rule: rule.id } : {}, { replace: true, preventScrollReset: true }),
    [setParams],
  );
  const close = useCallback(() => select(null), [select]);
  const openMenu = useRuleMenu(doc?.url);

  const selected = useMemo(() => {
    if (!doc || !selectedId) return null;
    for (const s of doc.sections) {
      const r = s.rules.find((x) => x.id === selectedId);
      if (r) return ruleView(doc, s, r);
    }
    return null;
  }, [doc, selectedId]);

  // ── список ─────────────────────────────────────────────────
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) => (items[i]?.kind === 'rule' ? 76 : 44),
    getItemKey: (i) => items[i]!.key,
    overscan: 10,
    paddingStart: 8,
    paddingEnd: 16,
  });

  // при открытии документа — к выбранному пункту (из поиска, изменений, избранного)
  const scrolledFor = useRef<number | null>(null);
  useEffect(() => {
    if (!doc || scrolledFor.current === doc.id) return;
    scrolledFor.current = doc.id;
    const i = selectedId ? items.findIndex((it) => it.key === selectedId) : -1;
    if (i >= 0) virtualizer.scrollToIndex(i, { align: 'center' });
    else virtualizer.scrollToOffset(0);
  }, [doc, items, selectedId, virtualizer]);

  const sections = useMemo(
    () =>
      items.flatMap((it, index) =>
        it.kind === 'section' ? [{ index, section: it.section, title: it.title }] : [],
      ),
    [items],
  );
  const offset = virtualizer.scrollOffset ?? 0;
  const current = virtualizer.getVirtualItems().find((v) => v.end > offset + 12);
  const currentSection = current ? items[current.index]?.section : undefined;

  if (doc === undefined) return <section className="panel" />;
  if (doc === null)
    return (
      <section className="panel">
        <p className="empty">Документ не найден — возможно, его убрали с форума.</p>
      </section>
    );

  const ruleCount = doc.sections.reduce((n, s) => n + s.rules.length, 0);

  return (
    <>
      <section className="panel doc-panel">
        <header className="doc-head">
          {category && <p className="doc-category">{category.fullTitle}</p>}
          <h1 className="screen-title">{doc.title}</h1>
          <div className="doc-meta">
            <span>Обновлено {fmtDay(doc.editedAt ?? doc.createdAt)}</span>
            <span>{count(ruleCount, RULES)}</span>
            {weekCount > 0 && (
              <span className="recent">
                <span className="dot" aria-hidden />
                {count(weekCount, CHANGES)} за неделю
              </span>
            )}
            <button
              type="button"
              className="link-btn doc-forum"
              onClick={() => void api.openExternal(doc.url)}
            >
              Открыть на форуме
              <ExternalLink size={14} aria-hidden />
            </button>
          </div>
          {sections.length > 1 && (
            <nav className="toc" aria-label="Разделы документа">
              {sections.map((s) => (
                <Chip
                  key={s.index}
                  variant="toc"
                  active={s.section === currentSection}
                  onClick={() => virtualizer.scrollToIndex(s.index, { align: 'start' })}
                >
                  {stripSectionNumber(s.title)}
                </Chip>
              ))}
            </nav>
          )}
        </header>

        <div ref={scrollRef} className="scroll rule-list">
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {virtualizer.getVirtualItems().map((v) => {
              const it = items[v.index]!;
              return (
                <div
                  key={v.key}
                  ref={virtualizer.measureElement}
                  data-index={v.index}
                  className="vrow"
                  style={{ transform: `translateY(${v.start}px)` }}
                >
                  {it.kind === 'section' && (
                    <h2 className="list-section">{stripSectionNumber(it.title)}</h2>
                  )}
                  {it.kind === 'intro' && (
                    <div className="section-intro selectable">
                      <RichHtml html={it.html} />
                    </div>
                  )}
                  {it.kind === 'rule' && (
                    <RuleCard
                      rule={it.rule}
                      selected={it.rule.id === selectedId}
                      recent={isRecentChange(lastChange.get(it.rule.id))}
                      onSelect={select}
                      onContextMenu={openMenu}
                    />
                  )}
                </div>
              );
            })}
          </div>
          {items.length === 0 && <p className="empty">В документе нет пунктов.</p>}
        </div>
      </section>

      {selected && (
        <RulePanel rule={selected} change={lastChange.get(selected.id)} onClose={close} />
      )}
    </>
  );
}

const isRecentChange = (c: ChangeView | undefined) => !!c && isRecent(c.date);
