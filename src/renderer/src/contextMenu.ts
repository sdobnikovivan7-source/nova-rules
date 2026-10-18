/**
 * Контекстное меню пункта (этап 5.12): копировать, избранное, на форуме,
 * «Пункт отображается неправильно» — новая задача в GitHub Issues с ID пункта.
 */
import { type MouseEvent, useCallback } from 'react';
import { REPO_URL } from '@shared/ipc';
import type { Rule } from '@shared/schema';
import { copyRule } from './actions';
import { api } from './api';
import { useApp } from './store';

/** Ссылка на новую задачу с заполненными версиями и ID пункта */
export function reportUrl(rule: Pick<Rule, 'id' | 'number'>, docUrl: string): string {
  const { info } = useApp.getState();
  const title = `Пункт отображается неправильно: ${rule.id}`;
  const body = [
    `**Пункт:** ${rule.number ? `п. ${rule.number}` : '—'} (\`${rule.id}\`)`,
    `**Тема на форуме:** ${docUrl}`,
    `**Версия приложения:** ${info?.version ?? '—'}`,
    `**Версия данных:** ${info?.dataVersion ?? '—'}`,
    '',
    '**Что не так:**',
    '',
  ].join('\n');
  const q = new URLSearchParams({ title, body, labels: 'parser' });
  return `${REPO_URL}/issues/new?${q.toString()}`;
}

export function useRuleMenu(docUrl: string | undefined): (rule: Rule, e: MouseEvent) => void {
  return useCallback(
    (rule, e) => {
      e.preventDefault();
      void api.showRuleMenu(rule.id).then((action) => {
        if (action === 'copy') void copyRule(rule.id);
        else if (action === 'favorite') void useApp.getState().toggleFavorite(rule.id);
        else if (action === 'forum' && docUrl) void api.openExternal(docUrl);
        else if (action === 'report' && docUrl) void api.openExternal(reportUrl(rule, docUrl));
      });
    },
    [docUrl],
  );
}
