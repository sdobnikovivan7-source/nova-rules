/**
 * Избранное (макета нет — собрано из RuleCard и стиля поиска): группы по документам,
 * пометки «изменён с момента добавления» и «удалён» (тогда показывается снимок текста),
 * удаление из избранного. Ctrl+D — в избранное / из избранного (в панели пункта).
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import type { ChangeView, Favorite, RuleView } from '@shared/ipc';
import { api } from '../api';
import { RulePanel } from '../components/RulePanel';
import { RuleCard } from '../components/RuleCard';
import { Button } from '../components/ui';
import { useRuleMenu } from '../contextMenu';
import { count, fmtDay, RULES, stripSectionNumber } from '../format';
import { useApp } from '../store';

type Group = { key: string; title: string; docId: number | null; items: Favorite[] };

/** «1.10» после «1.9»: сравнение номеров по частям */
const byNumber = (a: Favorite, b: Favorite) =>
  (a.rule?.number ?? '').localeCompare(b.rule?.number ?? '', 'ru', { numeric: true });

function group(favs: Favorite[]): Group[] {
  const groups = new Map<string, Group>();
  for (const f of favs) {
    const key = f.rule ? String(f.rule.docId) : 'removed';
    let g = groups.get(key);
    if (!g) {
      g = f.rule
        ? { key, title: f.rule.docTitle, docId: f.rule.docId, items: [] }
        : { key, title: 'Удалённые из правил', docId: null, items: [] };
      groups.set(key, g);
    }
    g.items.push(f);
  }
  // удалённые — в конце
  return [...groups.values()]
    .sort((a, b) => (a.docId === null ? 1 : b.docId === null ? -1 : a.title.localeCompare(b.title)))
    .map((g) => ({ ...g, items: g.items.sort(byNumber) }));
}

export function Favorites() {
  const navigate = useNavigate();
  const revision = useApp((s) => s.dataRevision);
  const favoriteIds = useApp((s) => s.favoriteIds);
  const toggleFavorite = useApp((s) => s.toggleFavorite);
  const [favs, setFavs] = useState<Favorite[] | null>(null);
  const [changes, setChanges] = useState<Map<string, ChangeView>>(new Map());
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // перечитываем и когда избранное меняется в другом окне / из контекстного меню
  useEffect(() => {
    let alive = true;
    void Promise.all([api.getFavorites(), api.getChanges()]).then(([f, ch]) => {
      if (!alive) return;
      setFavs(f);
      const last = new Map<string, ChangeView>();
      for (const c of ch) if (c.ruleId && !last.has(c.ruleId)) last.set(c.ruleId, c);
      setChanges(last);
    });
    return () => void (alive = false);
  }, [revision, favoriteIds]);

  const groups = useMemo(() => (favs ? group(favs) : []), [favs]);
  const selected: RuleView | null = favs?.find((f) => f.ruleId === selectedId)?.rule ?? null;
  const openMenu = useRuleMenu(selected?.docUrl);

  return (
    <>
      <section className="panel">
        <header className="doc-head">
          <h1 className="screen-title">Избранное</h1>
          {favs && favs.length > 0 && (
            <p className="doc-meta">
              {count(favs.length, RULES)}. Пункт изменится на форуме — здесь появится пометка.
            </p>
          )}
        </header>
        <div className="scroll rule-list">
          {groups.map((g) => (
            <section key={g.key} className="hit-group" aria-label={g.title}>
              <h2 className="hit-group-head">
                {g.docId !== null ? (
                  <button
                    type="button"
                    className="hit-doc"
                    onClick={() => void navigate(`/doc/${g.docId}`)}
                  >
                    {g.title}
                  </button>
                ) : (
                  <span className="hit-doc">{g.title}</span>
                )}
              </h2>
              {g.items.map((f) =>
                f.rule ? (
                  <RuleCard
                    key={f.ruleId}
                    rule={f.rule}
                    selected={f.ruleId === selectedId}
                    showNotes={false}
                    footer={<FavoriteFooter fav={f} rule={f.rule} change={changes.get(f.ruleId)} />}
                    onSelect={(r) => setSelectedId(r.id)}
                    onContextMenu={openMenu}
                  />
                ) : (
                  <RemovedFavorite
                    key={f.ruleId}
                    fav={f}
                    change={changes.get(f.ruleId)}
                    onRemove={() => void toggleFavorite(f.ruleId)}
                  />
                ),
              )}
            </section>
          ))}
          {favs?.length === 0 && (
            <div className="empty">
              <p>
                Здесь будут пункты, которые вы отметили звёздочкой.
                <br />
                Откройте пункт и нажмите «В избранное» или Ctrl+D.
              </p>
            </div>
          )}
        </div>
      </section>

      {selected && (
        <RulePanel
          rule={selected}
          change={changes.get(selected.id)}
          onClose={() => setSelectedId(null)}
        />
      )}
    </>
  );
}

function FavoriteFooter(props: { fav: Favorite; rule: RuleView; change?: ChangeView | undefined }) {
  const { fav, rule, change } = props;
  return (
    <>
      {rule.sectionTitle && (
        <span className="rule-footer">{stripSectionNumber(rule.sectionTitle)}</span>
      )}
      {fav.changed && (
        <span className="fav-mark">
          <span className="tag tag-changed">Изменён с момента добавления</span>
          {change && (
            <Link to={`/changes?focus=${encodeURIComponent(change.id)}`}>Что изменилось</Link>
          )}
        </span>
      )}
    </>
  );
}

/** Пункта больше нет в правилах: снимок текста на момент добавления */
function RemovedFavorite(props: {
  fav: Favorite;
  change?: ChangeView | undefined;
  onRemove(): void;
}) {
  const number = props.fav.ruleId.split(':')[1] ?? '';
  return (
    <div className="rule-row removed">
      <span className="rule-num mono">{/^p\d+$/.test(number) ? '' : number}</span>
      <div className="rule-body">
        <p className="fav-snapshot selectable">{props.fav.snapshot}</p>
        <span className="fav-mark">
          <span className="tag tag-removed">Удалён</span>
          <span className="rule-footer">в избранном с {fmtDay(props.fav.addedAt)}</span>
          {props.change && (
            <Link to={`/changes?focus=${encodeURIComponent(props.change.id)}`}>Когда удалён</Link>
          )}
        </span>
      </div>
      <Button variant="outline" size="sm" onClick={props.onRemove}>
        Убрать
      </Button>
    </div>
  );
}
