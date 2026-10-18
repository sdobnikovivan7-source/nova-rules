/** Подсветка совпадений внутри HTML пункта (правая панель): только текстовые узлы, теги не трогаем */
import { matchRanges } from './engine';

export function highlightHtml(html: string, terms: readonly string[]): string {
  if (!terms.length) return html;
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n as Text);

  for (const node of nodes) {
    const text = node.data;
    const ranges = matchRanges(text, terms);
    if (!ranges.length) continue;
    const frag = doc.createDocumentFragment();
    let pos = 0;
    for (const [s, e] of ranges) {
      if (s > pos) frag.append(text.slice(pos, s));
      const mark = doc.createElement('mark');
      mark.textContent = text.slice(s, e);
      frag.append(mark);
      pos = e;
    }
    if (pos < text.length) frag.append(text.slice(pos));
    node.replaceWith(frag);
  }
  return doc.body.innerHTML;
}
