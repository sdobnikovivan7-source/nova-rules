/**
 * Ссылки на новую задачу в GitHub Issues по формам `.github/ISSUE_TEMPLATE/*.yml`:
 * поля формы заполняются из параметров адреса (ключ — `id` поля в форме).
 */
import { REPO_URL } from '@shared/ipc';

type Versions = { version?: string; dataVersion?: number };

function issueUrl(template: string, fields: Record<string, string | undefined>): string {
  const q = new URLSearchParams({ template });
  for (const [k, v] of Object.entries(fields)) if (v) q.set(k, v);
  return `${REPO_URL}/issues/new?${q.toString()}`;
}

/** «Пункт отображается неправильно» — форма rule.yml */
export const ruleIssueUrl = (
  rule: { id: string; number: string | null },
  docUrl: string,
  v: Versions,
) =>
  issueUrl('rule.yml', {
    title: `Пункт отображается неправильно: ${rule.number ? `п. ${rule.number}` : rule.id}`,
    rule: rule.id,
    thread: docUrl,
    app: v.version,
    data: v.dataVersion?.toString(),
  });

/** «Сообщить об ошибке» в настройках — форма bug.yml */
export const bugIssueUrl = (v: Versions) =>
  issueUrl('bug.yml', { app: v.version, data: v.dataVersion?.toString() });
