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
}

export interface StartGroup {
  id: 'project' | 'global';
  title: string;
  items: StartSource[];
}

const RECENT_KEY = 'flux_recent_sections';
/** Шесть строк — столько влезает в подвал меню, не заставляя прокручивать */
export const RECENT_MAX = 6;

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

/** Разделы, доступные человеку: без чужих по правам и без служебных */
export function allowed(sections: StartSource[], isAdmin: boolean): StartSource[] {
  return sections.filter((s) => !s.adminOnly || isAdmin);
}

/**
 * Две группы, как в левом меню: проектное и общее. «Смешанные» (Главная,
 * Параметры) в группы не попадают — они и не про выбор области, а про
 * саму программу, и живут в подвале меню.
 */
export function groupSections(sections: StartSource[], isAdmin: boolean, query = ''): StartGroup[] {
  const list = allowed(sections, isAdmin).filter((s) => matches(s.title, query));
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

// ── Недавние ───────────────────────────────────────────────────────────────

/**
 * Список недавних держим сами, а не выводим из открытых панелей: панель
 * закрыли — раздел из «открытых» исчез, а из «недавних» исчезать не должен,
 * в этом весь смысл списка.
 */
export function pushRecent(list: string[], path: string, max = RECENT_MAX): string[] {
  const without = list.filter((p) => p !== path);
  return [path, ...without].slice(0, max);
}

export function readRecent(store: Pick<Storage, 'getItem'> | null): string[] {
  try {
    const raw = store?.getItem(RECENT_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string').slice(0, RECENT_MAX) : [];
  } catch (_) {
    return [];
  }
}

export function writeRecent(store: Pick<Storage, 'setItem'> | null, list: string[]): void {
  try { store?.setItem(RECENT_KEY, JSON.stringify(list.slice(0, RECENT_MAX))); } catch (_) { /* приватный режим */ }
}

/** Недавние, из которых убрано то, чего человек больше не видит по правам */
export function recentSections(paths: string[], sections: StartSource[], isAdmin: boolean): StartSource[] {
  const ok = new Map(allowed(sections, isAdmin).map((s) => [s.path, s]));
  return paths.map((p) => ok.get(p)).filter((s): s is StartSource => !!s);
}
