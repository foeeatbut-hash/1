/**
 * Поля тега и угадывание колонок по шапке таблицы.
 *
 * Жило внутри TagImportWizard; вынесено, потому что захват с экрана приносит
 * ту же таблицу из буфера обмена и должен разбирать её теми же правилами.
 * Один словарь на оба входа — иначе они разъедутся.
 */

export type FieldKey =
  | 'identifier' | 'brand' | 'name' | 'department' | 'fluid' | 'wbs' | 'parent' | 'actuality';

export const FIELDS: { key: FieldKey; label: string; hint: string }[] = [
  { key: 'identifier', label: 'Код тега', hint: 'Уникальный код (KKS)' },
  { key: 'brand', label: 'Марка', hint: 'Модель / тип' },
  { key: 'name', label: 'Наименование', hint: 'Название изделия' },
  { key: 'department', label: 'Отдел', hint: 'Дисциплина' },
  { key: 'fluid', label: 'Среда', hint: 'Назначение' },
  { key: 'wbs', label: 'WBS', hint: 'Шифр СДР' },
  { key: 'parent', label: 'Родитель', hint: 'Код родительского тега' },
  { key: 'actuality', label: 'Актуальность', hint: 'Статус' },
];

export const FIELD_LABEL: Record<string, string> =
  Object.fromEntries(FIELDS.map((f) => [f.key, f.label]));

export const detectField = (header: string): FieldKey | '' => {
  const h = (header || '').toLowerCase().trim();
  if (!h) return '';
  if (/(код\s*тег|(^|[^а-яё])тег([^а-яё]|$)|tag|kks|ккс|позиц|обознач)/.test(h)) return 'identifier';
  if (/(родит|parent|вышестоящ|принадлеж|связь)/.test(h)) return 'parent';
  if (/(марк|модел|тип(?![а-яё])|brand|артикул)/.test(h)) return 'brand';
  if (/(наимен|назван|name|описан|издели)/.test(h)) return 'name';
  if (/(отдел|дисциплин|department|раздел|подразд)/.test(h)) return 'department';
  if (/(сред|fluid|назнач|поток)/.test(h)) return 'fluid';
  if (/(wbs|сдр|шифр)/.test(h)) return 'wbs';
  if (/(актуальн|статус|состоян|status)/.test(h)) return 'actuality';
  return '';
};
