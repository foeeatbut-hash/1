/**
 * Словари записаны построчно текстом, а не массивом объектов.
 *
 * Причина простая: словарь читают и правят инженеры, а не программисты. Строка
 * «расход воздуха = air flow rate» понятна без объяснений, её видно в отличиях
 * коммита целиком, и в неё не вкрадётся лишняя запятая, роняющая сборку. Разбор
 * стоит один проход при загрузке модуля.
 */
import type { TermPair } from '../types';

/**
 * Разобрать словарь. Формат строки: `русское = english`, комментарии с `#`.
 * Синонимы через `|` слева: `вентустановка | приточка = air handling unit` —
 * все они переводятся одинаково, а обратно берётся первый.
 */
export function parsePairs(block: string): TermPair[] {
  const out: TermPair[] = [];
  for (const raw of String(block || '').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const at = line.indexOf('=');
    if (at < 0) continue;
    const left = line.slice(0, at).trim();
    const right = line.slice(at + 1).trim();
    if (!left || !right) continue;
    for (const ru of left.split('|').map((x) => x.trim()).filter(Boolean)) {
      out.push({ ru, en: right });
    }
  }
  return out;
}

/** То же для китайского: `汉字 = русское значение` */
export function parseZh(block: string): TermPair[] {
  const out: TermPair[] = [];
  for (const raw of String(block || '').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const at = line.indexOf('=');
    if (at < 0) continue;
    const zh = line.slice(0, at).trim();
    const ru = line.slice(at + 1).trim();
    if (!zh || !ru) continue;
    out.push({ zh, ru, en: '' });
  }
  return out;
}
