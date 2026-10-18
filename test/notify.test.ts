/** Текст уведомления о новых изменениях (§10.8) */
import { describe, expect, it } from 'vitest';
import type { ChangeEntry } from '@shared/schema';
import { changesMessage } from '../src/main/notifyText';

const ch = (docId: number, docTitle: string, extra: Partial<ChangeEntry> = {}): ChangeEntry => ({
  id: Math.random().toString(36),
  date: '2026-10-18T03:07:00.000Z',
  docId,
  docTitle,
  categoryId: 'crime',
  type: 'changed',
  ruleId: `${docId}:1.1`,
  ...extra,
});

describe('changesMessage', () => {
  it('нет изменений — нет уведомления', () => {
    expect(changesMessage([])).toBeNull();
  });

  it('один документ: «Изменены правила …» и число пунктов', () => {
    const t = 'Правила криминальных организаций';
    expect(changesMessage([ch(1, t), ch(1, t), ch(1, t)])).toEqual({
      title: 'Изменены правила криминальных организаций',
      body: '3 пункта',
    });
  });

  it('заголовок не начинается со слова «Правила» — в кавычках', () => {
    expect(changesMessage([ch(1, 'Мероприятие «Битва за порт»')])!.title).toBe(
      'Изменены правила «Мероприятие «Битва за порт»»',
    );
  });

  it('несколько документов: «Обновлены правила: 2 документа, 5 пунктов»', () => {
    const list = [ch(1, 'А'), ch(1, 'А'), ch(2, 'Б'), ch(2, 'Б'), ch(2, 'Б')];
    expect(changesMessage(list)).toEqual({
      title: 'Обновлены правила',
      body: '2 документа, 5 пунктов',
    });
  });

  it('новый и удалённый документ', () => {
    expect(
      changesMessage([ch(1, 'Правила семей', { type: 'doc_added', ruleId: undefined })]),
    ).toEqual({
      title: 'Новый документ в правилах',
      body: 'Правила семей',
    });
    expect(
      changesMessage([ch(1, 'Правила семей', { type: 'doc_removed', ruleId: undefined })])!.title,
    ).toBe('Документ убран из правил');
  });
});
