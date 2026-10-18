/**
 * Тема форума → RuleDoc.
 */
import type { RuleDoc } from '@shared/schema';
import { linearize } from './clean';
import { buildStructure, sha1 } from './structure';
import type { ThreadPage } from './thread';

export function buildDoc(page: ThreadPage, categoryId: string, baseUrl: string): RuleDoc {
  const { sections, paragraphMode } = buildStructure(linearize(page.html, baseUrl), page.id);
  const rules = sections.flatMap((s) => s.rules);
  const hash = sha1(
    JSON.stringify([page.title, sections.map((s) => [s.title, s.intro ?? '', s.rules.map((r) => r.hash)])]),
  );
  return {
    id: page.id,
    categoryId,
    title: page.title,
    url: `${baseUrl}/threads/${page.id}/`,
    author: page.author,
    createdAt: page.createdAt,
    ...(page.editedAt ? { editedAt: page.editedAt } : {}),
    important: page.important,
    sections,
    hash,
    ...(rules.length === 0
      ? { parseWarning: 'Не найдено ни одного пункта' }
      : paragraphMode
        ? { parseWarning: 'Нет нумерации: документ собран из абзацев' }
        : {}),
  };
}

export const countRules = (doc: RuleDoc) => doc.sections.reduce((n, s) => n + s.rules.length, 0);
