/**
 * Формулы документа: именованные значения, которые подставляются в титул.
 *
 * В документе стоит плашка с названием («Дата», «Шифр с ревизией»), а как это
 * название превращается в значение — решает настройка формулы, а не текст
 * документа. Раньше в документе лежало выражение вида
 * `date & " г."`, и поменять порядок «день-месяц-год» мог только тот, кто помнит
 * синтаксис.
 *
 * Модуль чистый: данные внутрь, данные наружу. Ни React, ни обращений к
 * серверу — поэтому его целиком закрывают проверки scripts/test-formulas.ts.
 */

export type FormulaKind = 'value' | 'text' | 'compose' | 'expr' | 'signature';

/** Порядок частей даты и вид каждой части */
export interface DateFormat {
  order: 'dmy' | 'mdy' | 'ymd';
  /** num — 08 · gen — августа · nom — Август · roman — VIII */
  month: 'num' | 'gen' | 'nom' | 'roman';
  /** full — 2026 · short — 26 · suffix — 2026 г. */
  year: 'full' | 'short' | 'suffix';
  sep: string;
}

/** Вид вывода ФИО. «Инициалы» — не поле в базе, а способ показать то же ФИО */
export type NameFormat = 'full' | 'initialsAfter' | 'initialsBefore' | 'last';

/** Чьи ФИО или подпись подставлять */
export type PersonSource = 'author' | 'current' | 'user';

export interface ValueConfig {
  /** Ключ поля контекста: date · doc.code · person и т.п. */
  field: string;
  date?: Partial<DateFormat>;
  name?: NameFormat;
  person?: PersonSource;
  /** Для person = 'user' — конкретный сотрудник */
  userId?: string;
}

export interface ComposePart {
  kind: 'field' | 'text' | 'formula';
  /** Ключ поля, текст надписи или идентификатор формулы */
  value: string;
  /**
   * Разделитель ПЕРЕД частью. Печатается, только если до неё уже что-то
   * напечатано. Привязка «после части» кажется естественнее, но ломается на
   * пустом значении: убрав пустую ревизию, мы оставляли «ПЗ-001 рев. » —
   * разделитель принадлежал шифру и печатался сам по себе.
   */
  sep?: string;
  /** Настройка вывода — как у «значения» */
  format?: { date?: Partial<DateFormat>; name?: NameFormat };
}

export interface SignatureConfig {
  person?: PersonSource;
  userId?: string;
  /** Высота в документе, мм. Не в точках: иначе подпись зависит от скана */
  heightMm?: number;
}

export interface Formula {
  id: string;
  name: string;
  kind: FormulaKind;
  config: ValueConfig | { text: string } | { parts: ComposePart[] } | { expr: string } | SignatureConfig;
  /** Встроенная — её нельзя удалить и переименовать, только скопировать */
  builtin?: boolean;
  projectId?: string | null;
}

export interface FormulaContext {
  [key: string]: string | number | undefined | null;
}

/** Что формула отдала: текст или картинка (подпись) */
export type FormulaResult =
  | { kind: 'text'; text: string }
  | { kind: 'image'; src: string; heightMm: number }
  | { kind: 'missing' };

export const MAX_DEPTH = 5;

export const DEFAULT_DATE: DateFormat = { order: 'dmy', month: 'num', year: 'full', sep: '.' };

// ── Пусто или нет ───────────────────────────────────────────────────────────
// Ноль пустым не считается: «Лист 0» — ошибка данных, её надо видеть, а не
// прятать. Строка из пробелов — считается: это следы правки, а не значение.
export function isEmptyValue(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === 'number') return false;
  return String(v).trim() === '';
}

const MONTH_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MONTH_NOM = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const MONTH_ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

/** Разбор даты из того, что лежит в контексте: ISO, дд.мм.гггг или Date */
export function parseDateValue(raw: unknown): Date | null {
  if (raw instanceof Date) return isNaN(raw.getTime()) ? null : raw;
  const s = String(raw ?? '').trim();
  if (!s) return null;
  const ru = /^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})$/.exec(s);
  if (ru) {
    const d = new Date(Number(ru[3]), Number(ru[2]) - 1, Number(ru[1]));
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

export function formatDate(raw: unknown, fmt?: Partial<DateFormat>): string {
  const d = parseDateValue(raw);
  if (!d) return '';
  const f: DateFormat = { ...DEFAULT_DATE, ...(fmt || {}) };

  const day = String(d.getDate()).padStart(2, '0');
  const mi = d.getMonth();
  const month =
    f.month === 'gen' ? MONTH_GEN[mi] :
    f.month === 'nom' ? MONTH_NOM[mi] :
    f.month === 'roman' ? MONTH_ROMAN[mi] :
    String(mi + 1).padStart(2, '0');
  const y = d.getFullYear();
  const year = f.year === 'short' ? String(y).slice(-2) : f.year === 'suffix' ? `${y} г.` : String(y);

  // Месяц словом склеивается пробелами: «16.августа.2026» никто не пишет
  const sep = f.month === 'num' ? (f.sep || '.') : ' ';
  const dayPart = f.month === 'num' ? day : String(d.getDate());

  if (f.order === 'ymd') return [year, month, dayPart].join(sep);
  if (f.order === 'mdy') return [month, dayPart, year].join(sep);
  return [dayPart, month, year].join(sep);
}

/** ФИО по частям → нужный вид. Части приходят из профиля сотрудника. */
export function formatName(
  parts: { lastName?: string; firstName?: string; middleName?: string; name?: string },
  fmt: NameFormat = 'full',
): string {
  const last = (parts.lastName || '').trim();
  const first = (parts.firstName || '').trim();
  const mid = (parts.middleName || '').trim();
  // Профиль заведён до раздельного хранения — разбираем единую строку
  if (!last && parts.name) {
    const bits = String(parts.name).trim().split(/\s+/);
    return formatName({ lastName: bits[0], firstName: bits[1], middleName: bits[2] }, fmt);
  }
  if (!last && !first) return '';
  const i1 = first ? first[0].toUpperCase() + '.' : '';
  const i2 = mid ? mid[0].toUpperCase() + '.' : '';
  // Инициалы пишутся слитно — «Раупов Х.Х.», как принято в штампах отдела.
  // Между фамилией и инициалами неразрывный пробел: «Раупов Х.Х.» не должно
  // переноситься по строке — это одна подпись, а не два слова.
  const NB = '\u00A0';
  const ini = i1 + i2;                       // «Х.Х.» без пробела внутри
  switch (fmt) {
    case 'last': return last;
    case 'initialsAfter': return [last, ini].filter(Boolean).join(NB);
    case 'initialsBefore': return [ini, last].filter(Boolean).join(NB);
    default: return [last, first, mid].filter(Boolean).join(' ');
  }
}

// ── Вычислитель выражений ───────────────────────────────────────────────────
// Перенесён без изменений из titleTemplate.ts: старые плашки с выражением
// обязаны работать ровно как раньше. Никакого eval — свой разбор.
export function evalExpr(expr: string, ctx: FormulaContext): string {
  let i = 0;
  const s = expr;
  const skip = () => { while (i < s.length && /\s/.test(s[i])) i++; };

  const parsePrimary = (): any => {
    skip();
    if (s[i] === '(') { i++; const v = parseExpr(); skip(); if (s[i] === ')') i++; return v; }
    if (s[i] === '"' || s[i] === "'") {
      const q = s[i++]; let str = '';
      while (i < s.length && s[i] !== q) { str += s[i++]; }
      i++; return str;
    }
    const numMatch = /^[0-9]+(\.[0-9]+)?/.exec(s.slice(i));
    if (numMatch) { i += numMatch[0].length; return parseFloat(numMatch[0]); }
    const idMatch = /^[A-Za-zА-Яа-я_][A-Za-zА-Яа-я0-9_.]*/.exec(s.slice(i));
    if (idMatch) {
      i += idMatch[0].length;
      const raw = ctx[idMatch[0]];
      const n = typeof raw === 'number' ? raw
        : (raw != null && /^-?[0-9]+(\.[0-9]+)?$/.test(String(raw)) ? parseFloat(String(raw)) : undefined);
      return n != null ? n : String(raw ?? '');
    }
    return '';
  };

  const parseMul = (): any => {
    let v = parsePrimary();
    skip();
    while (s[i] === '*' || s[i] === '/') {
      const op = s[i++]; const r = parsePrimary();
      v = op === '*' ? Number(v) * Number(r) : Number(r) ? Number(v) / Number(r) : '';
      skip();
    }
    return v;
  };

  const parseExpr = (): any => {
    let v = parseMul();
    skip();
    while (s[i] === '+' || s[i] === '-' || s[i] === '&') {
      const op = s[i++]; const r = parseMul();
      if (op === '&') v = String(v) + String(r);
      else if (op === '+') v = (typeof v === 'number' && typeof r === 'number') ? v + r : String(v) + String(r);
      else v = Number(v) - Number(r);
      skip();
    }
    return v;
  };

  try {
    const out = parseExpr();
    return typeof out === 'number'
      ? (Number.isInteger(out) ? String(out) : String(Math.round(out * 100) / 100))
      : String(out);
  } catch (_) { return ''; }
}

// ── Кто подставляется ───────────────────────────────────────────────────────
// Ключи людей в контексте: person.author.*, person.current.*, person.<id>.*
const personPrefix = (src: PersonSource | undefined, userId?: string) =>
  src === 'current' ? 'person.current'
  : src === 'user' && userId ? `person.${userId}`
  : 'person.author';

function personParts(ctx: FormulaContext, src?: PersonSource, userId?: string) {
  const p = personPrefix(src, userId);
  return {
    lastName: String(ctx[`${p}.lastName`] ?? ''),
    firstName: String(ctx[`${p}.firstName`] ?? ''),
    middleName: String(ctx[`${p}.middleName`] ?? ''),
    name: String(ctx[`${p}.name`] ?? ''),
  };
}

/** Одно поле с настройкой вывода — общая часть «значения» и части сборки */
export function renderField(
  field: string,
  ctx: FormulaContext,
  format?: { date?: Partial<DateFormat>; name?: NameFormat; person?: PersonSource; userId?: string },
): string {
  if (field === 'person') {
    return formatName(personParts(ctx, format?.person, format?.userId), format?.name || 'full');
  }
  const raw = ctx[field];
  if (isEmptyValue(raw)) return '';
  // Поле-дата узнаётся по имени: date, dateTime, doc.date, *.date
  if (/(^|\.)date([A-Z]|$)|(^|\.)Date$/.test(field) || field === 'date') {
    const out = formatDate(raw, format?.date);
    if (out) return out;
  }
  return String(raw);
}

/**
 * Собрать значение формулы.
 *
 * `catalog` — все формулы, доступные документу, по идентификатору. Читается
 * один раз на документ: на листе может стоять сотня плашек.
 */
export function renderFormula(
  formula: Formula | undefined,
  ctx: FormulaContext,
  catalog: Record<string, Formula>,
  depth = 0,
): FormulaResult {
  if (!formula) return { kind: 'missing' };
  // Глубже пяти уровней осмысленных штампов не бывает; обрываем, чтобы
  // испорченная настройка не увела разбор в бесконечность
  if (depth > MAX_DEPTH) return { kind: 'text', text: '' };

  try {
    switch (formula.kind) {
      case 'text':
        return { kind: 'text', text: String((formula.config as any)?.text ?? '') };

      case 'value': {
        const c = formula.config as ValueConfig;
        return { kind: 'text', text: renderField(c.field, ctx, { date: c.date, name: c.name, person: c.person, userId: c.userId }) };
      }

      case 'expr':
        return { kind: 'text', text: evalExpr(String((formula.config as any)?.expr ?? ''), ctx) };

      case 'signature': {
        const c = formula.config as SignatureConfig;
        const p = personPrefix(c.person, c.userId);
        const src = String(ctx[`${p}.signature`] ?? '');
        if (!src) return { kind: 'text', text: '' };   // подписи нет — пусто, ФИО не подставляем
        const h = Number(ctx[`${p}.signatureHeightMm`] ?? 0) || c.heightMm || 8;
        return { kind: 'image', src, heightMm: h };
      }

      case 'compose': {
        const parts = ((formula.config as any)?.parts || []) as ComposePart[];
        let out = '';
        for (const part of parts) {
          let text = '';
          if (part.kind === 'text') text = String(part.value ?? '');
          else if (part.kind === 'field') text = renderField(part.value, ctx, part.format);
          else if (part.kind === 'formula') {
            const inner = renderFormula(catalog[part.value], ctx, catalog, depth + 1);
            text = inner.kind === 'text' ? inner.text : '';
          }
          if (isEmptyValue(text)) continue;
          // Разделитель части ставится перед ней и только если слева уже что-то
          // есть: нет ревизии — в титуле «ПЗ-001», а не «ПЗ-001 рев. »
          if (out) out += part.sep ?? '';
          out += text;
        }
        return { kind: 'text', text: out };
      }
    }
  } catch (_) {
    // Испорченная настройка не должна мешать открыть документ
    return { kind: 'text', text: '' };
  }
  return { kind: 'text', text: '' };
}

/**
 * Поиск ссылки формулы на саму себя. Возвращает цепочку «A → B → A», чтобы
 * человеку было видно, где кольцо. Проверяем при сохранении, а не при выводе.
 */
export function findCycle(startId: string, catalog: Record<string, Formula>): string[] | null {
  const path: string[] = [];
  const seen = new Set<string>();
  const walk = (id: string): string[] | null => {
    if (seen.has(id)) return [...path, id];
    seen.add(id);
    path.push(id);
    const f = catalog[id];
    if (f?.kind === 'compose') {
      for (const part of ((f.config as any)?.parts || []) as ComposePart[]) {
        if (part.kind !== 'formula') continue;
        const hit = walk(part.value);
        if (hit) return hit;
      }
    }
    path.pop();
    seen.delete(id);
    return null;
  };
  return walk(startId);
}

/** Названия формул в цепочке — для сообщения человеку */
export const cycleNames = (chain: string[], catalog: Record<string, Formula>) =>
  chain.map((id) => catalog[id]?.name || id).join(' → ');
