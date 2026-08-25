/**
 * Рабочий стол: что на нём лежит и где именно.
 *
 * Два разных вида содержимого, и различие принципиальное:
 *
 *   — ФАЙЛЫ и ПАПКИ настоящие. Они лежат в Проводнике, в системных папках
 *     «Рабочий стол» — своей у каждого сотрудника и одной общей на проект. Стол
 *     показывает обе слитно; из общей приходят помеченные значки. Отдельного
 *     хранилища у стола нет: файл, положенный на стол, обязан находиться в
 *     архиве проекта, иначе через месяц его никто не найдёт;
 *
 *   — ПРОГРАММЫ (ярлыки разделов) — не файлы. Их нет ни в Проводнике, ни в
 *     базе: это настройка сотрудника, как закреплённые кнопки на панели задач.
 *     Хранится у него же, потому что это его привычка, а не документ проекта.
 *
 * Места значков тоже личные и живут в localStorage: у сотрудников разные
 * мониторы, и раскладка, разумная на 27 дюймах, бессмысленна на ноутбуке.
 * В базе ей делать нечего.
 */
import { create } from 'zustand';
import { dataService } from '../services/dataService';
import { arrange, layout, place, withApps, type Cell, type DeskItem, type DeskKind, type SortBy } from '../lib/desktop';

const CELLS_KEY = 'flux_desk_cells';
const APPS_KEY = 'flux_desk_apps';
const SORT_KEY = 'flux_desk_sort';

/** Разделы, которые лежат на столе у нового сотрудника */
const DEFAULT_APPS = ['/explorer', '/registry', '/equipment', '/constructor'];

const read = <T,>(key: string, fallback: T): T => {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch (_) { return fallback; }
};
const write = (key: string, value: unknown) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) { /* приватный режим */ }
};

/** Значок открывает документ Конструктора, папку или раздел — по виду файла */
const kindOf = (file: any): DeskKind => {
  if (file.type !== 'CONSTRUCTOR') return 'file';
  return 'doc';
};

interface DesktopState {
  items: DeskItem[];
  apps: string[];
  cells: Record<string, Cell>;
  sortBy: SortBy;
  selected: string[];
  loading: boolean;
  error: string;
  /** Куда кладём новое: null — стола ещё нет (не вошли) */
  personalFolderId: string | null;
  sharedFolderId: string | null;

  load: (projectId: string) => Promise<void>;
  select: (ids: string[]) => void;
  setCell: (id: string, cell: Cell, area: { w: number; h: number }) => void;
  arrangeBy: (by: SortBy, area: { w: number; h: number }) => void;
  pinApp: (path: string) => void;
  unpinApp: (path: string) => void;
  createFolder: (projectId: string, scope: 'SHARED' | 'PERSONAL') => Promise<void>;
  createDoc: (projectId: string, kind: 'DOC' | 'TEXT' | 'NOTE', scope: 'SHARED' | 'PERSONAL') => Promise<string | null>;
  rename: (id: string, name: string, projectId: string) => Promise<void>;
  remove: (id: string, projectId: string) => Promise<void>;
  share: (id: string, to: 'SHARED' | 'PERSONAL', projectId: string) => Promise<void>;
}

/** Имя нового документа: дата, а не «Документ 1» — по ней его потом и ищут */
const newName = (kind: string): string => {
  const d = new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
  if (kind === 'TEXT') return `Документ — ${d}`;
  if (kind === 'NOTE') return `Заметка — ${d}`;
  return `Таблица — ${d}`;
};

export const useDesktopStore = create<DesktopState>((set, get) => ({
  items: [],
  apps: read<string[]>(APPS_KEY, DEFAULT_APPS),
  cells: read<Record<string, Cell>>(CELLS_KEY, {}),
  sortBy: read<SortBy>(SORT_KEY, 'name'),
  selected: [],
  loading: false,
  error: '',
  personalFolderId: null,
  sharedFolderId: null,

  load: async (projectId) => {
    set({ loading: true, error: '' });
    try {
      const r = await dataService.getDesktop(projectId);
      const files: DeskItem[] = (r.files || []).map((f: any) => ({
        id: f.id,
        kind: kindOf(f),
        name: f.name,
        shared: f.scope !== 'PERSONAL',
        refId: f.refId || null,
        updatedAt: f.updatedAt || f.createdAt || null,
      }));
      const folders: DeskItem[] = (r.folders || []).map((f: any) => ({
        id: f.id, kind: 'folder' as const, name: f.name,
        shared: f.scope !== 'PERSONAL', updatedAt: f.updatedAt || null,
      }));
      set({
        items: [...folders, ...files],
        personalFolderId: r.personalFolderId || null,
        sharedFolderId: r.sharedFolderId || null,
        loading: false,
      });
    } catch (err: any) {
      // Стол без сети не пуст, а неизвестен: показываем это словами, иначе
      // человек решит, что его документы пропали, и начнёт создавать заново
      set({ loading: false, error: err?.message || 'Не удалось прочитать рабочий стол' });
    }
  },

  select: (ids) => set({ selected: ids }),

  setCell: (id, cell, area) => {
    const { items, apps, cells } = get();
    const all = withApps(items, apps);
    const placed = layout(all, cells, area).cells;
    const next = place(cells, id, cell, placed);
    write(CELLS_KEY, next);
    set({ cells: next });
  },

  arrangeBy: (by, area) => {
    const next = arrange(withApps(get().items, get().apps), by, area);
    write(CELLS_KEY, next);
    write(SORT_KEY, by);
    set({ cells: next, sortBy: by });
  },

  pinApp: (path) => {
    if (get().apps.includes(path)) return;
    const apps = [...get().apps, path];
    write(APPS_KEY, apps);
    set({ apps });
  },

  unpinApp: (path) => {
    const apps = get().apps.filter((p) => p !== path);
    write(APPS_KEY, apps);
    set({ apps });
  },

  createFolder: async (projectId, scope) => {
    // Имя уникализируем на клиенте: две «Новые папки» рядом неразличимы
    const base = 'Новая папка';
    const taken = new Set(get().items.map((i) => i.name));
    let name = base;
    for (let n = 2; taken.has(name); n++) name = `${base} (${n})`;
    await dataService.createDesktopFolder(projectId, name, scope);
    await get().load(projectId);
  },

  createDoc: async (projectId, kind, scope) => {
    const r = await dataService.createDesktopDoc(projectId, kind, newName(kind), scope);
    await get().load(projectId);
    return r?.doc?.id || null;
  },

  rename: async (id, name, projectId) => {
    const item = get().items.find((i) => i.id === id);
    if (!item || !name.trim()) return;
    await dataService.renameNode(id, item.kind !== 'folder', name.trim());
    await get().load(projectId);
  },

  remove: async (id, projectId) => {
    const item = get().items.find((i) => i.id === id);
    if (!item) return;
    await dataService.trashNode(id, item.kind !== 'folder');
    // Место освободилось — забываем его, иначе клетка останется занятой
    const cells = { ...get().cells };
    delete cells[id];
    write(CELLS_KEY, cells);
    set({ cells, selected: get().selected.filter((s) => s !== id) });
    await get().load(projectId);
  },

  share: async (id, to, projectId) => {
    await dataService.moveDesktopItem(projectId, id, to);
    await get().load(projectId);
  },
}));
