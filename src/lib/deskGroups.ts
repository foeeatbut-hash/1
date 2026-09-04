/**
 * Папки на рабочем столе — как в iOS: значок на значок, и они складываются.
 *
 * Без React и без DOM, потому что ошибка здесь выглядит как пропажа. Значок,
 * попавший в папку и не показанный в ней, для человека просто исчез: на столе
 * его нет, в папке его нет, а лежит он в списке, которого не видно.
 *
 * Правила взяты из системы, где это уже работает годами:
 *   — папка из одного значка не нужна: она распускается сама;
 *   — пустая папка исчезает — иначе человек ищет глазами то, чего в ней нет;
 *   — значок лежит ровно в одной папке: копий на столе не бывает;
 *   — папка занимает одну клетку, как обычный значок.
 *
 * Проверяется scripts/test-desk-groups.ts.
 */

export interface DeskGroup {
  id: string;
  name: string;
  /** Что внутри: пути программ («/registry») и идентификаторы файлов */
  items: string[];
}

let seq = 1;
export const newGroupId = (): string => `grp${seq++}`;

export const GROUP_PREFIX = 'grp:';
export const isGroupId = (id: string): boolean => String(id || '').startsWith(GROUP_PREFIX);
export const groupIdOf = (g: DeskGroup): string => `${GROUP_PREFIX}${g.id}`;

/** Имя новой папки. Человек переименует, но пустым оно быть не должно */
export const DEFAULT_NAME = 'Папка';

/**
 * Сложить два значка в папку.
 *
 * Если один из них уже папка — второй просто ложится в неё: складывать папку
 * в папку человек не просил, а вложенные папки на столе — это лестница, по
 * которой потом лазают за каждым документом.
 */
export function fold(groups: DeskGroup[], dragged: string, target: string): DeskGroup[] {
  if (!dragged || !target || dragged === target) return groups;

  const intoGroup = groups.find((g) => groupIdOf(g) === target);
  if (intoGroup) {
    if (intoGroup.items.includes(dragged)) return groups;
    return groups.map((g) => (g.id === intoGroup.id ? { ...g, items: [...g.items, dragged] } : g));
  }
  // Тянут папку на значок — значок ложится в папку, а не наоборот
  const fromGroup = groups.find((g) => groupIdOf(g) === dragged);
  if (fromGroup) {
    if (fromGroup.items.includes(target)) return groups;
    return groups.map((g) => (g.id === fromGroup.id ? { ...g, items: [...g.items, target] } : g));
  }

  // Два обычных значка — новая папка из них
  const cleaned = withoutItems(groups, [dragged, target]);
  return [...cleaned, { id: newGroupId(), name: DEFAULT_NAME, items: [target, dragged] }];
}

/** Убрать значки из всех папок: значок лежит ровно в одной */
export function withoutItems(groups: DeskGroup[], ids: string[]): DeskGroup[] {
  const drop = new Set(ids);
  return tidy(groups.map((g) => ({ ...g, items: g.items.filter((i) => !drop.has(i)) })));
}

/** Вынуть значок из папки обратно на стол */
export function unfold(groups: DeskGroup[], groupId: string, item: string): DeskGroup[] {
  return tidy(groups.map((g) => (g.id === groupId ? { ...g, items: g.items.filter((i) => i !== item) } : g)));
}

/**
 * Прибраться: папка из одного значка распускается, пустая исчезает.
 *
 * Делается после каждой правки, а не по кнопке: папка с одним значком —
 * лишний щелчок на каждом открытии, а пустая — обещание, за которым ничего
 * нет.
 */
export function tidy(groups: DeskGroup[]): DeskGroup[] {
  return groups.filter((g) => g.items.length >= 2);
}

/** Значки, которые сейчас спрятаны в папках: на столе их показывать не надо */
export function hiddenIds(groups: DeskGroup[]): Set<string> {
  const out = new Set<string>();
  for (const g of groups) for (const i of g.items) out.add(i);
  return out;
}

export function rename(groups: DeskGroup[], groupId: string, name: string): DeskGroup[] {
  const clean = String(name || '').trim() || DEFAULT_NAME;
  return groups.map((g) => (g.id === groupId ? { ...g, name: clean } : g));
}

/** Папка по идентификатору значка стола («grp:grp1») */
export function groupById(groups: DeskGroup[], deskId: string): DeskGroup | null {
  return groups.find((g) => groupIdOf(g) === deskId) || null;
}

/**
 * Что лежит в папке — значки в том порядке, в каком их складывали.
 *
 * Искать надо среди ВСЕХ значков стола, включая те, что папка сама же и
 * спрятала. Звучит очевидно, а стоило пустой папки: стол собирал справочник
 * из уже отфильтрованного списка, где спрятанного не было, да ещё и без
 * значков программ — те рождаются отдельно, при сборке стола. Папка из двух
 * программ находила ноль значков и открывалась белым полотном.
 *
 * Отсюда и правило: `pool` — это полный список ДО фильтра по спрятанным.
 */
export function folderItems<T extends { id: string }>(group: DeskGroup, pool: T[]): T[] {
  const byId = new Map(pool.map((i) => [i.id, i]));
  return group.items.map((id) => byId.get(id)).filter(Boolean) as T[];
}

// ── Хранение ────────────────────────────────────────────────────────────────

const KEY = 'flux_desk_groups';

export function saveGroups(groups: DeskGroup[]): void {
  try { localStorage.setItem(KEY, JSON.stringify(tidy(groups))); } catch (_) { /* приватный режим */ }
}

export function loadGroups(): DeskGroup[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) return [];
    const out: DeskGroup[] = [];
    for (const g of list) {
      if (!g || typeof g.id !== 'string' || !Array.isArray(g.items)) continue;
      out.push({ id: g.id, name: String(g.name || DEFAULT_NAME), items: g.items.map((x: any) => String(x)) });
      const n = Number(String(g.id).replace(/\D/g, ''));
      if (Number.isFinite(n) && n >= seq) seq = n + 1;
    }
    return tidy(out);
  } catch (_) { return []; }
}
