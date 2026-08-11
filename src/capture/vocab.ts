import { FieldKey } from './fields';

/**
 * Словари значений для раскладки захваченного текста по полям.
 *
 * Главный источник — сам проект: какие отделы, марки, среды и шифры уже
 * встречаются у тегов. Это тот же принцип, что у образца кода: программа
 * подстраивается под то, как принято в отделе, а не навязывает свой список.
 *
 * Встроенный перечень дисциплин нужен только для пустого проекта, где
 * сравнивать не с чем.
 */

/** Марки разделов проектной документации по СПДС — только как запасной вариант */
const BUILTIN_DEPARTMENTS = [
  'ОВ', 'ОВиК', 'ВК', 'НВК', 'ЭО', 'ЭОМ', 'ЭС', 'ЭМ', 'ЭГ', 'СС', 'СКС', 'ПС', 'АПС',
  'АР', 'АС', 'КЖ', 'КМ', 'КМД', 'ГП', 'ТХ', 'АТХ', 'ТМ', 'ГС', 'ГСВ', 'ХС', 'ВС',
  'АК', 'АУПТ', 'АСУ', 'АСУТП', 'КИПиА', 'КИП', 'ПОС', 'ПБ', 'ООС', 'ТС', 'ИТП',
];

/** Служебные слова: после них число — номер страницы или пункта, а не код */
export const STOP_WORDS = new Set([
  'стр', 'страница', 'лист', 'листов', 'рис', 'рисунок', 'табл', 'таблица',
  'п', 'пп', 'пункт', 'прим', 'примечание', 'гост', 'сп', 'снип', 'ту', 'ост',
  'изм', 'ред', 'вер', 'версия', 'от', 'до', 'кол', 'шт', 'экз', 'инв', 'подп',
  'page', 'sheet', 'fig', 'table', 'rev', 'ver', 'item', 'pos', 'no', 'qty',
]);

export interface Vocab {
  departments: Set<string>;
  brands: Set<string>;
  fluids: Set<string>;
  wbs: Set<string>;
  /** Сколько значений пришло из самого проекта — для честной подписи в окне */
  fromProject: number;
}

export const vnorm = (s: string) => (s || '').trim().toLowerCase().replace(/\s+/g, ' ');

export function buildVocab(tags: { brand?: string | null; department?: string | null;
                                   fluid?: string | null; wbs?: string | null }[]): Vocab {
  const departments = new Set<string>();
  const brands = new Set<string>();
  const fluids = new Set<string>();
  const wbs = new Set<string>();
  let fromProject = 0;

  for (const t of tags || []) {
    for (const [val, set] of [
      [t.department, departments], [t.brand, brands], [t.fluid, fluids], [t.wbs, wbs],
    ] as const) {
      const v = vnorm(String(val || ''));
      if (v) { set.add(v); fromProject++; }
    }
  }
  // Дисциплины добираем встроенным списком: в пустом проекте иначе не с чем сверять
  for (const d of BUILTIN_DEPARTMENTS) departments.add(vnorm(d));

  return { departments, brands, fluids, wbs, fromProject };
}

/** На что похож кусок текста. Пусто — ни на что из известного */
export function classifyChunk(chunk: string, vocab: Vocab): FieldKey | '' {
  const v = vnorm(chunk);
  if (!v) return '';
  if (vocab.departments.has(v)) return 'department';
  if (vocab.fluids.has(v)) return 'fluid';
  if (vocab.wbs.has(v)) return 'wbs';
  if (vocab.brands.has(v)) return 'brand';
  return '';
}

/** Шифр СДР: группы цифр через точки или дефисы, без слов */
export const looksLikeWbs = (s: string) =>
  /^[0-9]{1,4}([.\-][0-9]{1,4}){1,5}$/.test((s || '').trim());

/** Наименование — связный текст: несколько слов, преимущественно буквы */
export const looksLikeName = (s: string) => {
  const t = (s || '').trim();
  if (t.length < 4) return false;
  const words = t.split(/\s+/).filter(Boolean);
  const letters = (t.match(/[A-Za-zА-Яа-яЁё]/g) || []).length;
  return words.length >= 2 && letters / t.length > 0.55;
};

/** Марка: короткая строка, где перемешаны заглавные буквы и цифры */
export const looksLikeBrand = (s: string) => {
  const t = (s || '').trim();
  if (!t || t.length > 40) return false;
  return /[A-ZА-ЯЁ]/.test(t) && /\d/.test(t) && t.split(/\s+/).length <= 4;
};
