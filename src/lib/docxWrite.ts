/**
 * Настоящий документ Word из документа Flux.
 *
 * Выгрузка «в Word» до этого отдавала HTML с расширением `.doc`. Word такой
 * файл открывает, но с предупреждением «формат не соответствует расширению», и
 * человек, который просто хотел отправить документ заказчику, каждый раз
 * объяснял получателю, что это нормально. Это не выгрузка в Word — это
 * страница, притворяющаяся документом.
 *
 * Здесь собирается настоящий `.docx`: zip (src/lib/zipWrite.ts) с четырьмя
 * файлами внутри — ровно тот минимум, который Word считает документом.
 * Сохраняются абзацы, заголовки и таблицы; сложное оформление не переносится, и
 * об этом человеку сказано при открытии, а не после отправки.
 */
import { zip } from './zipWrite';

/** Кусок документа: абзац, заголовок или таблица */
export type DocPart =
  | { kind: 'para'; text: string }
  | { kind: 'head'; text: string; level?: number }
  | { kind: 'table'; rows: string[][] };

/** В XML нельзя класть сырой текст: пять символов имеют своё значение */
export function xmlEscape(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

/** Абзац: перевод строки внутри текста остаётся переводом строки, а не пропадает */
function paraXml(text: string, style?: string): string {
  const runs = String(text ?? '').split('\n').map((line, i) =>
    `${i ? '<w:r><w:br/></w:r>' : ''}<w:r><w:t xml:space="preserve">${xmlEscape(line)}</w:t></w:r>`).join('');
  const props = style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : '';
  return `<w:p>${props}${runs}</w:p>`;
}

function tableXml(rows: string[][]): string {
  const cols = Math.max(1, ...rows.map((r) => r.length));
  // Ширина колонок одинаковая: ширина листа за вычетом полей, поделённая поровну
  const width = Math.floor(9360 / cols);
  const grid = `<w:tblGrid>${Array.from({ length: cols }, () => `<w:gridCol w:w="${width}"/>`).join('')}</w:tblGrid>`;
  const borders = '<w:tblBorders>'
    + ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']
      .map((s) => `<w:${s} w:val="single" w:sz="4" w:color="999999"/>`).join('')
    + '</w:tblBorders>';
  const body = rows.map((row) => {
    const cells = Array.from({ length: cols }, (_, i) =>
      `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/></w:tcPr>${paraXml(row[i] ?? '')}</w:tc>`).join('');
    return `<w:tr>${cells}</w:tr>`;
  }).join('');
  return `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/>${borders}</w:tblPr>${grid}${body}</w:tbl>`;
}

function bodyXml(parts: DocPart[]): string {
  const out = parts.map((p) => {
    if (p.kind === 'table') return tableXml(p.rows);
    if (p.kind === 'head') return paraXml(p.text, `Heading${Math.min(3, Math.max(1, p.level || 1))}`);
    return paraXml(p.text);
  }).join('');
  // Word требует раздел в конце тела: без него документ считается испорченным.
  // A4 книжной, поля по 2 см — то же, что у документа на экране
  const section = '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>'
    + '<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="709" w:footer="709" w:gutter="0"/></w:sectPr>';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n`
    + `<w:document xmlns:w="${W}"><w:body>${out}${section}</w:body></w:document>`;
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n`
  + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
  + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
  + '<Default Extension="xml" ContentType="application/xml"/>'
  + '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
  + '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'
  + '</Types>';

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n`
  + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
  + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
  + '</Relationships>';

const DOC_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n`
  + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
  + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
  + '</Relationships>';

/** Три заголовка и обычный текст: больше нашим документам и не нужно */
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n`
  + `<w:styles xmlns:w="${W}">`
  + '<w:docDefaults><w:rPrDefault><w:rPr>'
  + '<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/><w:sz w:val="24"/>'
  + '</w:rPr></w:rPrDefault></w:docDefaults>'
  + '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>'
  + [1, 2, 3].map((n) => `<w:style w:type="paragraph" w:styleId="Heading${n}">`
    + `<w:name w:val="heading ${n}"/><w:basedOn w:val="Normal"/>`
    + `<w:pPr><w:outlineLvl w:val="${n - 1}"/><w:spacing w:before="240" w:after="120"/></w:pPr>`
    + `<w:rPr><w:b/><w:sz w:val="${32 - (n - 1) * 4}"/></w:rPr></w:style>`).join('')
  + '</w:styles>';

/** Документ Word целиком, готовый лечь на диск */
export function buildDocx(parts: DocPart[]): Uint8Array {
  return zip([
    // Порядок не случаен: список типов должен идти первым — так делают все,
    // кто пишет docx, и так его быстрее находят читатели попроще
    { name: '[Content_Types].xml', data: CONTENT_TYPES },
    { name: '_rels/.rels', data: ROOT_RELS },
    { name: 'word/document.xml', data: bodyXml(parts) },
    { name: 'word/_rels/document.xml.rels', data: DOC_RELS },
    { name: 'word/styles.xml', data: STYLES },
  ]);
}

/**
 * Разметка документа Flux → куски для Word.
 *
 * Заголовки узнаются по тегам и остаются заголовками — в Word это оглавление и
 * навигация, а не просто крупный шрифт. Разбор таблиц не повторяется: он уже
 * написан там, где программа читает чужие документы (src/import/extractors),
 * и второй такой же разбор однажды разошёлся бы с первым.
 */
export function partsFromHtml(html: string, tableRows: (fragment: string) => string[][]): DocPart[] {
  const parts: DocPart[] = [];
  let rest = String(html || '');
  const tableRe = /<table[\s\S]*?<\/table>/i;
  while (true) {
    const m = tableRe.exec(rest);
    if (!m) break;
    pushHtmlParas(rest.slice(0, m.index), parts);
    const rows = tableRows(m[0]);
    if (rows.length) parts.push({ kind: 'table', rows });
    rest = rest.slice(m.index + m[0].length);
  }
  pushHtmlParas(rest, parts);
  return parts;
}

function pushHtmlParas(html: string, parts: DocPart[]): void {
  // Разрез по закрывающим тегам абзацев: то же правило, что у разбора чужих
  // документов, — иначе один и тот же документ разбирался бы по-разному
  for (const piece of String(html).split(/<\/(?:p|h[1-6]|li|div)>/i)) {
    const head = /<h([1-6])[^>]*>/i.exec(piece);
    const text = piece
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
      .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
      .replace(/&amp;/g, '&')
      .replace(/[ \t]+/g, ' ')
      .trim();
    if (!text) continue;
    if (head) parts.push({ kind: 'head', text, level: Number(head[1]) });
    else parts.push({ kind: 'para', text });
  }
}

/**
 * Текст документа Flux → куски для Word.
 *
 * Текстовый документ хранится строками; таблицы в нём — строки с табуляцией
 * (так их кладёт разбор Word при открытии). Обратное превращение узнаёт их по
 * той же примете, чтобы таблица, пришедшая из Word, вернулась в Word таблицей.
 */
export function partsFromText(text: string): DocPart[] {
  const parts: DocPart[] = [];
  let table: string[][] = [];
  const flush = () => {
    if (table.length) { parts.push({ kind: 'table', rows: table }); table = []; }
  };
  for (const raw of String(text || '').split('\n')) {
    const line = raw.replace(/\s+$/, '');
    if (line.includes('\t')) { table.push(line.split('\t')); continue; }
    flush();
    if (!line.trim()) { parts.push({ kind: 'para', text: '' }); continue; }
    parts.push({ kind: 'para', text: line });
  }
  flush();
  return parts;
}
