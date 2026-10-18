import { describe, expect, it } from 'vitest';
import { parsePunishment } from '../src/scraper/parse/punishment';

const cases: [string, string, string[], string | undefined][] = [
  ['JAIL от 60 до 120 минут.', 'jail', ['jail'], 'от 60 до 120 минут'],
  ['| WARN.', 'warn', ['warn'], undefined],
  ['WARN/BAN', 'warn', ['warn', 'ban'], undefined],
  ['BAN - до 30 дней и снятие с поста лидера организации', 'ban', ['ban', 'removal'], 'до 30 дней'],
  ['MUTE - от 60 до 180 минут', 'mute', ['mute'], 'от 60 до 180 минут'],
  ['Demorgan 60 мин', 'demorgan', ['demorgan'], '60 мин'],
  ['DEMORGAN - 120 минут', 'demorgan', ['demorgan'], '120 минут'],
  ['Jail- 60 минут', 'jail', ['jail'], '60 минут'],
  ['Письменный выговор лидеру.', 'reprimand', ['reprimand'], undefined],
  ['устный выговор лидеру организации', 'reprimand', ['reprimand'], undefined],
  ['Возврат территории', 'territory', ['territory'], undefined],
  ['Предупреждение лидеру', 'leaderWarn', ['leaderWarn'], undefined],
  ['Отмена мероприятия', 'cancel', ['cancel'], undefined],
  ['Переигровка', 'cancel', ['cancel'], undefined],
  ['Запрет на получение статуса сроком на 14 дней', 'restriction', ['restriction'], '14 дней'],
  ['Blacklist', 'blacklist', ['blacklist'], undefined],
  ['BAN навсегда', 'ban', ['ban'], 'навсегда'],
  ['Kick', 'kick', ['kick'], undefined],
  ['Ban 3 дня', 'ban', ['ban'], '3 дня'],
  ['На усмотрение администрации', 'other', ['other'], undefined],
  ['бан 7 дней', 'ban', ['ban'], '7 дней'],
  ['мут 30 минут', 'mute', ['mute'], '30 минут'],
  ['кик', 'kick', ['kick'], undefined],
  ['занесение в ЧС', 'blacklist', ['blacklist'], undefined],
  ['Исключение участника из мероприятия', 'cancel', ['cancel'], undefined],
  ['Техническое поражение', 'cancel', ['cancel'], undefined],
  ['Потеря атаки.', 'cancel', ['cancel'], undefined],
  ['Снятие.', 'removal', ['removal'], undefined],
  ['Снятие статуса неофициальной организации', 'removal', ['removal'], undefined],
  // «банда» и «запрещено» не наказания
  ['банда', 'other', ['other'], undefined],
  ['Запрещено', 'other', ['other'], undefined],
];

describe('parsePunishment', () => {
  it.each(cases)('%s', (input, kind, kinds, duration) => {
    const p = parsePunishment(input)!;
    expect(p.kind).toBe(kind);
    expect(p.kinds).toEqual(kinds);
    expect(p.duration).toBe(duration);
    expect(p.raw).not.toMatch(/^\|/);
  });

  it('пустая строка — нет наказания', () => {
    expect(parsePunishment(' | ')).toBeUndefined();
  });
});
