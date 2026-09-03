/**
 * Поиск по тексту ПДФ: правила без движка.
 *
 * Присланный документ читают, чтобы найти в нём место: позицию, узел, номер
 * опросного листа. До этого искать в «Просмотре» было нечем — оставалось
 * листать страницы глазами.
 *
 * Две вещи, на которых легко ошибиться и которые видно только на настоящем
 * документе:
 *
 *  • **перенос строки.** В ПДФ текст разложен кусками, и «вентиля-\nтор»
 *    встречается чаще, чем кажется. Ищем по строке, из которой убраны переносы
 *    и повторные пробелы, — иначе человек не находит слово, которое видит
 *    глазами;
 *  • **обход по кругу.** Дойдя до последнего совпадения, «дальше» обязано
 *    вернуться к первому. Иначе поиск молча упирается, и это читается как
 *    «больше не нашлось», хотя нашлось.
 */

export interface PageText {
  page: number;
  text: string;
}

export interface Hit {
  page: number;
  /** Место совпадения в приведённом тексте страницы */
  at: number;
  /** Кусок вокруг совпадения — показать человеку, не открывая страницу */
  snippet: string;
}

/** Приведение текста: переносы и повторные пробелы — в один пробел */
export function flatten(text: string): string {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

/** Сколько символов показываем вокруг совпадения */
const AROUND = 40;

export function snippetAt(text: string, at: number, len: number): string {
  const from = Math.max(0, at - AROUND);
  const to = Math.min(text.length, at + len + AROUND);
  return (from > 0 ? '…' : '') + text.slice(from, to).trim() + (to < text.length ? '…' : '');
}

/**
 * Все совпадения по страницам, по порядку.
 *
 * Регистр не различаем: человек ищет «насос», а в документе «НАСОС».
 * Пустой запрос — пустой ответ, а не «нашлось всё»: показать весь документ
 * совпадениями значит ничего не сказать.
 */
export function findInPages(pages: PageText[], query: string): Hit[] {
  const q = flatten(query).toLowerCase();
  if (!q) return [];
  const out: Hit[] = [];
  for (const p of pages) {
    const flat = flatten(p.text);
    const low = flat.toLowerCase();
    let at = low.indexOf(q);
    while (at >= 0) {
      out.push({ page: p.page, at, snippet: snippetAt(flat, at, q.length) });
      at = low.indexOf(q, at + q.length);
    }
  }
  return out;
}

/**
 * Следующее (или предыдущее) совпадение — по кругу.
 *
 * Возвращает -1, когда искать нечего: у вызывающего это единственный честный
 * признак «совпадений нет», и он не должен путать его с нулевым указателем.
 */
export function stepHit(count: number, current: number, dir: 1 | -1): number {
  if (count <= 0) return -1;
  if (current < 0) return dir === 1 ? 0 : count - 1;
  return (current + dir + count) % count;
}

/** Что написать рядом с полем поиска */
export function hitsLabel(count: number, current: number): string {
  if (!count) return 'не найдено';
  return `${current + 1} из ${count}`;
}
