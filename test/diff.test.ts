import { describe, expect, it } from 'vitest';
import type { ChangeEntry, Rule, RuleDoc } from '@shared/schema';
import { dice, diffDocs, diffRules, mergeChanges } from '../src/scraper/diff';
import { sha1 } from '../src/scraper/parse/structure';

const DOC = 500;

function rule(number: string, text: string, punish?: string): Rule {
  return {
    id: `${DOC}:${number}`,
    number,
    depth: number.split('.').length - 2,
    html: text,
    text,
    ...(punish ? { punishment: { raw: punish, kind: 'jail', kinds: ['jail'] } } : {}),
    hash: sha1(text + '|' + (punish ?? '')),
  };
}

function doc(rules: Rule[], id = DOC, title = 'Правила'): RuleDoc {
  return {
    id,
    categoryId: 'crime',
    title,
    url: `https://forum.grand-rp.su/threads/${id}/`,
    author: 'a',
    createdAt: '2026-01-01T00:00:00.000Z',
    important: false,
    sections: [{ id: `${id}:s1`, title: null, rules }],
    hash: sha1(rules.map((r) => r.hash).join()),
  };
}

const A = 'Запрещено передавать оружие организации игрокам, которые в ней не состоят.';
const B = 'Капты разрешено забивать в понедельник, среду, пятницу и воскресенье.';
const C = 'Запрещено выходить из игры во время капта, чтобы избежать смерти.';
const N = 'Новый пункт про использование транспорта на территории порта.';

describe('diffRules', () => {
  it('без изменений — пусто', () => {
    expect(diffRules([rule('1.1', A), rule('1.2', B)], [rule('1.1', A), rule('1.2', B)])).toEqual([]);
  });

  it('изменён текст', () => {
    const out = diffRules([rule('1.1', A)], [rule('1.1', A.replace('оружие', 'оружие и патроны'))]);
    expect(out).toEqual([
      expect.objectContaining({ type: 'changed', ruleId: '500:1.1', ruleNumber: '1.1', before: A }),
    ]);
    expect(out[0]!.renumbered).toBeUndefined();
  });

  it('изменено только наказание', () => {
    const out = diffRules([rule('2.2', C, 'Demorgan 30 мин')], [rule('2.2', C, 'Demorgan 60 мин')]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ type: 'changed', before: `${C} | Demorgan 30 мин`, after: `${C} | Demorgan 60 мин` });
  });

  it('добавлен и удалён', () => {
    const out = diffRules([rule('1.1', A), rule('1.2', B)], [rule('1.1', A), rule('1.3', C)]);
    expect(out.map((c) => [c.type, c.ruleId])).toEqual([
      ['removed', '500:1.2'],
      ['added', '500:1.3'],
    ]);
  });

  it('вставка в середину: только «добавлен», без каскада «изменён»', () => {
    const out = diffRules(
      [rule('1.1', A), rule('1.2', B), rule('1.3', C)],
      [rule('1.1', A), rule('1.2', N), rule('1.3', B), rule('1.4', C)],
    );
    expect(out).toEqual([expect.objectContaining({ type: 'added', ruleId: '500:1.2', after: N })]);
  });

  it('изменён и перенумерован', () => {
    const B2 = B.replace('воскресенье', 'субботу');
    const out = diffRules([rule('1.1', A), rule('1.2', B)], [rule('1.1', N), rule('1.2', A), rule('1.3', B2)]);
    expect(out).toContainEqual(
      expect.objectContaining({ type: 'changed', ruleId: '500:1.3', renumbered: true, before: B, after: B2 }),
    );
    expect(out).toContainEqual(expect.objectContaining({ type: 'added', ruleId: '500:1.1' }));
    expect(out).toHaveLength(2);
  });

  it('удаление из середины со сдвигом номеров: только «удалён»', () => {
    const out = diffRules([rule('1.1', A), rule('1.2', B), rule('1.3', C)], [rule('1.1', A), rule('1.2', C)]);
    expect(out).toEqual([expect.objectContaining({ type: 'removed', ruleId: '500:1.2', before: B })]);
  });
});

describe('diffDocs', () => {
  const date = '2026-10-18T03:07:00.000Z';

  it('первый прогон — изменений нет', () => {
    expect(diffDocs(new Map(), [doc([rule('1.1', A)])], date)).toEqual([]);
  });

  it('новая и исчезнувшая тема', () => {
    const prev = new Map([[DOC, doc([rule('1.1', A)])]]);
    const out = diffDocs(prev, [doc([rule('1.1', B)], 600, 'Новые правила')], date);
    expect(out.map((c) => [c.type, c.docId])).toEqual([
      ['doc_added', 600],
      ['doc_removed', DOC],
    ]);
  });

  it('записи несут документ, категорию, дату и стабильный id', () => {
    const prev = new Map([[DOC, doc([rule('1.1', A)])]]);
    const next = [doc([rule('1.1', A), rule('1.2', B)])];
    const [a] = diffDocs(prev, next, date);
    const [b] = diffDocs(prev, next, '2026-10-18T09:00:00.000Z');
    expect(a).toMatchObject({ type: 'added', docId: DOC, docTitle: 'Правила', categoryId: 'crime', date });
    expect(a!.id).toMatch(/^[0-9a-f]{16}$/);
    expect(b!.id).toBe(a!.id); // тот же день — тот же id
  });
});

describe('mergeChanges', () => {
  const entry = (id: string, date: string): ChangeEntry => ({
    id,
    date,
    docId: 1,
    docTitle: 't',
    categoryId: 'c',
    type: 'added',
  });

  it('новые сверху, без дублей, старше 180 дней отбрасываются', () => {
    const now = new Date('2026-10-18T00:00:00Z');
    const out = mergeChanges(
      [entry('old', '2026-03-01T00:00:00Z'), entry('x', '2026-10-01T00:00:00Z')],
      [entry('x', '2026-10-01T00:00:00Z'), entry('new', '2026-10-18T00:00:00Z')],
      now,
    );
    expect(out.map((e) => e.id)).toEqual(['new', 'x']);
  });
});

describe('dice', () => {
  it('похожие строки ≥ 0.8, разные < 0.5', () => {
    expect(dice(B, B.replace('воскресенье', 'субботу'))).toBeGreaterThan(0.8);
    expect(dice(A, N)).toBeLessThan(0.5);
  });
});
