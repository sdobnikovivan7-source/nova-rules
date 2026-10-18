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

export function useRuleMenu(docUrl: string | undefined): (rule: Rule, e: MouseEvent) => void {
  return useCallback(
    (rule, e) => {
      e.preventDefault();
      void api.showRuleMenu(rule.id).then((action) => {
        if (action === 'copy') void copyRule(rule.id);
        else if (action === 'favorite') void useApp.getState().toggleFavorite(rule.id);
        else if (action === 'forum' && docUrl) void api.openExternal(docUrl);
        else if (action === 'report' && docUrl)
          void api.openExternal(ruleIssueUrl(rule, docUrl, useApp.getState().info ?? {}));
      });
    },
    [docUrl],
  );
}
