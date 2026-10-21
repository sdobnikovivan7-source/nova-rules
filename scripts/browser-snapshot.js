/* global location, DOMParser, document, FileReader */
/**
 * Ручная выгрузка форума, пока сборщика не пускает проверка браузера.
 * Выполнить в консоли браузера (F12) на любой странице forum.grand-rp.su:
 * качает RSS, списки, все темы правил и картинки-вложения первых постов с паузой
 * 1,5–2 с (~2 мин) и сохраняет в «Загрузки» файл nova-snapshot.json.
 * Дальше — `pnpm import-snapshot` и `pnpm scrape --from`.
 */
(async () => {
  const base = location.origin;
  const forums = [1242, 1243, 896, 895, 1135];
  const extra = [403002];
  const files = {};
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function get(p) {
    await sleep(1500 + Math.random() * 500);
    const r = await fetch(base + p, { credentials: 'include' });
    const t = await r.text();
    if (!r.ok) throw new Error(`${r.status} ${p}`);
    console.log(p);
    return t;
  }
  const ids = [];
  for (const f of forums) {
    files[`rss/${f}.xml`] = await get(`/forums/${f}/index.rss`);
    let pages = 1;
    for (let p = 1; p <= pages; p++) {
      const html = await get(`/forums/${f}/${p === 1 ? '' : 'page-' + p}`);
      files[`lists/${f}-p${p}.html`] = html;
      const d = new DOMParser().parseFromString(html, 'text/html');
      if (p === 1) {
        const n = [...d.querySelectorAll('.pageNav-page a')]
          .map((a) => +a.textContent.trim())
          .filter(Number.isFinite);
        pages = Math.min(n.length ? Math.max(...n) : 1, 10);
      }
      d.querySelectorAll('.structItem--thread').forEach((el) => {
        const m = /js-threadListItem-(\d+)/.exec(el.className);
        if (m && !ids.includes(+m[1])) ids.push(+m[1]);
      });
    }
    const rss = new DOMParser().parseFromString(files[`rss/${f}.xml`], 'text/xml');
    rss.querySelectorAll('item > link').forEach((l) => {
      const m = /threads\/(?:[^/]*\.)?(\d+)\//.exec(l.textContent);
      if (m && !ids.includes(+m[1])) ids.push(+m[1]);
    });
  }
  for (const id of extra) if (!ids.includes(id)) ids.push(id);
  for (const id of ids) files[`threads/${id}.html`] = await get(`/threads/${id}/`);

  // картинки-вложения первых постов: приложение их не скачает (проверка браузера),
  // копии публикуются в ветку data (`data/attachments/<id>`)
  const attachments = {};
  const att = new Set();
  for (const id of ids) {
    const d = new DOMParser().parseFromString(files[`threads/${id}.html`], 'text/html');
    d.querySelectorAll('article.message .bbWrapper')[0]
      ?.querySelectorAll('img, .bbImageWrapper')
      .forEach((el) => {
        const m = /\/attachments\/(?:[^/]*\.)?(\d+)\//.exec(
          el.getAttribute('data-src') || el.getAttribute('src') || '',
        );
        if (m) att.add(m[1]);
      });
  }
  for (const a of att) {
    await sleep(1500 + Math.random() * 500);
    const r = await fetch(`${base}/attachments/${a}/`, { credentials: 'include' });
    if (!r.ok || !(r.headers.get('content-type') || '').startsWith('image/')) {
      console.warn(`вложение ${a}: ${r.status} ${r.headers.get('content-type')}`);
      continue;
    }
    const url = await new Promise((res) => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result);
      r.blob().then((b) => fr.readAsDataURL(b));
    });
    attachments[a] = String(url).slice(String(url).indexOf(',') + 1);
    console.log(`/attachments/${a}/`);
  }

  const json = JSON.stringify({ fetchedAt: new Date().toISOString(), ids, files, attachments });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  a.download = 'nova-snapshot.json';
  a.click();
  console.log(
    `Готово: ${ids.length} тем, вложений ${Object.keys(attachments).length} из ${att.size}`,
  );
})();
