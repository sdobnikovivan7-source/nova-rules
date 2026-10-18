/**
 * Строка наказания → { raw, kind, kinds, duration }.
 * Примеры: «JAIL от 60 до 120 минут.», «WARN/BAN», «BAN - до 30 дней и снятие с поста лидера»,
 * «Устный/письменный выговор лидеру», «Отмена мероприятия», «Возврат территории».
 */
import type { PunishKind, Punishment } from '@shared/schema';
import { normalizeText } from './clean';

// \b в JS работает только для латиницы, для кириллицы границы слова заданы явно
const PATTERNS: [PunishKind, RegExp][] = [
  ['demorgan', /demorgan|деморган/i],
  ['jail', /\bjail|джайл/i],
  ['blacklist', /black\s*list|(?<![а-яё])чс(?![а-яё])|ч[её]рн(ый|ого) спис/i],
  ['ban', /\bban\b|(?<![а-яё])бан(?![а-яё])|блокировк|заблокир/i],
  ['warn', /\bwarn|(?<![а-яё])варн/i],
  ['mute', /\br?mute|(?<![а-яё])мут(?![а-яё])/i],
  ['kick', /\bkick|(?<![а-яё])кик(?![а-яё])/i],
  ['removal', /сняти[ея] с (поста|должност|лидер)|снятие (лидер|статус)|^снятие(?![а-яё])|увольнени/i],
  ['leaderWarn', /предупреждени[ея] лидер/i],
  ['reprimand', /выговор/i],
  ['territory', /(возврат|передач)[а-я]*\s+(\S+\s+)?территори/i],
  [
    'cancel',
    /отмен[аы]|переигровк|откат|аннулир|не засчит|исключени[ея](\s+\S+){0,3}\s+из мероприят|техническ\S* поражени|потеря атаки|заморозк/i,
  ],
  ['restriction', /запрет(?![а-яё])|запрет на|лишени[ея]|изъяти[ея]/i],
];

const DURATION =
  /(?:(?:от|до)\s+)?\d+(?:[.,]\d+)?(?:\s*(?:-|–|—|до)\s*\d+(?:[.,]\d+)?)?\s*(?:минут[аы]?|мин\.?|час(?:а|ов)?|ч\.?(?=\s|$)|дн(?:я|ей)|день|сут(?:ок|ки)|недел[ьи]|месяц(?:а|ев)?)|навсегда|перманентн[а-я]*/i;

export function cleanPunishRaw(raw: string): string {
  return normalizeText(raw)
    .replace(/^[\s|:–—-]+/, '')
    .replace(/[\s|]+$/, '')
    .trim();
}

/** Есть ли в тексте признак наказания */
export function looksLikePunishment(text: string): boolean {
  return PATTERNS.some(([, re]) => re.test(text));
}

export function parsePunishment(input: string): Punishment | undefined {
  const raw = cleanPunishRaw(input);
  if (!raw) return undefined;

  // типы в порядке появления в строке: «WARN/BAN» → warn, ban
  const found: { kind: PunishKind; at: number }[] = [];
  for (const [kind, re] of PATTERNS) {
    const m = re.exec(raw);
    if (m) found.push({ kind, at: m.index });
  }
  found.sort((a, b) => a.at - b.at);
  const kinds = [...new Set(found.map((f) => f.kind))];
  if (!kinds.length) kinds.push('other');

  const duration = DURATION.exec(raw)?.[0]?.trim().replace(/\.$/, '');
  return { raw, kind: kinds[0]!, kinds, ...(duration ? { duration } : {}) };
}
