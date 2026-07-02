// Словарь распознавания: синонимы полей, типы оборудования, единицы измерения,
// валидация значений. Расширяется без изменения логики recognize.ts.

export type ValueKind = 'number' | 'code' | 'text' | 'dims' | 'enum';

export interface FieldDef {
  id: string;
  /** Каноническая подпись для карточки оборудования */
  label: string;
  /** Куда идёт значение: свойство позиции или характеристика */
  target: 'name' | 'brand' | 'system' | 'qty' | 'spec';
  group: string;
  synonyms: string[];
  kind: ValueKind;
  units?: string[];
  /** Разумный диапазон для чисел — защита от мусора под якорем */
  range?: [number, number];
}

// Порядок синонимов не важен; сравнение идёт по нормализованной подписи (см. normalizeLabel)
export const FIELDS: FieldDef[] = [
  { id: 'name', label: 'Наименование', target: 'name', group: 'Общие',
    synonyms: ['наименование', 'название', 'изделие', 'оборудование', 'наименование оборудования', 'наименование изделия', 'позиция', 'предмет закупки'],
    kind: 'text' },
  { id: 'brand', label: 'Марка', target: 'brand', group: 'Общие',
    synonyms: ['марка', 'тип', 'типоразмер', 'модель', 'артикул', 'обозначение', 'маркировка', 'марка типоразмер', 'тип модель', 'исполнение модель'],
    kind: 'code' },
  { id: 'system', label: 'Система', target: 'system', group: 'Общие',
    synonyms: ['система', 'номер системы', 'обслуживаемая система', '系统'],
    kind: 'code' },
  { id: 'qty', label: 'Количество', target: 'qty', group: 'Общие',
    synonyms: ['количество', 'кол во', 'кол-во', 'шт', 'число', 'колво'],
    kind: 'number', units: ['шт', 'компл'], range: [0.001, 1000000] },
  { id: 'manufacturer', label: 'Производитель', target: 'spec', group: 'Общие',
    synonyms: ['производитель', 'изготовитель', 'завод изготовитель', 'поставщик', 'фирма'],
    kind: 'text' },

  // ── Аэродинамика/гидравлика ──
  { id: 'airflow', label: 'Расход воздуха', target: 'spec', group: 'Аэродинамика',
    synonyms: ['расход', 'расход воздуха', 'производительность', 'производительность по воздуху', 'подача', 'воздухопроизводительность', 'объемный расход'],
    kind: 'number', units: ['м3/ч', 'м³/ч', 'л/с', 'тыс. м3/ч'], range: [1, 2000000] },
  { id: 'pressure', label: 'Давление', target: 'spec', group: 'Аэродинамика',
    synonyms: ['давление', 'напор', 'полное давление', 'статическое давление', 'располагаемое давление', 'потери давления', 'сопротивление'],
    kind: 'number', units: ['па', 'кпа', 'мм вод ст', 'бар'], range: [1, 100000] },
  { id: 'waterflow', label: 'Расход теплоносителя', target: 'spec', group: 'Гидравлика',
    synonyms: ['расход воды', 'расход теплоносителя', 'расход жидкости'],
    kind: 'number', units: ['л/с', 'м3/ч', 'кг/с', 'л/ч'], range: [0.001, 100000] },

  // ── Электрика ──
  { id: 'power', label: 'Мощность', target: 'spec', group: 'Электрика',
    synonyms: ['мощность', 'мощность двигателя', 'потребляемая мощность', 'установленная мощность', 'номинальная мощность', 'эл мощность', 'электрическая мощность'],
    kind: 'number', units: ['квт', 'вт'], range: [0.001, 10000] },
  { id: 'voltage', label: 'Напряжение', target: 'spec', group: 'Электрика',
    synonyms: ['напряжение', 'питание', 'напряжение питания', 'питающее напряжение', 'сеть'],
    kind: 'number', units: ['в', 'v', 'вольт'], range: [5, 1000] },
  { id: 'current', label: 'Ток', target: 'spec', group: 'Электрика',
    synonyms: ['ток', 'номинальный ток', 'рабочий ток', 'потребляемый ток'],
    kind: 'number', units: ['а', 'a'], range: [0.01, 5000] },
  { id: 'rpm', label: 'Частота вращения', target: 'spec', group: 'Электрика',
    synonyms: ['обороты', 'частота вращения', 'скорость вращения', 'число оборотов'],
    kind: 'number', units: ['об/мин', 'об мин', 'rpm'], range: [50, 50000] },

  // ── Тепло ──
  { id: 'heatpower', label: 'Тепловая мощность', target: 'spec', group: 'Тепло',
    synonyms: ['тепловая мощность', 'теплопроизводительность', 'холодопроизводительность', 'мощность нагрева', 'мощность охлаждения'],
    kind: 'number', units: ['квт', 'вт', 'ккал/ч'], range: [0.01, 50000] },
  { id: 'temp', label: 'Температура', target: 'spec', group: 'Тепло',
    synonyms: ['температура', 'температура среды', 'рабочая температура', 'температура теплоносителя', 'темп воздуха'],
    kind: 'number', units: ['°c', 'с', 'c', 'град'], range: [-100, 1200] },

  // ── Конструкция ──
  { id: 'dims', label: 'Габариты', target: 'spec', group: 'Конструкция',
    synonyms: ['габариты', 'размеры', 'габаритные размеры', 'размер', 'шхвхг', 'вхшхг', 'дхшхв', 'lxbxh'],
    kind: 'dims', units: ['мм', 'см', 'м'] },
  { id: 'size', label: 'Присоединительный размер', target: 'spec', group: 'Конструкция',
    synonyms: ['сечение', 'присоединительный размер', 'диаметр', 'ду', 'dn', 'условный проход', 'типоразмер сечения', 'присоединение'],
    kind: 'dims', units: ['мм'] },
  { id: 'weight', label: 'Масса', target: 'spec', group: 'Конструкция',
    synonyms: ['масса', 'вес', 'масса нетто', 'вес нетто'],
    kind: 'number', units: ['кг', 'г', 'т'], range: [0.01, 100000] },
  { id: 'material', label: 'Материал', target: 'spec', group: 'Конструкция',
    synonyms: ['материал', 'материал корпуса', 'корпус', 'исполнение корпуса'],
    kind: 'text' },
  { id: 'noise', label: 'Уровень шума', target: 'spec', group: 'Конструкция',
    synonyms: ['шум', 'уровень шума', 'звуковое давление', 'уровень звукового давления', 'шумовые характеристики'],
    kind: 'number', units: ['дб', 'дб(а)', 'дба'], range: [1, 200] },
  { id: 'filterclass', label: 'Класс фильтрации', target: 'spec', group: 'Конструкция',
    synonyms: ['класс фильтра', 'класс очистки', 'класс фильтрации', 'степень очистки'],
    kind: 'code' },
];

// Типы оборудования: слово в тексте → equipType + категория раздела «Оборудование»
export interface EquipTypeDef { id: string; category: string; label: string; words: string[]; composite?: boolean }

export const EQUIP_TYPES: EquipTypeDef[] = [
  { id: 'ahu', category: 'AHU', label: 'Приточная установка', composite: true,
    words: ['приточная установка', 'приточно-вытяжная', 'вентиляционная установка', 'центральный кондиционер', 'пву', 'ahu', 'кондиционер центральный', 'вентустановка'] },
  { id: 'fan', category: 'FAN', label: 'Вентилятор',
    words: ['вентилятор', 'вентиляторы', 'fan'] },
  { id: 'valve', category: 'VALVE', label: 'Клапан',
    words: ['клапан', 'заслонка', 'воздушный клапан', 'противопожарный клапан', 'обратный клапан', 'кпу', 'valve'] },
  { id: 'curtain', category: 'CURTAIN', label: 'Воздушная завеса',
    words: ['завеса', 'воздушная завеса', 'тепловая завеса'] },
  { id: 'heater', category: 'AHU', label: 'Калорифер',
    words: ['калорифер', 'нагреватель', 'воздухонагреватель', 'охладитель', 'воздухоохладитель', 'теплообменник'] },
  { id: 'filter', category: 'AHU', label: 'Фильтр',
    words: ['фильтр', 'фильтры'] },
  { id: 'silencer', category: 'AHU', label: 'Шумоглушитель',
    words: ['шумоглушитель', 'глушитель'] },
  { id: 'recuperator', category: 'AHU', label: 'Рекуператор',
    words: ['рекуператор', 'роторный теплообменник', 'пластинчатый теплообменник'] },
  { id: 'pump', category: 'FAN', label: 'Насос',
    words: ['насос', 'насосы'] },
  { id: 'grille', category: 'VALVE', label: 'Решётка',
    words: ['решетка', 'решётка', 'диффузор', 'анемостат'] },
];

// Слова-маркеры мусорных блоков (шапки, подписи, реквизиты).
// «Лист 3» / «стр. 5» ловятся отдельным регэкспом в classifyParagraph,
// чтобы не задеть «Опросный лист на…».
export const GARBAGE_MARKERS = [
  'утвержда', 'соглас', 'подпись', 'расшифровка', 'должность', 'печать', 'реквизит',
  'страница', 'инн', 'кпп', 'огрн', 'р/с', 'бик',
];

/** Номера страниц/листов: «Лист 3 из 8», «стр. 5» */
export const PAGE_MARKER_RE = /^(?:лист|стр|страница|page)\.?\s*№?\s*\d+/i;

// ── Нормализация ─────────────────────────────────────────────────────────────

/** Нормализация подписи поля для сравнения со словарём */
export function normalizeLabel(raw: string): string {
  let s = (raw || '').toLowerCase().replace(/ё/g, 'е');
  s = s.replace(/\(.*?\)/g, ' ');            // скобки с пояснениями
  s = s.split(/[,;]/)[0];                     // «Расход, м³/ч» → «Расход»
  s = s.replace(/[.:*№"«»]/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

/** Похожие кириллические буквы → латиница (для кодов/марок) */
const CYR_TO_LAT: Record<string, string> = {
  'А': 'A', 'В': 'B', 'С': 'C', 'Е': 'E', 'Н': 'H', 'К': 'K', 'М': 'M',
  'О': 'O', 'Р': 'P', 'Т': 'T', 'Х': 'X', 'У': 'Y',
  'а': 'a', 'в': 'b', 'с': 'c', 'е': 'e', 'о': 'o', 'р': 'p', 'х': 'x', 'у': 'y', 'к': 'k', 'м': 'm', 'н': 'h', 'т': 't',
};

export function normalizeCode(raw: string): { value: string; changed: boolean } {
  const src = (raw || '').trim();
  // Меняем только если строка выглядит как код: есть цифра и латиница/разделители
  if (!/\d/.test(src)) return { value: src, changed: false };
  let out = '';
  let changed = false;
  for (const ch of src) {
    if (CYR_TO_LAT[ch] !== undefined) { out += CYR_TO_LAT[ch]; changed = true; }
    else out += ch;
  }
  return { value: out, changed };
}

/** Число из строки документа: «5 000,5» → 5000.5; «тыс.» → ×1000. NaN, если не число */
export function parseNumber(raw: string): number {
  let s = (raw || '').toLowerCase().replace(/\s| /g, '');
  const thousands = /тыс/.test(raw.toLowerCase());
  s = s.replace(',', '.');
  const m = s.match(/-?\d+(?:\.\d+)?/);
  if (!m) return NaN;
  let n = parseFloat(m[0]);
  if (thousands) n *= 1000;
  return n;
}

const UNIT_ALIASES: Record<string, string> = {
  'м3/ч': 'м³/ч', 'м3/час': 'м³/ч', 'm3/h': 'м³/ч', 'куб.м/ч': 'м³/ч', 'м³/час': 'м³/ч',
  'квт': 'кВт', 'kw': 'кВт', 'вт': 'Вт', 'w': 'Вт',
  'па': 'Па', 'pa': 'Па', 'кпа': 'кПа',
  'об/мин': 'об/мин', 'обмин': 'об/мин', 'rpm': 'об/мин', 'об.мин': 'об/мин',
  'дб': 'дБ', 'дб(а)': 'дБ(А)', 'дба': 'дБ(А)',
  'кг': 'кг', 'г': 'г', 'т': 'т',
  'мм': 'мм', 'см': 'см', 'м': 'м',
  'в': 'В', 'v': 'В', 'вольт': 'В', 'а': 'А',
  '°c': '°C', 'гр.c': '°C', 'град': '°C', 'c': '°C', 'с': '°C',
  'л/с': 'л/с', 'л/ч': 'л/ч', 'шт': 'шт', 'компл': 'компл',
};

/** Отделяет единицу измерения от значения: «5000 м3/ч» → { num: '5000', unit: 'м³/ч' } */
export function splitValueUnit(raw: string): { value: string; unit: string } {
  const s = (raw || '').trim();
  const m = s.match(/^(-?[\d\s .,]+(?:тыс\.?)?)\s*([^\d\s].*)?$/i);
  if (!m) return { value: s, unit: '' };
  const unitRaw = (m[2] || '').trim().toLowerCase().replace(/\.$/, '');
  const unit = UNIT_ALIASES[unitRaw] || (m[2] || '').trim();
  return { value: m[1].trim(), unit };
}

/** Единица из подписи: «Расход воздуха, м³/ч» → м³/ч */
export function unitFromLabel(rawLabel: string): string {
  const m = (rawLabel || '').match(/[,(]\s*([^,()]+?)\s*\)?\s*$/);
  if (!m) return '';
  const candidate = m[1].trim().toLowerCase();
  return UNIT_ALIASES[candidate] || '';
}

// ── Сопоставление подписи со словарём ────────────────────────────────────────

/** Дешёвое расстояние Левенштейна (для слов до ~24 символов, порог 1) */
export function lev1(a: string, b: string): boolean {
  if (a === b) return true;
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < la && j < lb) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (la > lb) i++;
    else if (lb > la) j++;
    else { i++; j++; }
  }
  return edits + (la - i) + (lb - j) <= 1;
}

export interface LabelMatch { field: FieldDef; score: number; }

/** Ищет поле словаря по подписи; null — подпись не наша */
export function matchLabel(rawLabel: string): LabelMatch | null {
  const label = normalizeLabel(rawLabel);
  if (!label || label.length < 2) return null;
  let best: LabelMatch | null = null;
  for (const f of FIELDS) {
    for (const syn of f.synonyms) {
      let score = 0;
      if (label === syn) score = 100 + syn.length;
      else if (label.startsWith(syn + ' ') || label.endsWith(' ' + syn) || label.includes(' ' + syn + ' ')) score = 60 + syn.length;
      else if (syn.includes(' ') && label.includes(syn)) score = 55 + syn.length;
      else if (syn.length >= 5 && label.split(' ').some(w => lev1(w, syn))) score = 40 + syn.length;
      if (score > 0 && (!best || score > best.score)) best = { field: f, score };
    }
  }
  // Отсечка: слишком слабое совпадение на длинной постороннней подписи — не считаем
  if (best && best.score < 45 && label.length > 30) return null;
  return best;
}

/** Лёгкий стемминг: отрезает типовое окончание («завесу» и «завеса» → «завес») */
export function stemRu(w: string): string {
  if (w.length <= 4) return w;
  return w.replace(/(иями|ями|ами|ыми|ими|ой|ей|ый|ий|ая|яя|ое|ее|ую|юю|ом|ем|ах|ях|ов|ев|ам|ям|а|я|о|е|ь|у|ю|ы|и)$/,'');
}

/** Определение типа оборудования по тексту (название, заголовок секции).
 * Сравнение по основам слов — «завеса/завесу/завесы» распознаются одинаково. */
export function detectEquip(text: string): EquipTypeDef | null {
  const t = ' ' + (text || '').toLowerCase().replace(/ё/g, 'е') + ' ';
  let best: EquipTypeDef | null = null;
  let bestLen = 0;
  for (const e of EQUIP_TYPES) {
    for (const w of e.words) {
      if (w.length <= bestLen) continue;
      // Каждое слово словарной фразы должно встретиться в тексте как основа
      const tokens = w.split(' ');
      const allFound = tokens.every(tok => {
        const stem = stemRu(tok);
        if (stem.length < 3) return t.includes(' ' + tok);
        return t.includes(stem);
      });
      if (allFound) { best = e; bestLen = w.length; }
    }
  }
  return best;
}

/** Обозначение системы в тексте: П1, В-2, ПВ3, ДУ1... */
export function findSystem(text: string): string | null {
  const m = (text || '').match(/(?:^|[\s,(«])((?:ПВ|ДУ|ДВ|КД|ПД|П|В|У|K)\s?-?\d{1,3})(?=[\s.,;)»]|$)/);
  return m ? m[1].replace(/\s/g, '') : null;
}

/** Код марки/тега: латиница-цифры с разделителями, минимум одна цифра */
export const CODE_RE = /([A-Za-zА-Яа-я0-9]{1,}(?:[\-./\\][A-Za-zА-Яа-я0-9,]{1,}){1,})/g;

export function looksLikeCode(s: string): boolean {
  const t = (s || '').trim();
  if (t.length < 3 || t.length > 40) return false;
  if (!/\d/.test(t)) return false;
  if (/\s{2,}/.test(t)) return false;
  return /^[A-Za-zА-Яа-я0-9\-./\\,()×xх ]+$/.test(t) && /[-./\\]/.test(t);
}

// ── Валидация значения по типу поля ──────────────────────────────────────────

export type ValidationVerdict = 'ok' | 'suspicious' | 'reject';

export function validateValue(f: FieldDef, value: string, unit: string): ValidationVerdict {
  const v = (value || '').trim();
  if (!v) return 'reject';
  switch (f.kind) {
    case 'number': {
      // Значение должно НАЧИНАТЬСЯ с числа: «ВР-80» под якорем «Расход» — мусор,
      // хотя parseNumber и вытащил бы из него «-80»
      if (!/^[~≈<>±]?\s*[-+]?\s*\d/.test(v)) return 'reject';
      const n = parseNumber(v);
      if (isNaN(n)) return 'reject';
      if (f.range && (n < f.range[0] || n > f.range[1])) return 'suspicious';
      return 'ok';
    }
    case 'dims': {
      // «400х400», «1000×500×300», «Ø315», просто число
      if (/^\s*[øΦф]?\s*\d+([xх×*]\d+){0,2}\s*(мм|см|м)?\s*$/i.test(v.replace(/\s/g, ''))) return 'ok';
      if (!isNaN(parseNumber(v))) return 'ok';
      return 'reject';
    }
    case 'code': {
      if (v.length > 60) return 'reject';
      if (/\d/.test(v) || v.length <= 25) return 'ok';
      return 'suspicious';
    }
    case 'text': {
      if (v.length > 200) return 'suspicious';
      return 'ok';
    }
    default:
      return 'ok';
  }
}
