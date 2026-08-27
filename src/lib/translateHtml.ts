/**
 * Перевод письма с сохранением его вида.
 *
 * Письмо приходит размеченным: таблицы, подписи, картинки, цитата прошлой
 * переписки. Перевести его как простой текст значит потерять всё это и отдать
 * человеку простыню, в которой не видно, где ответ, а где цитата. Поэтому
 * переводятся текстовые узлы, а разметка остаётся нетронутой.
 *
 * Здесь используется DOM, поэтому модуль лежит в lib, а не в src/translate:
 * тот слой обязан запускаться скриптом без браузера.
 */

/** Что переводить не надо: код, стили и адреса */
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'CODE', 'PRE', 'TEXTAREA']);

/**
 * Пройти по текстовым узлам и заменить их переводом.
 *
 * Пустой перевод оставляет исходный текст: дыра в письме хуже, чем строка на
 * чужом языке, — по ней хотя бы видно, что именно осталось непонятым.
 */
export function translateHtml(html: string, translate: (text: string) => string): string {
  if (!html || typeof DOMParser === 'undefined') return html;
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(html, 'text/html');
  } catch (_) {
    return html;
  }
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let node = walker.nextNode();
  while (node) {
    const parent = (node as Text).parentElement;
    if (parent && !SKIP_TAGS.has(parent.tagName)) nodes.push(node as Text);
    node = walker.nextNode();
  }
  for (const t of nodes) {
    const src = t.nodeValue || '';
    if (!src.trim()) continue;
    // Пробелы по краям несут вёрстку: «слово </b> ещё» без них слипнется
    const head = src.match(/^\s*/)?.[0] || '';
    const tail = src.match(/\s*$/)?.[0] || '';
    const dst = translate(src.trim());
    if (dst && dst !== src.trim()) t.nodeValue = head + dst + tail;
  }
  return doc.body.innerHTML;
}

/** Текст письма без разметки — для разбора и определения языка */
export function htmlToText(html: string): string {
  if (!html) return '';
  if (typeof DOMParser === 'undefined') return html.replace(/<[^>]+>/g, ' ');
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    for (const el of Array.from(doc.querySelectorAll('script,style'))) el.remove();
    return (doc.body.textContent || '').replace(/\n{3,}/g, '\n\n');
  } catch (_) {
    return html.replace(/<[^>]+>/g, ' ');
  }
}
