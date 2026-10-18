/**
 * Экран категории: список документов (заголовок, дата, число пунктов, «Важно», изменения
 * за неделю). Макета нет — собран из стиля шапки документа. Один документ — сразу открываем его.
 */
import { ChevronRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import type { DocSummary } from '@shared/ipc';
import { api } from '../api';
import { CHANGES, count, DOCS, fmtDay, RULES } from '../format';
import { useApp } from '../store';

export function Category() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const category = useApp((s) => s.categories.find((c) => c.id === id));
  const revision = useApp((s) => s.dataRevision);
  const [docs, setDocs] = useState<{ id: string; list: DocSummary[] } | null>(null);
  const [weekly, setWeekly] = useState<Map<number, number>>(new Map());

  useEffect(() => {
    let alive = true;
    void Promise.all([api.getDocs(id), api.getChanges({ days: 7, categoryId: id })]).then(
      ([list, changes]) => {
        if (!alive) return;
        const byDoc = new Map<number, number>();
        for (const c of changes) byDoc.set(c.docId, (byDoc.get(c.docId) ?? 0) + 1);
        setDocs({ id, list });
        setWeekly(byDoc);
      },
    );
    return () => void (alive = false);
  }, [id, revision]);

  // список другой категории ещё не загружен — не мигаем старым
  const list = docs?.id === id ? docs.list : null;
  if (list?.length === 1) return <Navigate to={`/doc/${list[0]!.id}`} replace />;

  return (
    <section className="panel">
      <header className="doc-head">
        <h1 className="screen-title">{category?.fullTitle ?? 'Категория'}</h1>
        {list && <p className="doc-meta">{count(list.length, DOCS)}</p>}
      </header>
      <div className="scroll">
        {list?.length === 0 && <p className="empty">В этой категории пока нет документов.</p>}
        <ul className="doc-list">
          {list?.map((d) => {
            const n = weekly.get(d.id) ?? 0;
            return (
              <li key={d.id}>
                <button
                  type="button"
                  className="doc-row"
                  onClick={() => void navigate(`/doc/${d.id}`)}
                >
                  <span className="doc-row-main">
                    <span className="doc-row-title">
                      {d.title}
                      {d.important && <span className="tag tag-changed">Важно</span>}
                    </span>
                    <span className="doc-row-meta">
                      <span>Обновлено {fmtDay(d.editedAt ?? d.createdAt)}</span>
                      <span>{count(d.ruleCount, RULES)}</span>
                      {n > 0 && (
                        <span className="recent">
                          <span className="dot" aria-hidden />
                          {count(n, CHANGES)} за неделю
                        </span>
                      )}
                    </span>
                  </span>
                  <ChevronRight size={18} className="doc-row-chevron" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
