import { describe, expect, it } from 'vitest';
import type { RuleDoc } from '@shared/schema';
import { RuleDocSchema } from '@shared/schema';
import { buildDoc, countRules } from '../src/scraper/parse/doc';
import { parseThread } from '../src/scraper/parse/thread';
import { fixture } from './helpers';

const BASE = 'https://forum.grand-rp.su';
const index = JSON.parse(fixture('index.json')) as { threads: { id: number; categoryId: string }[] };
const docs = new Map<number, RuleDoc>(
  index.threads.map(({ id, categoryId }) => [
    id,
    buildDoc(parseThread(fixture(`threads/${id}.html`), id), categoryId, BASE),
  ]),
);
const doc = (id: number) => docs.get(id)!;
const rule = (id: number, number: string) =>
  doc(id)
    .sections.flatMap((s) => s.rules)
    .find((r) => r.number === number)!;

describe('структура документов', () => {
  it('все документы проходят zod-схему', () => {
    for (const d of docs.values()) expect(() => RuleDocSchema.parse(d), String(d.id)).not.toThrow();
  });

  it('ID пунктов уникальны в документе', () => {
    for (const d of docs.values()) {
      const ids = d.sections.flatMap((s) => s.rules.map((r) => r.id));
      expect(new Set(ids).size, String(d.id)).toBe(ids.length);
    }
  });

  it('правила криминальных организаций: разделы, пункты, наказания, примечания', () => {
    const d = doc(406244);
    expect(countRules(d)).toBe(81);
    expect(d.important).toBe(true);
    expect(d.sections.map((s) => s.title)).toContain('1. Общее положение');

    const r11 = rule(406244, '1.1');
    expect(r11.id).toBe('406244:1.1');
    expect(r11.text).toBe('Во время заморозки организация не может проявлять активность и функционировать.');
    expect(r11.punishment).toMatchObject({ kind: 'reprimand', raw: 'Письменный выговор лидеру.' });
    expect(r11.notes?.[0]?.type).toBe('clarification');

    const r121 = rule(406244, '1.2.1');
    expect(r121.depth).toBe(1);
    expect(r121.punishment).toMatchObject({ kind: 'jail', duration: 'от 60 до 120 минут' });
    expect(r121.html).not.toContain('|');
  });

  it('список без отступа после «Примечание: …в случаях:» / «Исключение:» целиком в примечании', () => {
    const r58 = rule(406242, '5.8');
    expect(r58.text).toBe('Запрещены открытые криминальные действия в городе с 10:00 до 23:00.');
    expect(r58.html).not.toContain('<b></b>');
    expect(r58.notes?.[1]).toMatchObject({ type: 'note' });
    expect(r58.notes?.[1]?.text).toContain('попытка задержания союзного игрока');
    expect(r58.notes?.[1]?.html).toContain('<li>');

    const r12 = rule(404708, '1.2');
    expect(r12.text).not.toContain('Цвет криминальной семьи');
    expect(r12.notes?.at(-1)?.text).toContain('Цвет криминальной семьи определяется');

    // метка сама пункт списка: соседний пункт («Список аббревиатур…») к примеру не относится
    const r29 = rule(409119, '2.9');
    expect(r29.notes?.[0]?.type).toBe('example');
    expect(r29.notes?.[0]?.text).not.toContain('Список аббревиатур');
    expect(r29.text).toContain('Список аббревиатур');
  });

  it('номер в тексте не дублируется', () => {
    expect(rule(406244, '1.1').text).not.toMatch(/^1\.1/);
  });

  it('склеенный пункт «…завершена. 1.5.3Капт» разрезается', () => {
    expect(rule(402991, '1.5.2').text).not.toContain('1.5.3');
    expect(rule(402991, '1.5.3').text).toMatch(/^Капт разрешено/);
    expect(rule(402991, '1.5.3').punishment?.kinds).toEqual(['cancel', 'warn']);
  });

  it('жирная строка перед новым крупным номером — заголовок', () => {
    expect(doc(402999).sections.map((s) => s.title)).toContain(
      'Crime | Правила криминальной неофициальной организации:',
    );
  });

  it('правила форума: пункты из списка без номеров', () => {
    const d = doc(403002);
    expect(d.parseWarning).toMatch(/абзацев/);
    expect(countRules(d)).toBeGreaterThan(20);
    expect(d.sections[0]!.rules.some((r) => r.text.startsWith('Запрещен обход бана'))).toBe(true);
  });

  it('лор банд: заголовки-названия банд (в том числе красный)', () => {
    expect(doc(402990).sections.map((s) => s.title)).toEqual([
      'THE FAMILIES:',
      'LOS SANTOS VAGOS:',
      'MARABUNTA GRANDE:',
      'BLOODS STREET GANG:',
      'THE BALLAS GANG:',
    ]);
  });

  it('журналы правок не попадают в правила', () => {
    const all = doc(406242).sections.flatMap((s) => s.rules.map((r) => r.text)).join('\n');
    expect(all).not.toContain('Редакция правил от');
  });

  it('хеш пункта меняется при изменении наказания', () => {
    const page = parseThread(fixture('threads/406244.html'), 406244);
    const changed = { ...page, html: page.html.replace('Письменный выговор лидеру.', 'WARN.') };
    const a = buildDoc(page, 'crime', BASE);
    const b = buildDoc(changed, 'crime', BASE);
    const find = (d: RuleDoc) => d.sections.flatMap((s) => s.rules).find((r) => r.id === '406244:1.1')!;
    expect(find(a).hash).not.toBe(find(b).hash);
    expect(a.hash).not.toBe(b.hash);
  });

  it('снимок разбора всех тем', () => {
    const summary = [...docs.values()].map((d) => ({
      id: d.id,
      title: d.title,
      sections: d.sections.map((s) => s.title),
      rules: d.sections.flatMap((s) =>
        s.rules.map(
          (r) =>
            `${r.number ?? '-'}${r.punishment ? ` [${r.punishment.kinds.join('+')}${r.punishment.duration ? ` ${r.punishment.duration}` : ''}]` : ''}${r.notes ? ` {${r.notes.map((n) => n.type).join(',')}}` : ''}`,
        ),
      ),
    }));
    expect(summary).toMatchSnapshot();
  });
});
