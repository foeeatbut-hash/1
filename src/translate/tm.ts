/**
 * Память переводов: то, что уже переводил инженер.
 *
 * Главная ценность программы в переводе — не словарь, а этот список. Ведомость
 * следующего заказа почти вся состоит из строк прошлой; опросный лист на
 * вентустановку повторяется от заказа к заказу почти дословно. Память отдаёт
 * такие строки не «примерно так», а ровно тем переводом, который инженер
 * когда-то подтвердил и который заказчик уже видел в прошлой ревизии.
 *
 * Точное совпадение ищется по нормализованному ключу — за одно обращение к
 * словарю. Похожие строки ищутся перебором, но не по всей памяти: сначала
 * отбираются те, у кого есть общие слова, иначе на десяти тысячах строк каждый
 * сегмент стоил бы полного прохода.
 */
import type { Lang, TmEntry } from './types';
import { normKey, similarity } from './segment';

export interface TmIndex {
  from: Lang;
  to: Lang;
  exact: Map<string, string>;
  /** Слово → номера строк, где оно встречается; для отбора похожих */
  byWord: Map<string, number[]>;
  entries: TmEntry[];
}

const STOP = new Set(['и', 'в', 'на', 'с', 'по', 'the', 'a', 'of', 'to', 'in', 'for', 'and']);

function keyWords(text: string): string[] {
  return normKey(text)
    .split(/[^0-9a-zа-я]+/i)
    .filter((w) => w.length > 2 && !STOP.has(w));
}

export function buildTm(entries: TmEntry[], from: Lang, to: Lang): TmIndex {
  const idx: TmIndex = { from, to, exact: new Map(), byWord: new Map(), entries: [] };
  for (const e of entries) {
    if (e.from !== from || e.to !== to || !e.src || !e.dst) continue;
    const key = normKey(e.src);
    if (!key) continue;
    const n = idx.entries.length;
    idx.entries.push(e);
    if (!idx.exact.has(key)) idx.exact.set(key, e.dst);
    for (const w of new Set(keyWords(e.src))) {
      const list = idx.byWord.get(w);
      if (list) list.push(n);
      else idx.byWord.set(w, [n]);
    }
  }
  return idx;
}

export const EMPTY_TM: TmIndex = {
  from: 'und', to: 'und', exact: new Map(), byWord: new Map(), entries: [],
};

export interface TmHit {
  dst: string;
  score: number;
  /** Исходная строка из памяти — показываем в сверке, чтобы видеть разницу */
  src: string;
}

/** Точное совпадение — то, ради чего память и заводится */
export function exactHit(idx: TmIndex, text: string): string | undefined {
  return idx.exact.get(normKey(text));
}

/**
 * Похожая строка. Порог по умолчанию 0,7 — тот же, с которого начинают
 * переводческие программы: ниже него подсказка чаще мешает, чем помогает,
 * инженер тратит на вычитку больше, чем на перевод с нуля.
 */
export function fuzzyHit(idx: TmIndex, text: string, min = 0.7): TmHit | null {
  const words = keyWords(text);
  if (!words.length) return null;
  const seen = new Map<number, number>();
  for (const w of new Set(words)) {
    for (const n of idx.byWord.get(w) || []) seen.set(n, (seen.get(n) || 0) + 1);
  }
  if (!seen.size) return null;
  // Кандидатов много не берём: отбираем тех, у кого общих слов больше всего
  const ranked = [...seen.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40);
  let best: TmHit | null = null;
  for (const [n] of ranked) {
    const e = idx.entries[n];
    const score = similarity(text, e.src);
    if (score >= min && (!best || score > best.score)) best = { dst: e.dst, score, src: e.src };
  }
  return best;
}

/** Сколько строк в памяти по этому направлению */
export function tmSize(idx: TmIndex): number {
  return idx.entries.length;
}
