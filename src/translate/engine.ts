/**
 * Цепочка перевода одного сегмента.
 *
 * Порядок не случайный, он от доверия: сначала то, что уже подтвердил человек,
 * потом то, что похоже на подтверждённое, потом готовый оборот письма, и только
 * в конце — складывание по словарю. Каждый шаг помечает результат своим
 * происхождением, и эта пометка идёт с сегментом до самого конца: в сверку, в
 * цвет строки, в решение «можно ли это отдавать заказчику».
 *
 * Локальный движок, если владелец его подключил, встаёт предпоследним: он
 * лучше словаря, но хуже прошлого труда инженера. Работает он отдельно и
 * асинхронно (см. model.ts), поэтому здесь только место под него.
 */
import type { Lang, Segment, TermPair } from './types';
import { normKey, splitSegments } from './segment';
import { protect, restore, nothingToTranslate, isSlot } from './protect';
import { buildIndex, mergeIndexes, lookupAt, tokenize, applyCase, type TermIndex } from './glossary';
import { byPhrase } from './phrases';
import { exactHit, fuzzyHit, EMPTY_TM, type TmIndex } from './tm';
import { glossZh } from './zh';
import { DOCUMENTS } from './dict/documents';
import { ENGINEERING } from './dict/engineering';
import { UNITS } from './dict/units';
import { COMMON } from './dict/common';

/**
 * Встроенный словарь. Порядок задаёт старшинство при обратном чтении: одно
 * английское слово нередко отвечает нескольким русским, и выигрывать должно то,
 * которое чаще стоит в их документах. Поэтому документооборот раньше общих слов.
 */
const BUILTIN: TermPair[] = [...DOCUMENTS, ...ENGINEERING, ...UNITS, ...COMMON];

const cache = new Map<string, TermIndex>();

/** Встроенный словарь по направлению; строится один раз на направление. */
export function builtinTerms(from: Lang, to: Lang): TermIndex {
  const key = `${from}>${to}`;
  const has = cache.get(key);
  if (has) return has;
  const idx = buildIndex(BUILTIN, from, to);
  cache.set(key, idx);
  return idx;
}

export interface EngineOptions {
  from: Lang;
  to: Lang;
  /** Память переводов проекта */
  tm?: TmIndex;
  /** Словарь проекта: он старше встроенного */
  terms?: TermIndex;
  /** Порог похожести для нечёткой памяти */
  fuzzyMin?: number;
  /** Не складывать по словарю: нужно, когда важно только точное совпадение */
  noGlossary?: boolean;
}

export interface GlossResult {
  text: string;
  /** Сколько слов нашлось и сколько было всего */
  hits: number;
  words: number;
  missing: string[];
}

/**
 * Сложить перевод по словарю. Незнакомое слово остаётся как есть: пустое место
 * вместо слова читается хуже, чем чужое слово, — и сразу видно, чего в словаре
 * не хватает.
 */
export function byGlossary(masked: string, idx: TermIndex): GlossResult {
  const toks = tokenize(masked);
  const out: string[] = [];
  const missing: string[] = [];
  let hits = 0; let words = 0;
  for (let i = 0; i < toks.length; i++) {
    const tok = toks[i];
    if (!tok.w) { out.push(tok.t); continue; }
    if (isSlot(tok.t)) { out.push(tok.t); continue; }
    if (/^\d+$/.test(tok.t)) { out.push(tok.t); continue; }
    words++;
    const hit = lookupAt(idx, toks, i);
    if (hit) {
      const srcPhrase = toks.slice(i, i + hit.span).map((t) => t.t).join('');
      out.push(applyCase(srcPhrase, hit.dst));
      hits++;
      i += hit.span - 1;
    } else {
      out.push(tok.t);
      missing.push(tok.t);
    }
  }
  return { text: out.join(''), hits, words, missing };
}

/**
 * Перевести один сегмент.
 *
 * Пустая строка, перевод строки и ячейка, в которой остались одни коды и числа,
 * проходят насквозь с пометкой «без перевода»: гнать их через словарь значит
 * засорять и память, и сверку пустышками.
 */
export function translateSegment(src: string, opts: EngineOptions): Segment {
  const text = String(src ?? '');
  if (!text.trim()) return { src: text, dst: text, origin: 'kept' };
  if (nothingToTranslate(text)) return { src: text, dst: text, origin: 'kept' };

  const tm = opts.tm || EMPTY_TM;
  const hasTm = tm.from === opts.from && tm.to === opts.to;

  if (hasTm) {
    const exact = exactHit(tm, text);
    if (exact) return { src: text, dst: exact, origin: 'tm' };
  }

  // Китайский разбирается отдельно: у него нет ни пробелов, ни узоров письма
  if (opts.from === 'zh') {
    const g = glossZh(text);
    if (!g.known) return { src: text, dst: '', origin: 'none' };
    return { src: text, dst: g.text, origin: 'glossary', score: g.total ? g.known / g.total : 0 };
  }

  if (hasTm) {
    const near = fuzzyHit(tm, text, opts.fuzzyMin ?? 0.7);
    if (near) return { src: text, dst: near.dst, origin: 'tm-fuzzy', score: near.score };
  }

  const { masked, slots } = protect(text);

  const idx = opts.terms && opts.terms.size
    ? mergeIndexes([opts.terms, builtinTerms(opts.from, opts.to)])
    : builtinTerms(opts.from, opts.to);

  // Переменную часть узора переводим словарём: «просим предоставить» — это
  // обвязка, а весь смысл письма в том, что именно просят предоставить
  const phrase = byPhrase(masked, opts.from, opts.to, (part) => {
    const g = byGlossary(part, idx);
    return g.hits ? g.text : part;
  });
  if (phrase) return { src: text, dst: restore(phrase, slots), origin: 'phrase' };

  if (opts.noGlossary) return { src: text, dst: '', origin: 'none' };
  const g = byGlossary(masked, idx);
  if (!g.hits) return { src: text, dst: '', origin: 'none', missing: g.missing };
  return {
    src: text,
    dst: restore(g.text, slots),
    origin: 'glossary',
    score: g.words ? g.hits / g.words : 0,
    missing: g.missing,
  };
}

/** Перевести текст целиком, сохранив разбивку на строки и абзацы. */
export function translateText(text: string, opts: EngineOptions): Segment[] {
  return splitSegments(text).map((s) => translateSegment(s, opts));
}

/**
 * Собрать переведённый текст обратно. Непереведённый сегмент возвращается
 * оригиналом: дыра в письме хуже, чем строка на чужом языке, и по ней сразу
 * видно, что именно осталось непонятым.
 */
export function joinSegments(segments: Segment[]): string {
  return segments.map((s) => (s.dst || s.src)).join('');
}

/** Доля сегментов, за которые можно отвечать перед заказчиком */
export function readiness(segments: Segment[]): { ready: number; total: number } {
  const real = segments.filter((s) => s.origin !== 'kept');
  const ready = real.filter((s) => s.origin === 'tm' || s.origin === 'phrase' || s.origin === 'model').length;
  return { ready, total: real.length };
}

/** Ключ памяти для сегмента — тот же, что при записи в базу */
export const memoryKey = normKey;
