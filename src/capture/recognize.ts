import { FieldKey, detectField } from './fields';

/**
 * Разбор захваченного содержимого.
 *
 * Два режима. Пришла таблица (HTML из Excel или текст с табуляциями) — колонки
 * известны, работает то же угадывание шапки, что у мастера импорта. Пришёл
 * сплошной текст — коды ищутся ОБРАЗЦОМ, снятым с тегов самого проекта, а не
 * разрезанием по пробелам. Разница принципиальная: код «У-1 приток» пробел
 * разорвёт пополам, а образец — нет.
 */

export interface CaptureItem {
  kind: 'text' | 'table' | 'image';
  text: string;
  html: string;
  image: string;
  truncated: number;
  at: number;
}

/** Насколько кандидат похож на код тега этого проекта */
export type Verdict = 'fits' | 'doubt' | 'junk';

export interface Candidate {
  code: string;
  /** Границы в исходном тексте — по ним подсвечивается парный фрагмент */
  start: number;
  end: number;
  verdict: Verdict;
}

/** Слова, после которых число — не код, а номер страницы или пункта */
const STOP_WORDS = new Set([
  'стр', 'страница', 'лист', 'рис', 'рисунок', 'табл', 'таблица', 'п', 'пп', 'гост',
  'изм', 'ред', 'от', 'до', 'вер', 'версия', 'page', 'sheet', 'fig', 'table', 'rev', 'ver',
]);

/** Кириллические буквы, неотличимые от латинских на глаз */
const HOMOGLYPH: Record<string, string> = {
  А: 'A', В: 'B', Е: 'E', К: 'K', М: 'M', Н: 'H', О: 'O', Р: 'P', С: 'C', Т: 'T',
  У: 'Y', Х: 'X', а: 'a', е: 'e', о: 'o', р: 'p', с: 'c', у: 'y', х: 'x', к: 'k', м: 'm', т: 't',
};

/** Код к сравнимому виду: регистр, разделители и подмена похожих букв */
export function normCode(s: string): string {
  return (s || '')
    .trim()
    .replace(/[\s\-_.]/g, '')
    .toUpperCase()
    .split('')
    .map((ch) => HOMOGLYPH[ch] ?? HOMOGLYPH[ch.toUpperCase()] ?? ch)
    .join('');
}

/** В строке смешаны латиница и кириллица — почти всегда это опечатка раскладки */
export function mixedScript(s: string): boolean {
  return /[A-Za-z]/.test(s) && /[А-Яа-яЁё]/.test(s);
}

export interface Shape {
  seps: string[];
  letMin: number;
  letMax: number;
  digMin: number;
  digMax: number;
  tailLetters: boolean;
  extraGroup: boolean;
  fromCount: number;
}

const DEFAULT_SHAPE: Shape = {
  seps: ['-', ''], letMin: 1, letMax: 6, digMin: 1, digMax: 4,
  tailLetters: true, extraGroup: true, fromCount: 0,
};

/**
 * Образец кода снимается с существующих тегов проекта: какие разделители в ходу,
 * сколько букв и цифр, бывает ли буквенный хвост. Пустой проект — общий образец
 * и честное предупреждение в интерфейсе, что сравнивать не с чем.
 */
export function buildShape(existing: string[]): Shape {
  const codes = existing.map((c) => (c || '').trim()).filter(Boolean);
  if (codes.length < 3) return { ...DEFAULT_SHAPE, fromCount: codes.length };

  const seps = new Set<string>();
  let letMin = 99, letMax = 0, digMin = 99, digMax = 0;
  let tailLetters = false, extraGroup = false, usable = 0;

  for (const code of codes) {
    const m = /^([A-Za-zА-Яа-яЁё]+)([-_. ]?)(\d+)([A-Za-zА-Яа-яЁё]*)(.*)$/.exec(code);
    if (!m) continue;
    usable++;
    seps.add(m[2]);
    letMin = Math.min(letMin, m[1].length);
    letMax = Math.max(letMax, m[1].length);
    digMin = Math.min(digMin, m[3].length);
    digMax = Math.max(digMax, m[3].length);
    if (m[4]) tailLetters = true;
    if (m[5] && /^[-.]\d+$/.test(m[5])) extraGroup = true;
  }
  if (usable < 3) return { ...DEFAULT_SHAPE, fromCount: codes.length };

  return {
    seps: [...seps],
    letMin, letMax, digMin, digMax,
    tailLetters, extraGroup,
    fromCount: usable,
  };
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');

/** Строгий образец: ему обязан соответствовать код, чтобы считаться «своим» */
export function shapeRegex(shape: Shape): RegExp {
  const seps = shape.seps.length ? shape.seps : [''];
  const sepPart = seps.some((s) => s === '')
    ? `[${seps.filter(Boolean).map(esc).join('')}]?`
    : `[${seps.map(esc).join('')}]`;
  const tail = shape.tailLetters ? '[A-Za-zА-Яа-яЁё]{0,2}' : '';
  const extra = shape.extraGroup ? '(?:[-.]\\d{1,3})?' : '';
  return new RegExp(
    `^[A-Za-zА-Яа-яЁё]{${shape.letMin},${shape.letMax}}${sepPart}\\d{${shape.digMin},${shape.digMax}}${tail}${extra}$`,
  );
}

/** Свободный образец: что вообще похоже на код. Из него потом отсеиваем */
const LOOSE = /[A-Za-zА-Яа-яЁё]{1,8}[-_. ]?\d{1,5}[A-Za-zА-Яа-яЁё]{0,3}(?:[-.]\d{1,3})?/g;

/**
 * Ищем коды находками, а не режем текст на куски. То, что под образец не
 * подошло, не выбрасывается — помечается сомнительным и приходит со снятой
 * галочкой: пусть инженер решает.
 */
export function findCodes(text: string, shape: Shape): Candidate[] {
  const strict = shapeRegex(shape);
  const out: Candidate[] = [];
  LOOSE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = LOOSE.exec(text))) {
    const code = m[0];
    const start = m.index;
    // Прилипшие с боков буквы или цифры означают, что мы попали в середину слова
    const before = text[start - 1] || '';
    const after = text[start + code.length] || '';
    if (/[A-Za-zА-Яа-яЁё0-9]/.test(before) || /[A-Za-zА-Яа-яЁё0-9]/.test(after)) continue;

    const letters = (/^[A-Za-zА-Яа-яЁё]+/.exec(code) || [''])[0];
    const junk = STOP_WORDS.has(letters.toLowerCase());
    out.push({
      code,
      start,
      end: start + code.length,
      verdict: junk ? 'junk' : strict.test(code) ? 'fits' : 'doubt',
    });
  }
  return out;
}

// ── Таблицы ────────────────────────────────────────────────────────────────

/** HTML из буфера: у копии из Excel здесь настоящая таблица с ячейками */
export function htmlToRows(html: string): string[][] {
  if (!html || !/<table[\s>]/i.test(html)) return [];
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const table = doc.querySelector('table');
    if (!table) return [];
    const rows: string[][] = [];
    table.querySelectorAll('tr').forEach((tr) => {
      const cells: string[] = [];
      tr.querySelectorAll('td,th').forEach((td) => {
        const span = Number((td as HTMLTableCellElement).colSpan || 1);
        const text = (td.textContent || '').replace(/\s+/g, ' ').trim();
        cells.push(text);
        // Объединённая ячейка разворачивается — иначе колонки поедут
        for (let i = 1; i < span; i++) cells.push(text);
      });
      if (cells.some((c) => c)) rows.push(cells);
    });
    return rows;
  } catch {
    return [];
  }
}

export function tsvToRows(text: string): string[][] {
  return text
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((l) => l.split('\t').map((c) => c.trim()));
}

export interface TableParse {
  rows: string[][];
  headerRow: number;
  mapping: Record<number, FieldKey | ''>;
}

/** Шапку ищем в первых пяти строках: та, где угадалось больше всего колонок */
export function parseTable(item: CaptureItem): TableParse | null {
  const rows = htmlToRows(item.html);
  const grid = rows.length ? rows : tsvToRows(item.text);
  if (grid.length < 2) return null;

  let headerRow = 0;
  let best = -1;
  for (let r = 0; r < Math.min(5, grid.length); r++) {
    const hits = grid[r].filter((c) => detectField(c)).length;
    if (hits > best) { best = hits; headerRow = r; }
  }
  const mapping: Record<number, FieldKey | ''> = {};
  if (best > 0) grid[headerRow].forEach((c, i) => { mapping[i] = detectField(c); });
  else {
    // Шапки нет — считаем первой колонкой код тега, остальное молчим
    headerRow = -1;
    mapping[0] = 'identifier';
  }
  return { rows: grid, headerRow, mapping };
}

// ── Общий вход ─────────────────────────────────────────────────────────────

export interface CaptureRow {
  key: string;
  identifier: string;
  brand?: string;
  name?: string;
  department?: string;
  fluid?: string;
  wbs?: string;
  parent?: string;
  actuality?: string;
  verdict: Verdict;
  /** Фрагменты исходника, из которых собрана строка */
  spans: { start: number; end: number }[];
}

export interface Recognized {
  /** Склеенный исходный текст всех захватов — левая область окна разбора */
  raw: string;
  rows: CaptureRow[];
  /** Отброшенное: номера страниц и прочий мусор */
  junk: Candidate[];
  mode: 'list' | 'table';
  shape: Shape;
  table?: TableParse;
  /** Сколько вхождений схлопнули как повтор внутри самого захвата */
  collapsed: number;
  truncated: number;
}

const rowFromTable = (grid: string[][], r: number, mapping: Record<number, FieldKey | ''>) => {
  const out: Record<string, string> = {};
  grid[r].forEach((cell, i) => {
    const f = mapping[i];
    if (f && cell) out[f] = cell;
  });
  return out;
};

export function recognize(items: CaptureItem[], existingCodes: string[]): Recognized {
  const shape = buildShape(existingCodes);
  const texts = items.map((i) => i.text);
  const raw = texts.join('\n');
  const truncated = items.reduce((n, i) => n + i.truncated, 0);

  // Таблица только если она одна: две склеенные таблицы с разными шапками
  // разобрать нельзя, и притворяться, что можно, не будем
  const table = items.length === 1 && items[0].kind === 'table' ? parseTable(items[0]) : null;

  if (table && Object.values(table.mapping).some((v) => v === 'identifier')) {
    const rows: CaptureRow[] = [];
    const seen = new Map<string, CaptureRow>();
    let collapsed = 0;
    for (let r = table.headerRow + 1; r < table.rows.length; r++) {
      const data = rowFromTable(table.rows, r, table.mapping);
      const identifier = (data.identifier || '').trim();
      if (!identifier) continue;
      const norm = normCode(identifier);
      const prev = seen.get(norm);
      if (prev) { collapsed++; continue; }
      const row: CaptureRow = {
        key: `t${r}`,
        identifier,
        ...data,
        verdict: shapeRegex(shape).test(identifier) ? 'fits' : 'doubt',
        spans: [],
      } as CaptureRow;
      rows.push(row);
      seen.set(norm, row);
    }
    return { raw, rows, junk: [], mode: 'table', shape, table, collapsed, truncated };
  }

  // Сплошной текст
  const found = findCodes(raw, shape);
  const junk = found.filter((c) => c.verdict === 'junk');
  const rows: CaptureRow[] = [];
  const seen = new Map<string, CaptureRow>();
  let collapsed = 0;
  for (const c of found) {
    if (c.verdict === 'junk') continue;
    const norm = normCode(c.code);
    const prev = seen.get(norm);
    if (prev) {
      // Повтор внутри выделения: не новая строка, а второй фрагмент той же
      prev.spans.push({ start: c.start, end: c.end });
      collapsed++;
      continue;
    }
    const row: CaptureRow = {
      key: `c${c.start}`,
      identifier: c.code,
      verdict: c.verdict,
      spans: [{ start: c.start, end: c.end }],
    };
    rows.push(row);
    seen.set(norm, row);
  }
  return { raw, rows, junk, mode: 'list', shape, collapsed, truncated };
}
