/** Список документов категории — каркас; по макету — этап 5.6 */
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import type { DocSummary } from '@shared/ipc';
import { api } from '../api';
import { useApp } from '../store';

export function Category() {
  const { id = '' } = useParams();
  const category = useApp((s) => s.categories.find((c) => c.id === id));
  const revision = useApp((s) => s.dataRevision);
  const [docs, setDocs] = useState<DocSummary[] | null>(null);

  useEffect(() => {
    let alive = true;
    void api.getDocs(id).then((d) => alive && setDocs(d));
    return () => void (alive = false);
  }, [id, revision]);

  return (
    <section className="screen">
      <h1>{category?.fullTitle ?? 'Категория'}</h1>
      {docs?.length === 0 && <p className="muted">Документов нет.</p>}
      <ul className="plain-list">
        {docs?.map((d) => (
          <li key={d.id}>
            <Link to={`/doc/${d.id}`}>{d.title}</Link>
            <span className="muted">
              {' '}
              · {d.ruleCount} пунктов{d.important ? ' · ВАЖНО' : ''}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
