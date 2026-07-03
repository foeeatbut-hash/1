// Извлекатели: каждый формат → промежуточная модель (ExtractedDoc).
// Работают и в браузере, и в Node (тесты) — кроме OCR-ветки PDF (нужен canvas браузера).

import * as XLSX from 'xlsx';
import { DocBlock, ExtractedDoc } from './types';

// ── Excel / CSV ──────────────────────────────────────────────────────────────

export function extractXlsx(data: ArrayBuffer | Uint8Array): ExtractedDoc {
  const wb = XLSX.read(data, { type: data instanceof Uint8Array ? 'array' : 'array' });
  const blocks: DocBlock[] = [];
  const warnings: string[] = [];
  wb.SheetNames.forEach((sheetName, si) => {
    const ws = wb.Sheets[sheetName];
    const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
    if (!rows.length) return;
    // Лист разбивается на «островки»: подряд идущие непустые строки = одна таблица,
    // одиночные строки с текстом = абзацы. Так один лист может содержать и текст, и таблицы.
    let cur: string[][] = [];
    const flush = () => {
      if (!cur.length) return;
      const maxCols = Math.max(...cur.map(r => r.filter(c => String(c || '').trim()).length));
      if (cur.length === 1 || maxCols <= 1) {
        for (const r of cur) {
          const line = r.map(c => String(c || '').trim()).filter(Boolean).join(' ');
          if (line) blocks.push({ kind: 'para', text: line, page: si + 1 });
        }
      } else {
        blocks.push({ kind: 'table', rows: cur.map(r => r.map(c => String(c ?? '').trim())), page: si + 1 });
      }
      cur = [];
    };
    for (const r of rows) {
      const isEmpty = !r.some((c: any) => String(c || '').trim());
      if (isEmpty) flush();
      else cur.push(r.map((c: any) => String(c ?? '')));
    }
    flush();
    // Заголовок листа как абзац — в названии листа бывает система/тип
    if (sheetName && !/^лист\s*\d+$|^sheet\s*\d+$/i.test(sheetName.trim())) {
      blocks.unshift({ kind: 'para', text: sheetName, page: si + 1 });
    }
  });
  return { blocks, source: 'xlsx', warnings };
}

// ── Word (.docx): HTML от mammoth → блоки ────────────────────────────────────
// Разбор HTML без DOM (строковый), чтобы одинаково работать в браузере и в Node-тестах.

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&amp;/g, '&');
}

function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

/** HTML (упрощённый, как выдаёт mammoth) → блоки. Вложенные таблицы уплощаются. */
export function htmlToBlocks(html: string): DocBlock[] {
  const blocks: DocBlock[] = [];
  // Вырезаем таблицы верхнего уровня по балансу тегов
  let rest = html;
  const tableRe = /<table[^>]*>/i;
  while (true) {
    const m = tableRe.exec(rest);
    if (!m) break;
    const start = m.index;
    // Ищем конец с учётом вложенности
    let depth = 0;
    let i = start;
    let end = -1;
    const tagRe = /<\/?table[^>]*>/gi;
    tagRe.lastIndex = start;
    let tm: RegExpExecArray | null;
    while ((tm = tagRe.exec(rest)) !== null) {
      if (tm[0][1] === '/') { depth--; if (depth === 0) { end = tm.index + tm[0].length; break; } }
      else depth++;
    }
    if (end < 0) break;
    // Текст до таблицы — абзацы
    pushParas(rest.slice(0, start), blocks);
    const tableHtml = rest.slice(start, end);
    const rows = parseHtmlTable(tableHtml);
    if (rows.length) blocks.push({ kind: 'table', rows });
    rest = rest.slice(end);
  }
  pushParas(rest, blocks);
  return blocks;
}

function pushParas(html: string, blocks: DocBlock[]) {
  const paras = html.split(/<\/(?:p|h[1-6]|li|div)>/i);
  for (const p of paras) {
    const text = stripTags(p);
    if (text) blocks.push({ kind: 'para', text });
  }
}

function parseHtmlTable(tableHtml: string): string[][] {
  // Вложенные таблицы уплощаются: их ячейки становятся текстом родительской ячейки
  const rows: string[][] = [];
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let trm: RegExpExecArray | null;
  while ((trm = trRe.exec(tableHtml)) !== null) {
    const cells: string[] = [];
    const tdRe = /<t[dh][^>]*(?:colspan=["']?(\d+)["']?)?[^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let tdm: RegExpExecArray | null;
    while ((tdm = tdRe.exec(trm[1])) !== null) {
      const colspan = parseInt(tdm[1] || '1', 10) || 1;
      cells.push(stripTags(tdm[2]));
      for (let k = 1; k < colspan; k++) cells.push(''); // разворачиваем объединённые
    }
    if (cells.length) rows.push(cells);
  }
  return rows;
}

export async function extractDocx(data: ArrayBuffer): Promise<ExtractedDoc> {
  // В браузере — сборка mammoth.browser, в Node (тесты) — обычная
  let mammoth: any;
  if (typeof window !== 'undefined') {
    mammoth = await import('mammoth/mammoth.browser');
  } else {
    mammoth = await import(/* @vite-ignore */ 'mammoth');
  }
  const result = await mammoth.convertToHtml({ arrayBuffer: data });
  const blocks = htmlToBlocks(result.value || '');
  const warnings: string[] = [];
  if (!blocks.length) warnings.push('Документ Word пуст или не содержит распознаваемого текста.');
  return { blocks, source: 'docx', warnings };
}

// ── XML ──────────────────────────────────────────────────────────────────────
// Универсальный режим: любые элементы и атрибуты → пары «ключ→значение».
// Без DOMParser (его нет в Node) — регэксп-обход, как в существующем equipmentParser.

export function extractXml(xmlText: string): ExtractedDoc {
  const blocks: DocBlock[] = [];
  const clean = xmlText.replace(/<!--[\s\S]*?-->/g, '');

  // Пары из атрибутов name/value (типовые файлы расчёта)
  const paramRe = /<(?:parameter|param|spec|характеристика)\b([^>]*?)\/?>(?:([\s\S]*?)<\/(?:parameter|param|spec|характеристика)>)?/gi;
  let pm: RegExpExecArray | null;
  while ((pm = paramRe.exec(clean)) !== null) {
    const attrs = pm[1] || '';
    const nm = attrs.match(/(?:name|название|ключ)=["']([^"']+)["']/i);
    const vm = attrs.match(/(?:value|val|значение)=["']([^"']+)["']/i);
    const um = attrs.match(/(?:unit|measure|ед)=["']([^"']+)["']/i);
    if (nm && vm) {
      blocks.push({ kind: 'kv', key: nm[1], value: um ? `${vm[1]} ${um[1]}` : vm[1] });
    }
  }

  // Простые листовые элементы: <расход>5000</расход>
  // (\b не работает после кириллицы — границу тега задаём явным пробелом/>)
  const leafRe = /<([a-zа-яё_][\w\-а-яё]*)(?:\s[^>]*)?>([^<>]{1,120})<\/\1\s*>/gi;
  let lm: RegExpExecArray | null;
  while ((lm = leafRe.exec(clean)) !== null) {
    const key = lm[1].replace(/[_-]/g, ' ');
    const value = lm[2].trim();
    if (value && !/^\s*$/.test(value)) blocks.push({ kind: 'kv', key, value });
  }

  // Названия из атрибутов name/title у контейнеров — как абзацы (там марка/система).
  // Теги параметров пропускаем: их name — это подпись поля, а не название узла.
  const nameRe = /<([a-zа-яё][\w\-а-яё]*)(?:\s[^>]*?)?(?:name|title|название)=["']([^"']{2,80})["']/gi;
  let nn: RegExpExecArray | null;
  const seen = new Set<string>();
  const paramTags = new Set(['parameter', 'param', 'spec', 'характеристика']);
  while ((nn = nameRe.exec(clean)) !== null) {
    if (paramTags.has(nn[1].toLowerCase())) continue;
    if (!seen.has(nn[2])) { seen.add(nn[2]); blocks.push({ kind: 'para', text: nn[2] }); }
  }

  const warnings: string[] = [];
  if (!blocks.length) warnings.push('В XML не найдено параметров. Поддерживаются элементы <parameter name value> и листовые узлы.');
  return { blocks, source: 'xml', warnings };
}

// ── Буфер обмена (вставка таблицы из Excel/Word) ─────────────────────────────

export function extractClipboard(html: string, plainText: string): ExtractedDoc {
  if (html && /<table/i.test(html)) {
    const blocks = htmlToBlocks(html);
    return { blocks, source: 'clipboard', warnings: [] };
  }
  // Плоский текст: строки с табуляцией → таблица, прочее → абзацы
  const blocks: DocBlock[] = [];
  const lines = (plainText || '').split(/\r?\n/);
  let tableRows: string[][] = [];
  const flush = () => {
    if (tableRows.length >= 2) blocks.push({ kind: 'table', rows: tableRows });
    else for (const r of tableRows) blocks.push({ kind: 'para', text: r.join(' ') });
    tableRows = [];
  };
  for (const line of lines) {
    if (line.includes('\t')) tableRows.push(line.split('\t').map(c => c.trim()));
    else { flush(); if (line.trim()) blocks.push({ kind: 'para', text: line.trim() }); }
  }
  flush();
  return { blocks, source: 'clipboard', warnings: [] };
}

// ── PDF: текстовый слой (+ детект сканов) ────────────────────────────────────
// Текстовые фрагменты с координатами → строки (кластеризация по Y) → колонки (по X-разрывам).
// Страницы без текста помечаются как сканы; их распознаёт OCR-ветка (ocr.ts, только браузер).

export interface PdfPageText {
  page: number;
  items: { str: string; x: number; y: number; w: number }[];
}

export interface PdfExtractOutcome {
  doc: ExtractedDoc;
  scanPages: number[];   // страницы без текстового слоя (нужен OCR)
  pageCount: number;
}

async function loadPdfJs(): Promise<any> {
  if (typeof window !== 'undefined') {
    const pdfjs: any = await import('pdfjs-dist');
    const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url' as any)).default;
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    return pdfjs;
  }
  // Node (тесты): legacy-сборка без воркера
  const pdfjs: any = await import(/* @vite-ignore */ 'pdfjs-dist/legacy/build/pdf.mjs');
  return pdfjs;
}

/** Фрагменты страницы → строки и таблицы по координатам */
export function pageItemsToBlocks(items: { str: string; x: number; y: number; w: number }[], page: number): DocBlock[] {
  if (!items.length) return [];
  // 1. Группировка в строки по Y (допуск 3px)
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: { y: number; frags: typeof items }[] = [];
  for (const it of sorted) {
    if (!it.str.trim()) continue;
    const line = lines.find(l => Math.abs(l.y - it.y) <= 3);
    if (line) line.frags.push(it);
    else lines.push({ y: it.y, frags: [it] });
  }
  lines.forEach(l => l.frags.sort((a, b) => a.x - b.x));

  // 2. Строка → колонки: разрыв по X больше ~2 ширин пробела = граница ячейки
  const rows: { cells: { x: number; text: string }[] }[] = lines.map(l => {
    const cells: { x: number; text: string }[] = [];
    let cur = { x: l.frags[0].x, text: '' };
    let lastEnd = l.frags[0].x;
    for (const f of l.frags) {
      const gap = f.x - lastEnd;
      if (cur.text && gap > 14) {
        cells.push(cur);
        cur = { x: f.x, text: '' };
      }
      cur.text += (cur.text && gap > 1 ? ' ' : '') + f.str;
      lastEnd = f.x + f.w;
    }
    if (cur.text.trim()) cells.push(cur);
    return { cells };
  });

  // 3. Подряд идущие многоколоночные строки с согласованными X → таблица
  const blocks: DocBlock[] = [];
  let tableBuf: { cells: { x: number; text: string }[] }[] = [];
  const flushTable = () => {
    if (tableBuf.length >= 2) {
      // Общая сетка колонок по X-координатам
      const xs: number[] = [];
      for (const r of tableBuf) for (const c of r.cells) {
        if (!xs.some(x => Math.abs(x - c.x) < 12)) xs.push(c.x);
      }
      xs.sort((a, b) => a - b);
      const grid = tableBuf.map(r => {
        const row = new Array(xs.length).fill('');
        for (const c of r.cells) {
          const ci = xs.findIndex(x => Math.abs(x - c.x) < 12);
          const idx = ci >= 0 ? ci : xs.length - 1;
          row[idx] = row[idx] ? row[idx] + ' ' + c.text : c.text;
        }
        return row;
      });
      blocks.push({ kind: 'table', rows: grid, page });
    } else {
      for (const r of tableBuf) {
        const text = r.cells.map(c => c.text).join(' ').trim();
        if (text) blocks.push({ kind: 'para', text, page });
      }
    }
    tableBuf = [];
  };
  for (const r of rows) {
    if (r.cells.length >= 2) tableBuf.push(r);
    else { flushTable(); const t = r.cells.map(c => c.text).join(' ').trim(); if (t) blocks.push({ kind: 'para', text: t, page }); }
  }
  flushTable();
  return blocks;
}

export async function extractPdf(data: ArrayBuffer): Promise<PdfExtractOutcome> {
  const pdfjs = await loadPdfJs();
  const task = pdfjs.getDocument({ data: new Uint8Array(data), useSystemFonts: true });
  const pdf = await task.promise;
  const blocks: DocBlock[] = [];
  const scanPages: number[] = [];
  const warnings: string[] = [];

  for (let p = 1; p <= pdf.numPages; p++) {
    const pg = await pdf.getPage(p);
    const tc = await pg.getTextContent();
    const items = (tc.items as any[])
      .filter(i => typeof i.str === 'string')
      .map(i => ({ str: i.str, x: i.transform[4], y: i.transform[5], w: i.width || 0 }));
    const meaningful = items.filter(i => i.str.trim().length > 0);
    if (meaningful.length < 5) {
      scanPages.push(p);
      continue;
    }
    blocks.push(...pageItemsToBlocks(meaningful, p));
  }

  if (scanPages.length && blocks.length === 0) {
    warnings.push(`Все страницы (${scanPages.length}) — сканы без текстового слоя.`);
  } else if (scanPages.length) {
    warnings.push(`Страницы-сканы без текста: ${scanPages.join(', ')}.`);
  }

  return {
    doc: { blocks, source: 'pdf', warnings },
    scanPages,
    pageCount: pdf.numPages,
  };
}

// ── Выбор извлекателя по расширению ─────────────────────────────────────────

export type AnyExtractOutcome = { doc: ExtractedDoc; pdf?: PdfExtractOutcome };

export async function extractByName(fileName: string, data: ArrayBuffer): Promise<AnyExtractOutcome> {
  const ext = (fileName.split('.').pop() || '').toLowerCase();
  if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') return { doc: extractXlsx(data) };
  if (ext === 'docx') return { doc: await extractDocx(data) };
  if (ext === 'doc') {
    return { doc: { blocks: [], source: 'docx', warnings: ['Старый формат .doc не поддерживается — пересохраните файл в .docx (Word: «Файл → Сохранить как»).'] } };
  }
  if (ext === 'xml') {
    const text = new TextDecoder('utf-8').decode(data);
    return { doc: extractXml(text) };
  }
  if (ext === 'pdf') {
    const out = await extractPdf(data);
    return { doc: out.doc, pdf: out };
  }
  return { doc: { blocks: [], source: 'xlsx', warnings: [`Формат .${ext} не поддерживается. Используйте PDF, Excel (.xlsx), Word (.docx) или XML.`] } };
}
