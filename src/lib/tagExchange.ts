/**
 * Что именно выгружается из раздела «Теги».
 *
 * Отдельно от экрана по двум причинам. Раздел «Теги» — самый большой файл в
 * программе, и складывать в него ещё и сборку таблицы значит растить его
 * дальше. И вторая: сборку строк можно проверить скриптом, а экран — нет.
 *
 * Само окно обмена (components/ExchangeDialog) про теги не знает ничего: оно
 * спрашивает «что, куда, какие столбцы» и зовёт вот эту сборку. Так же к нему
 * подключаются остальные разделы.
 */
import type { Column } from './exchange';

/** Столбцы, которые умеет отдавать раздел «Теги» */
export const TAG_EXCHANGE_COLUMNS: Column[] = [
  { key: 'identifier', label: 'Код тега' },
  { key: 'brand', label: 'Марка' },
  { key: 'department', label: 'Отдел' },
  { key: 'wbs', label: 'WBS' },
  { key: 'fluid', label: 'Среда' },
  { key: 'chain', label: 'Цепочка' },
  { key: 'descriptions', label: 'Замечания' },
];

export interface TagExchangeHelpers {
  /** Цепочка родителей — её знает экран, здесь она приходит работой */
  lineage: (id: string) => string;
  /** Разбор замечаний из поля метаданных тега */
  meta: (tag: any) => { descriptions: { text: string; status: string; comment: string }[] };
}

/** Значение одной ячейки. Пустое поле — пустая строка, а не «undefined» */
export function tagCell(tag: any, key: string, h: TagExchangeHelpers): string {
  switch (key) {
    case 'identifier': return String(tag?.identifier || '');
    case 'brand': return String(tag?.brand || '');
    case 'department': return String(tag?.department || '');
    case 'wbs': return String(tag?.wbs || '');
    case 'fluid': return String(tag?.fluid || '');
    case 'chain': return String(h.lineage(tag?.id) || tag?.identifier || '');
    case 'descriptions': {
      const list = h.meta(tag)?.descriptions || [];
      return list
        .map((d) => `${d.text} [${String(d.status).toUpperCase()}]: ${d.comment}`)
        .join(' | ');
    }
    default: return '';
  }
}

/** Таблица для выгрузки: заголовки в том порядке, в каком выбраны столбцы */
export function buildTagExchange(tags: any[], cols: Column[], h: TagExchangeHelpers): {
  headers: string[]; rows: string[][];
} {
  return {
    headers: cols.map((c) => c.label),
    rows: (tags || []).map((t) => cols.map((c) => tagCell(t, c.key, h))),
  };
}

/** Какие столбцы включены в подборе по сегментам */
export interface SegmentColumns {
  identifier?: boolean; brand?: boolean; brandParts?: boolean; parts?: boolean;
  department?: boolean; fluid?: boolean; chain?: boolean; descriptions?: boolean;
}

export interface SegmentHelpers extends TagExchangeHelpers {
  /** Сколько сегментов в самом длинном коде и в самой длинной марке */
  segments: number;
  brandSegments: number;
  splitTag: (code: string) => string[];
  splitBrand: (brand: string) => string[];
}

/**
 * Таблица подбора по сегментам: код разбит на части, и каждая часть — столбец.
 *
 * Число столбцов зависит от данных: сегментов столько, сколько их в самом
 * длинном коде проекта. Поэтому заголовки и строки собираются в одном месте —
 * разойдись они на два, таблица поехала бы на один столбец, и заметили бы это
 * не сразу, а в Excel у заказчика.
 */
export function buildSegmentTable(tags: any[], on: SegmentColumns, h: SegmentHelpers): {
  headers: string[]; rows: string[][];
} {
  const headers: string[] = [];
  if (on.identifier) headers.push('Код тега (Tag)');
  if (on.brand) headers.push('Марка');
  if (on.brandParts) for (let i = 0; i < h.brandSegments; i++) headers.push(`Сегмент Марки ${i + 1}`);
  if (on.parts) for (let i = 0; i < h.segments; i++) headers.push(`Сегмент ${i + 1}`);
  if (on.department) headers.push('Дисциплина / Отдел');
  if (on.fluid) headers.push('Тех. Среда / Назначение');
  if (on.chain) headers.push('Инженерная Цепочка (Parent Chain)');
  if (on.descriptions) headers.push('Замечания и подописания');

  const rows = (tags || []).map((t) => {
    const row: string[] = [];
    if (on.identifier) row.push(String(t.identifier || ''));
    if (on.brand) row.push(String(t.brand || ''));
    if (on.brandParts) {
      const bp = h.splitBrand(t.brand || '');
      for (let i = 0; i < h.brandSegments; i++) row.push(bp[i] || '');
    }
    if (on.parts) {
      const parts = h.splitTag(t.identifier || '');
      for (let i = 0; i < h.segments; i++) row.push(parts[i] || '');
    }
    if (on.department) row.push(String(t.department || ''));
    if (on.fluid) row.push(String(t.fluid || ''));
    if (on.chain) row.push(String(h.lineage(t.id) || t.identifier || ''));
    if (on.descriptions) {
      const list = h.meta(t)?.descriptions || [];
      const text = list.map((d) => `${d.text} [${String(d.status).toUpperCase()}]: ${d.comment}`).join(' | ');
      row.push(text || 'Нет замечаний');
    }
    return row;
  });

  return { headers, rows };
}
