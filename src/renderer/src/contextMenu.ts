/**
 * Контекстное меню пункта (этап 5.12): копировать, избранное, на форуме,
 * «Пункт отображается неправильно» — новая задача в GitHub Issues с ID пункта.
 */
import { type MouseEvent, useCallback } from 'react';
import type { Rule } from '@shared/schema';
import { copyRule } from './actions';
import { api } from './api';
import { ruleIssueUrl } from './issues';
import { useApp } from './store';

/**
 * docUrl — тема документа, если все пункты списка из одного документа. В поиске и избранном
 * пункты из разных документов: ссылка берётся у того пункта, по которому кликнули.
 */
export function useRuleMenu(docUrl?: string): (rule: Rule, e: MouseEvent) => void {
  return useCallback(
    (rule, e) => {
      e.preventDefault();
      void api.showRuleMenu(rule.id).then(async (action) => {
        if (action === 'copy') return void copyRule(rule.id);
        if (action === 'favorite') return void useApp.getState().toggleFavorite(rule.id);
        if (action !== 'forum' && action !== 'report') return;
        const url = docUrl ?? (await api.getRule(rule.id))?.docUrl;
        if (!url) return;
        if (action === 'forum') void api.openExternal(url);
        else void api.openExternal(ruleIssueUrl(rule, url, useApp.getState().info ?? {}));
      });
    },
    [docUrl],
  );
}
