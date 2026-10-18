/** Документ — каркас; по макету (оглавление, RuleCard, RulePanel) — этап 5.7 */
import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import type { RuleDoc } from '@shared/schema';
import { api } from '../api';
import { useApp } from '../store';

export function Document() {
  const docId = Number(useParams().id);
  const revision = useApp((s) => s.dataRevision);
  const [doc, setDoc] = useState<RuleDoc | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    void api.getDoc(docId).then((d) => alive && setDoc(d));
    return () => void (alive = false);
  }, [docId, revision]);

  if (doc === undefined) return null;
  if (doc === null) return <section className="screen muted">Документ не найден.</section>;

  return (
    <section className="screen">
      <h1>{doc.title}</h1>
      {doc.sections.map((s) => (
        <div key={s.id}>
          {s.title && <h2>{s.title}</h2>}
          {s.rules.map((r) => (
            <p key={r.id} style={{ paddingLeft: r.depth * 16 }}>
              {r.number && <span className="mono muted">{r.number} </span>}
              {r.text}
              {r.punishment && <span className="punish"> | {r.punishment.raw}</span>}
            </p>
          ))}
        </div>
      ))}
    </section>
  );
}
