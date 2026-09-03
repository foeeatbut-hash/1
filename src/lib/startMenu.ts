/**
 * Меню «Пуск»: что в нём показывать и в каком порядке.
 *
 * Отдельно от разметки по той же причине, что и панель задач: отбор по правам,
 * поиск по названию и список недавних — ровно то место, где ошибка не видна
 * глазом. Здесь только данные внутрь и данные наружу.
 */

export interface StartSource {
  path: string;
  title: string;
  scope: 'project' | 'global' | 'mixed';
  adminOnly?: boolean;
  /** Раздел выдаётся по праву: без него его не видно нигде */
  feature?: string;
}

export interface StartGroup {
  id: 'project' | 'global';
  title: string;
  items: StartSource[];
}

/** Шесть строк — столько влезает в меню, не заставляя прокручивать */
export const RECENT_SHOWN = 6;

/**
 * Поиск по названию: без учёта регистра и без учёта раскладки — «tuub» вместо
 * «теги» человек набирает чаще, чем кажется. Раскладку разбираем простой
 * заменой по клавишам: словарь тут не нужен, названий полтора десятка.
 */
const RU_BY_EN: Record<string, string> = {
  q: 'й', w: 'ц', e: 'у', r: 'к', t: 'е', y: 'н', u: 'г', i: 'ш', o: 'щ', p: 'з',
  a: 'ф', s: 'ы', d: 'в', f: 'а', g: 'п', h: 'р', j: 'о', k: 'л', l: 'д',
  z: 'я', x: 'ч', c: 'с', v: 'м', b: 'и', n: 'т', m: 'ь',
  '[': 'х', ']': 'ъ', ';': 'ж', "'": 'э', ',': 'б', '.': 'ю',
};

export function toRu(s: string): string {
  return s.toLowerCase().split('').map((ch) => RU_BY_EN[ch] || ch).join('');
}

export function matches(title: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const t = title.toLowerCase();
  return t.includes(q) || t.includes(toRu(q));
}

/**
 * Разделы, доступные человеку: без чужих по правам и без служебных.
 *
 * `can` отвечает, есть ли у человека право. Без него разделы, закрытые правом,
 * показывались бы всем — а закрытый раздел, видный в меню, это обещание,
 * которое программа не выполнит.
 */
export function allowed(
  sections: StartSource[],
  isAdmin: boolean,
  can: (feature: string) => boolean = () => true,
): StartSource[] {
  return sections.filter((s) => (!s.adminOnly || isAdmin) && (!s.feature || isAdmin || can(s.feature)));
}

/**
 * Две группы, как в левом меню: проектное и общее. «Смешанные» (Главная,
 * Параметры) в группы не попадают — они и не про выбор области, а про
 * саму программу, и живут в подвале меню.
 */
export function groupSections(
  sections: StartSource[],
  isAdmin: boolean,
  query = '',
  can: (feature: string) => boolean = () => true,
): StartGroup[] {
  const list = allowed(sections, isAdmin, can).filter((s) => matches(s.title, query));
  const groups: StartGroup[] = [
    { id: 'project', title: 'Проект', items: list.filter((s) => s.scope === 'project') },
    { id: 'global', title: 'Общее', items: list.filter((s) => s.scope === 'global') },
  ];
  return groups.filter((g) => g.items.length > 0);
}

/** Сколько всего нашлось — по нему решается, показывать ли «ничего не найдено» */
export function countFound(groups: StartGroup[]): number {
  return groups.reduce((n, g) => n + g.items.length, 0);
}

/**
 * Недавние, из которых убрано то, чего человек больше не видит по правам.
 *
 * Сам список ведёт рабочий стол (rememberSectionUse / recentSections в
 * workspaceStore) — он же его и пишет при открытии раздела. Заводить здесь
 * второй список значило бы иметь два писателя в один ключ хранилища.
 */
export function visibleRecent(paths: string[], sections: StartSource[], isAdmin: boolean): StartSource[] {
  const ok = new Map(allowed(sections, isAdmin).map((s) => [s.path, s]));
  const seen = new Set<string>();
  const out: StartSource[] = [];
  for (const p of paths) {
    const s = ok.get(p);
    if (s && !seen.has(p)) { seen.add(p); out.push(s); }
    if (out.length >= RECENT_SHOWN) break;
  }
  return out;
}
