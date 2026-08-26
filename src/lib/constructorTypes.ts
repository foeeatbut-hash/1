/**
 * Общие типы Конструктора: каталог проекта, результат мастера и умный блок.
 *
 * Лежат отдельно, потому что их делят экран редактора и мастер «Собрать
 * данные». Разошедшиеся описания одного и того же означали бы, что блок,
 * собранный мастером, редактор понимает иначе, чем он записан.
 */

export interface CatalogData {
  counts: { tags: number; elements: number };
  tagFields: { path: string; title: string }[];
  elementFields: { path: string; title: string }[];
  params: { group: string; key: string; unit: string; count: number; sample: string }[];
  metaKeys: { path: string; key: string; count: number }[];
  aliases?: { path: string; title: string; unit: string; members: string[]; count: number }[];
  similar?: string[][]; // группы «группа|ключ» лексически похожих сырых параметров
}

export interface WizardResult {
  headers: string[];
  rows: any[][];
  keys: string[];   // entityKey каждой строки — реестр умного блока
  query: { entity: 'tag' | 'element'; columns: { path: string; title: string }[]; filters: any[] };
  suggestedName: string;
}
