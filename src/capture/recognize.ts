import { FieldKey, detectField } from './fields';
import {
  Vocab, buildVocab, classifyChunk, looksLikeWbs, looksLikeName, looksLikeBrand,
  STOP_WORDS, vnorm,
} from './vocab';

/**
 * Разбор захваченного содержимого.
 *
 * Три режима, и выбираются они по содержимому, а не по настройке:
 *
 *  · таблица — пришёл HTML из Excel или текст с табуляциями: колонки известны;
 *  · строки  — в каждой строке один код и при нём данные («AHU-2 Приточная
 *              установка ВЕЗА КЦКП-10 ОВ»): код отделяется, остальное
 *              раскладывается по полям;
 *  · список  — сплошной перечень кодов подряд, данных при них нет.
 *
 * Коды не вырезаются по пробелам, а ищутся ОБРАЗЦОМ, снятым с тегов самого
 * проекта. Образец не один: у проекта обычно несколько семейств кодов
 * («AHU-2» и «21-PV-001» — разные), и кандидат сверяется с каждым.
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
  /** Оценка 0..1: по ней и выставлен вердикт */
  score: number;
  /** Семейство образца, которому код подошёл */
  family?: string;
}

/** Кириллические буквы, неотличимые от латинских на глаз */
const HOMOGLYPH: Record<string, string> = {
  А: 'A', В: 'B', Е: 'E', К: 'K', М: 'M', Н: 'H', О: 'O', Р: 'P', С: 'C', Т: 'T',
  У: 'Y', Х: 'X', а: 'a', е: 'e', о: 'o', р: 'p', с: 'c', у: 'y', х: 'x', к: 'k', м: 'm', т: 't',
};

const SEP = '-_. /';
const isSep = (ch: string) => SEP.includes(ch);
const isDigit = (ch: string) => ch >= '0' && ch <= '9';
const isLetter = (ch: string) => /[A-Za-zА-Яа-яЁё]/.test(ch);

/**
 * Код к сравнимому виду.
 *
 * Разделитель между буквой и цифрой — оформление: «AHU-2», «AHU 2» и «AHU2»
 * это один код. А вот разделитель МЕЖДУ ЦИФРАМИ несёт смысл: «бл2.1» и «бл21»
 * — разные блоки, и склеивать их нельзя. Раньше склеивались, и план предлагал
 * привязать один к другому.
 */
export function normCode(s: string): string {
  const src = (s || '').trim();
  let out = '';
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (isSep(ch)) {
      // Смотрим, что стоит по краям разделителя
      let j = i;
      while (j < src.length && isSep(src[j])) j++;
      const prev = out[out.length - 1] || '';
      const next = src[j] || '';
      if (isDigit(prev) && isDigit(next)) out += '.';
      i = j - 1;
      continue;
    }
    const up = ch.toUpperCase();
    out += HOMOGLYPH[ch] ?? HOMOGLYPH[up] ?? up;
  }
  return out;
}

/** В строке смешаны латиница и кириллица — почти всегда это опечатка раскладки */
export function mixedScript(s: string): boolean {
  return /[A-Za-z]/.test(s) && /[А-Яа-яЁё]/.test(s);
}

// ── Образец кода: семейства ────────────────────────────────────────────────

interface Run { type: 'L' | 'D'; len: number }

/** Разбор кода на чередование букв и цифр: «21-PV-001» → D2 · L2 · D3 */
function skeleton(code: string): { runs: Run[]; key: string } | null {
  const runs: Run[] = [];
  let i = 0;
  const s = code.trim();
  while (i < s.length) {
    const ch = s[i];
    if (isSep(ch)) { i++; continue; }
    const type: 'L' | 'D' = isDigit(ch) ? 'D' : isLetter(ch) ? 'L' : (null as any);
    if (!type) return null;
    let len = 0;
    while (i < s.length && ((type === 'D' && isDigit(s[i])) || (type === 'L' && isLetter(s[i])))) {
      len++; i++;
    }
    runs.push({ type, len });
  }
  if (!runs.length) return null;
  return { runs, key: runs.map((r) => r.type).join('') };
}

export interface Family {
  key: string;
  /** Границы длин каждого участка, по порядку */
  bounds: { min: number; max: number }[];
  count: number;
}

export interface Shape {
  families: Family[];
  /** Сколько кодов проекта удалось разобрать — для честной подписи в окне */
  fromCount: number;
}

export const EMPTY_SHAPE: Shape = { families: [], fromCount: 0 };

/**
 * Образец снимается с существующих тегов. Коды группируются по «скелету»
 * (чередованию букв и цифр), и каждое семейство держит свои границы длин.
 * Одним усреднённым шаблоном обойтись нельзя: смешав «AHU-2» и «21-PV-001»,
 * получим настолько широкий шаблон, что под него полезет что угодно.
 */
export function buildShape(existing: string[]): Shape {
  const byKey = new Map<string, Family>();
  let used = 0;
  for (const raw of existing || []) {
    const code = (raw || '').trim();
    if (!code) continue;
    const sk = skeleton(code);
    if (!sk) continue;
    used++;
    const f = byKey.get(sk.key);
    if (!f) {
      byKey.set(sk.key, { key: sk.key, count: 1, bounds: sk.runs.map((r) => ({ min: r.len, max: r.len })) });
    } else {
      f.count++;
      sk.runs.forEach((r, i) => {
        const b = f.bounds[i];
        if (!b) return;
        b.min = Math.min(b.min, r.len);
        b.max = Math.max(b.max, r.len);
      });
    }
  }
  const families = [...byKey.values()].sort((a, b) => b.count - a.count);
  return { families, fromCount: used };
}

/** Насколько код подходит семействам образца: 0 — не подошёл вовсе */
export function shapeScore(code: string, shape: Shape): { score: number; family?: string } {
  const sk = skeleton(code);
  if (!sk) return { score: 0 };
  // Инженерный код почти всегда содержит и буквы, и цифры
  const mixed = sk.runs.some((r) => r.type === 'L') && sk.runs.some((r) => r.type === 'D');
  if (!mixed) return { score: 0 };

  let best = 0;
  let bestKey: string | undefined;
  for (const f of shape.families) {
    if (f.key !== sk.key) continue;
    let ok = true;
    let loose = false;
    sk.runs.forEach((r, i) => {
      const b = f.bounds[i];
      if (!b) { ok = false; return; }
      if (r.len < b.min || r.len > b.max) {
        // Номера растут: на один разряд больше — всё ещё свой код
        if (r.type === 'D' && r.len <= b.max + 1) loose = true;
        else ok = false;
      }
    });
    if (!ok) continue;
    const s = loose ? 0.75 : 0.9;
    if (s > best) { best = s; bestKey = f.key; }
  }
  if (best) return { score: best, family: bestKey };

  // Ни одному семейству не подошёл, но на инженерный код похож
  const sane = code.length >= 2 && code.length <= 24 && sk.runs.length <= 6;
  return { score: sane ? 0.4 : 0.15, family: undefined };
}

/** Совместимость: подходит ли код образцу настолько, чтобы считаться «своим» */
export const fitsShape = (code: string, shape: Shape) => shapeScore(code, shape).score >= 0.7;

// ── Поиск кандидатов ───────────────────────────────────────────────────────

/** Слова-кандидаты: буквы, цифры и разделители внутри */
const TOKEN = /[A-Za-zА-Яа-яЁё0-9][A-Za-zА-Яа-яЁё0-9\-_./]*/g;
/**
 * Мусор с номером: «стр. 4», «Лист 12», «ГОСТ 21.208-2013».
 *
 * Границу слова пишем явным просмотром назад, а не `\b`: в JS `\b` считает
 * буквами только латиницу, и перед кириллическим «стр» границы не находит —
 * весь отбор молча не срабатывал.
 */
const JUNK_RE = new RegExp(
  `(?<![A-Za-zА-Яа-яЁё0-9])(${[...STOP_WORDS].join('|')})\\.?\\s*№?\\s*\\d[\\d.\\-/]*`, 'gi',
);
/** Даты — не коды */
const DATE_RE = /\b\d{1,2}[./]\d{1,2}[./]\d{2,4}\b/g;

function scanJunk(text: string): Candidate[] {
  const out: Candidate[] = [];
  for (const re of [JUNK_RE, DATE_RE]) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      out.push({ code: m[0], start: m.index, end: m.index + m[0].length, verdict: 'junk', score: 0 });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

/**
 * Кандидаты в коды со всего текста. Отбор двухступенчатый: сначала форма
 * (буквы и цифры вместе), потом оценка по образцу и по окружению — код,
 * у которого в этом же захвате есть родня того же семейства, почти наверняка
 * настоящий.
 */
export function findCodes(text: string, shape: Shape): { codes: Candidate[]; junk: Candidate[] } {
  const junk = scanJunk(text);
  const inJunk = (a: number, b: number) => junk.some((j) => a < j.end && b > j.start);

  const raw: Candidate[] = [];
  TOKEN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TOKEN.exec(text))) {
    let code = m[0];
    let start = m.index;
    // Хвостовые разделители не часть кода: «AHU-2,» и «AHU-2.» — это «AHU-2»
    while (code && isSep(code[code.length - 1])) code = code.slice(0, -1);
    if (!code) continue;
    const end = start + code.length;
    if (inJunk(start, end)) continue;
    const hasL = /[A-Za-zА-Яа-яЁё]/.test(code);
    const hasD = /\d/.test(code);
    if (!hasL || !hasD) continue;
    // Отбрасываем «стр4», «п5» — служебное слово, слипшееся с номером.
    // Но не «СП-12»: там есть разделитель, и это уже похоже на код
    const glued = /^([A-Za-zА-Яа-яЁё]+)(\d+)$/.exec(code);
    if (glued && STOP_WORDS.has(glued[1].toLowerCase())) continue;
    const { score, family } = shapeScore(code, shape);
    raw.push({ code, start, end, score, family, verdict: 'doubt' });
  }

  // Окружение: сколько кандидатов того же семейства встретилось в захвате
  const byFamily = new Map<string, number>();
  for (const c of raw) {
    const k = skeleton(c.code)?.key || '';
    byFamily.set(k, (byFamily.get(k) || 0) + 1);
  }
  let dominant = '';
  let dominantN = 0;
  for (const [k, n] of byFamily) if (n > dominantN) { dominantN = n; dominant = k; }

  for (const c of raw) {
    const k = skeleton(c.code)?.key || '';
    const kin = byFamily.get(k) || 0;
    let s = c.score;
    // Родня того же вида рядом — сильный признак, что это перечень тегов
    if (kin >= 3) s += 0.2;
    else if (kin === 2) s += 0.1;
    // В пустом проекте образца нет, и опереться можно только на сам захват:
    // самое частое семейство в нём и есть искомые коды
    if (shape.fromCount < 3 && k === dominant && dominantN >= 3) s += 0.25;
    c.score = Math.max(0, Math.min(1, s));
    c.verdict = c.score >= 0.7 ? 'fits' : c.score >= 0.3 ? 'doubt' : 'junk';
  }

  const codes = raw.filter((c) => c.verdict !== 'junk');
  const weak = raw.filter((c) => c.verdict === 'junk');
  return { codes, junk: [...junk, ...weak].sort((a, b) => a.start - b.start) };
}

// ── Раскладка по полям ─────────────────────────────────────────────────────

/** Куски строки: табуляции, два и более пробела, точка с запятой, вертикальная черта */
const splitChunks = (s: string) =>
  s.split(/\t+|\s{2,}|\s*[;|]\s*|\s+[—–]\s+/).map((x) => x.trim()).filter(Boolean);

/**
 * Остаток строки после кода — по полям. Сначала то, что нашлось в словарях
 * проекта (отдел, среда, шифр, марка), потом по виду: связный текст —
 * наименование, короткое с цифрами — марка.
 */
export function distribute(rest: string, vocab: Vocab): Partial<Record<FieldKey, string>> {
  const out: Partial<Record<FieldKey, string>> = {};
  const chunks = splitChunks(rest);
  const left: string[] = [];

  for (const chunk of chunks) {
    const known = classifyChunk(chunk, vocab);
    if (known && !out[known]) { out[known] = chunk; continue; }
    if (!out.wbs && looksLikeWbs(chunk)) { out.wbs = chunk; continue; }
    left.push(chunk);
  }

  // Один кусок: пробуем отделить известное слово с краю («… ОВ»)
  if (left.length === 1 && !out.department) {
    const words = left[0].split(/\s+/);
    for (const idx of [words.length - 1, 0]) {
      const w = words[idx];
      if (!w) continue;
      const known = classifyChunk(w, vocab);
      if (known && !out[known]) {
        out[known] = w;
        words.splice(idx, 1);
        left[0] = words.join(' ').trim();
        break;
      }
    }
  }

  for (const chunk of left) {
    if (!chunk) continue;
    if (!out.name && looksLikeName(chunk)) { out.name = chunk; continue; }
    if (!out.brand && looksLikeBrand(chunk)) { out.brand = chunk; continue; }
    if (!out.name) { out.name = chunk; continue; }
    if (!out.brand) { out.brand = chunk; }
  }

  // Марка часто сидит внутри наименования: «Приточная установка ВЕЗА КЦКП-10».
  // Сначала ищем марку, уже известную проекту — это самый надёжный признак
  if (out.name && !out.brand && vocab.brands.size) {
    const hay = vnorm(out.name);
    let found = '';
    for (const b of vocab.brands) if (b.length > found.length && hay.includes(b)) found = b;
    if (found) {
      const at = hay.indexOf(found);
      out.brand = out.name.slice(at, at + found.length).trim();
      const cut = (out.name.slice(0, at) + ' ' + out.name.slice(at + found.length)).replace(/\s+/g, ' ').trim();
      if (cut) out.name = cut; else delete out.name;
    }
  }
  // Незнакомую марку узнаём по виду: хвост из заглавных слов и обозначения
  // с цифрами после описания на строчных — «… ВЕЗА КЦКП-20»
  if (out.name && !out.brand) {
    const peeled = peelBrand(out.name, vocab);
    if (peeled) { out.brand = peeled.brand; if (peeled.name) out.name = peeled.name; else delete out.name; }
  }
  return out;
}

const isUpperWord = (w: string) => /^[A-ZА-ЯЁ][A-ZА-ЯЁ0-9-]{1,9}$/.test(w);
const hasDigitAndLetter = (w: string) => /\d/.test(w) && /[A-Za-zА-Яа-яЁё]/.test(w);

/** Хвост наименования, похожий на марку. Пусто — не нашли */
function peelBrand(name: string, vocab: Vocab): { brand: string; name: string } | null {
  const words = name.trim().split(/\s+/);
  if (words.length < 2) return null;
  let i = words.length;
  while (i > 0) {
    const w = words[i - 1];
    // Отдел и среду не трогаем — они уже разложены по своим полям
    if (classifyChunk(w, vocab)) break;
    if (isUpperWord(w) || hasDigitAndLetter(w)) i--;
    else break;
  }
  const tail = words.slice(i);
  const head = words.slice(0, i);
  if (!tail.length || !head.length) return null;
  const solid = tail.some(hasDigitAndLetter) || (tail.length === 1 && isUpperWord(tail[0]) && head.length >= 2);
  if (!solid) return null;
  return { brand: tail.join(' '), name: head.join(' ') };
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

/**
 * Колонки по содержимому, когда шапки нет или она ничего не дала.
 * Тот же приём, что у разбора бланков: колонка определяется тем, что в ней
 * лежит, а не тем, какая она по счёту.
 */
export function classifyColumns(
  rows: string[][], from: number, shape: Shape, vocab: Vocab,
): Record<number, FieldKey | ''> {
  const width = rows.reduce((w, r) => Math.max(w, r.length), 0);
  const body = rows.slice(from).filter((r) => r.some((c) => c));
  const mapping: Record<number, FieldKey | ''> = {};
  if (!body.length) return mapping;

  const stat = (col: number) => {
    const cells = body.map((r) => (r[col] || '').trim()).filter(Boolean);
    if (!cells.length) return null;
    const rate = (f: (s: string) => boolean) => cells.filter(f).length / cells.length;
    return {
      cells,
      code: rate((c) => shapeScore(c, shape).score >= 0.7),
      dept: rate((c) => vocab.departments.has(vnorm(c))),
      fluid: rate((c) => vocab.fluids.has(vnorm(c))),
      brand: rate((c) => vocab.brands.has(vnorm(c))),
      wbs: rate(looksLikeWbs),
      name: rate(looksLikeName),
      avgLen: cells.reduce((n, c) => n + c.length, 0) / cells.length,
    };
  };

  const stats = Array.from({ length: width }, (_, i) => stat(i));
  const taken = new Set<FieldKey>();
  const assign = (col: number, f: FieldKey) => {
    if (taken.has(f) || mapping[col]) return;
    mapping[col] = f; taken.add(f);
  };

  const bestBy = (pick: (s: NonNullable<ReturnType<typeof stat>>) => number, min: number) => {
    let bi = -1, bv = min;
    stats.forEach((s, i) => { if (s && !mapping[i] && pick(s) > bv) { bv = pick(s); bi = i; } });
    return bi;
  };

  const idCol = bestBy((s) => s.code, 0.5);
  if (idCol >= 0) assign(idCol, 'identifier');
  const deptCol = bestBy((s) => s.dept, 0.6);
  if (deptCol >= 0) assign(deptCol, 'department');
  const fluidCol = bestBy((s) => s.fluid, 0.6);
  if (fluidCol >= 0) assign(fluidCol, 'fluid');
  const wbsCol = bestBy((s) => s.wbs, 0.6);
  if (wbsCol >= 0) assign(wbsCol, 'wbs');
  const nameCol = bestBy((s) => s.name, 0.5);
  if (nameCol >= 0) assign(nameCol, 'name');
  const brandCol = bestBy((s) => s.brand, 0.4);
  if (brandCol >= 0) assign(brandCol, 'brand');

  return mapping;
}

/** Шапку ищем в первых пяти строках: та, где угадалось больше всего колонок */
export function parseTable(item: CaptureItem, shape: Shape, vocab: Vocab): TableParse | null {
  const rows = htmlToRows(item.html);
  const grid = rows.length ? rows : tsvToRows(item.text);
  if (grid.length < 2) return null;

  let headerRow = -1;
  let best = 0;
  for (let r = 0; r < Math.min(5, grid.length); r++) {
    const hits = grid[r].filter((c) => detectField(c)).length;
    if (hits > best) { best = hits; headerRow = r; }
  }

  const mapping: Record<number, FieldKey | ''> = {};
  if (headerRow >= 0) {
    const used = new Set<FieldKey>();
    grid[headerRow].forEach((c, i) => {
      const f = detectField(c);
      if (f && !used.has(f)) { mapping[i] = f; used.add(f); } else mapping[i] = '';
    });
  }

  // Чего шапка не дала — доопределяем по содержимому колонок
  const auto = classifyColumns(grid, headerRow + 1, shape, vocab);
  const usedFields = new Set(Object.values(mapping).filter(Boolean) as FieldKey[]);
  for (const [k, f] of Object.entries(auto)) {
    const i = Number(k);
    if (mapping[i] || !f || usedFields.has(f)) continue;
    mapping[i] = f; usedFields.add(f);
  }

  if (!Object.values(mapping).includes('identifier')) return null;
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
  raw: string;
  rows: CaptureRow[];
  junk: Candidate[];
  mode: 'list' | 'table' | 'lines';
  shape: Shape;
  vocab: Vocab;
  table?: TableParse;
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

export function buildTableRows(
  table: TableParse,
  shape: Shape,
  mapping: Record<number, FieldKey | ''> = table.mapping,
): { rows: CaptureRow[]; collapsed: number } {
  const rows: CaptureRow[] = [];
  const seen = new Set<string>();
  let collapsed = 0;
  for (let r = table.headerRow + 1; r < table.rows.length; r++) {
    const data = rowFromTable(table.rows, r, mapping);
    const identifier = (data.identifier || '').trim();
    if (!identifier) continue;
    const norm = normCode(identifier);
    if (seen.has(norm)) { collapsed++; continue; }
    seen.add(norm);
    rows.push({
      key: `t${r}`,
      ...data,
      identifier,
      verdict: fitsShape(identifier, shape) ? 'fits' : 'doubt',
      spans: [],
    } as CaptureRow);
  }
  return { rows, collapsed };
}

/**
 * Строка вида «код + данные при нём».
 *
 * Считать кандидатов нельзя: в такой строке их всегда несколько — сам код и
 * модель вроде «КЦКП-10». Смотрим на УВЕРЕННЫХ кандидатов: если в строке один
 * настоящий код и при нём заметный остаток текста, это данные, а не перечень.
 */
function lineStructured(lines: { start: number; end: number; text: string }[], codes: Candidate[]): boolean {
  const withCode = lines.filter((l) => codes.some((c) => c.start >= l.start && c.end <= l.end));
  if (withCode.length < 2) return false;
  let oneStrong = 0, withRest = 0;
  for (const l of withCode) {
    const inLine = codes.filter((c) => c.start >= l.start && c.end <= l.end);
    const strong = inLine.filter((c) => c.verdict === 'fits').length;
    if (strong <= 1) oneStrong++;
    const main = inLine.reduce((a, b) => (b.score > a.score ? b : a));
    // Остаток считаем без главного кода: прочие кандидаты — это и есть данные
    if (l.text.trim().length - (main.end - main.start) >= 4) withRest++;
  }
  return oneStrong / withCode.length >= 0.7 && withRest / withCode.length >= 0.5;
}

export function recognize(
  items: CaptureItem[],
  existingCodes: string[],
  tags: { brand?: string | null; department?: string | null;
          fluid?: string | null; wbs?: string | null }[] = [],
): Recognized {
  const shape = buildShape(existingCodes);
  const vocab = buildVocab(tags);
  const raw = items.map((i) => i.text).join('\n');
  const truncated = items.reduce((n, i) => n + i.truncated, 0);

  // Таблица только если она одна: две склеенные таблицы с разными шапками
  // разобрать нельзя, и притворяться, что можно, не будем
  const table = items.length === 1 && items[0].kind === 'table'
    ? parseTable(items[0], shape, vocab) : null;

  if (table) {
    const { rows, collapsed } = buildTableRows(table, shape);
    return { raw, rows, junk: [], mode: 'table', shape, vocab, table, collapsed, truncated };
  }

  const { codes, junk } = findCodes(raw, shape);

  // Разбиваем исходник на строки с их границами — нужно обоим режимам
  const lines: { start: number; end: number; text: string }[] = [];
  {
    let pos = 0;
    for (const t of raw.split(/\r?\n/)) {
      lines.push({ start: pos, end: pos + t.length, text: t });
      pos += t.length + 1;
    }
  }

  const rows: CaptureRow[] = [];
  const seen = new Map<string, CaptureRow>();
  let collapsed = 0;

  const push = (c: Candidate, extra: Partial<Record<FieldKey, string>> = {}) => {
    const norm = normCode(c.code);
    const prev = seen.get(norm);
    if (prev) {
      prev.spans.push({ start: c.start, end: c.end });
      // Повтор мог принести то, чего не было в первом вхождении
      for (const [k, v] of Object.entries(extra)) {
        if (v && !(prev as any)[k]) (prev as any)[k] = v;
      }
      collapsed++;
      return;
    }
    const row: CaptureRow = {
      key: `c${c.start}`,
      identifier: c.code,
      verdict: c.verdict,
      spans: [{ start: c.start, end: c.end }],
      ...extra,
    };
    rows.push(row);
    seen.set(norm, row);
  };

  if (lineStructured(lines, codes)) {
    for (const line of lines) {
      const inLine = codes.filter((c) => c.start >= line.start && c.end <= line.end);
      if (!inLine.length) continue;
      // Кодом считаем лучшего кандидата строки, остальное — данные при нём.
      // Иначе марка вроде «КЦКП-10» уезжает в отдельный тег
      const main = inLine.reduce((a, b) => (b.score > a.score ? b : a));
      const a = main.start - line.start;
      const b = main.end - line.start;
      const rest = (line.text.slice(0, a) + ' ' + line.text.slice(b))
        .replace(/^[\s:;.\-–—]+|[\s:;.\-–—]+$/g, '')
        .trim();
      push(main, distribute(rest, vocab));
    }
    // Что ушло в поля, мусором быть не может: иначе слева фрагмент зачёркнут,
    // а справа он же стоит значением — инженеру не понять, чему верить.
    // Чаще всего это шифр СДР «05.02.14», неотличимый от даты
    const used = new Set<string>();
    for (const r of rows) {
      for (const f of ['brand', 'name', 'department', 'fluid', 'wbs'] as const) {
        const v = (r as any)[f];
        if (v) used.add(String(v).trim());
      }
    }
    const kept = junk.filter((j) => !used.has(j.code.trim()));
    return { raw, rows, junk: kept, mode: 'lines', shape, vocab, collapsed, truncated };
  }

  // Перечень. Строка вида «ОВ: AHU-2, AHU-3» задаёт общий признак всем своим
  // кодам: писать отдел у каждого вручную инженер не станет
  for (const line of lines) {
    const inLine = codes.filter((c) => c.start >= line.start && c.end <= line.end);
    if (!inLine.length) continue;
    let shared: Partial<Record<FieldKey, string>> = {};
    const head = /^\s*([^:]{1,40}):/.exec(line.text);
    if (head && head.index + head[0].length <= inLine[0].start - line.start) {
      const field = classifyChunk(head[1].trim(), vocab);
      if (field) shared = { [field]: head[1].trim() };
    }
    for (const c of inLine) push(c, shared);
  }
  // Коды вне строк (пустой раскол) — на всякий случай
  for (const c of codes) if (!seen.has(normCode(c.code))) push(c);
  return { raw, rows, junk, mode: 'list', shape, vocab, collapsed, truncated };
}
