/**
 * Окна рабочего стола: список, порядок наложения и раскладка.
 *
 * Хранилище держит только состояние. Вся геометрия — в src/lib/windows.ts, без
 * React и без DOM: так её удаётся проверить скриптом, а здесь остаётся то, что
 * проверять нечем — кто над кем и что открыто.
 *
 * Раскладка сохраняется за человеком и восстанавливается при следующем входе:
 * оболочку заводят ради того, чтобы вернуться к тем же окнам на тех же местах.
 */
import { create } from 'zustand';
import {
  initialRect, moveRect, resizeRect, snapRect, toggleMaximize, raise, topWindow,
  refit, tile, type Area, type Edge, type SnapZone, type WinState,
} from '../lib/windows';

const KEY = 'flux_windows';

interface WindowState {
  windows: WinState[];
  /** Размер стола: приходит от разметки, нужен геометрии */
  area: Area;
  /** Куда прилипнет окно, если отпустить прямо сейчас — рисуется подсветкой */
  snapping: SnapZone;

  setArea: (area: Area) => void;
  /** Открыть раздел окном или поднять и развернуть уже открытое */
  open: (path: string) => void;
  close: (id: string) => void;
  focus: (id: string) => void;
  /** Нажали кнопку раздела на панели: свернуть, если это верхнее окно */
  toggle: (path: string) => void;
  minimize: (id: string) => void;
  restore: (id: string) => void;
  maximize: (id: string) => void;
  move: (id: string, dx: number, dy: number) => void;
  resize: (id: string, edge: Edge, dx: number, dy: number) => void;
  setSnapping: (zone: SnapZone) => void;
  applySnap: (id: string, zone: SnapZone) => void;
  tileAll: () => void;
  minimizeAll: () => void;
}

let seq = 0;
const newId = () => `win-${Date.now().toString(36)}-${seq++}`;

/** Что сохраняем: только раскладку, без размера стола — он свой на каждом экране */
const persist = (windows: WinState[]) => {
  try { localStorage.setItem(KEY, JSON.stringify(windows)); } catch (_) { /* приватный режим */ }
};

function restored(): WinState[] {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    // Разбираем осторожно: в хранилище могло остаться что угодно от прошлых версий
    return parsed.filter((w: any) => w && typeof w.id === 'string' && typeof w.path === 'string')
      .map((w: any): WinState => ({
        id: w.id, path: w.path,
        x: Number(w.x) || 0, y: Number(w.y) || 0,
        w: Number(w.w) || 720, h: Number(w.h) || 480,
        z: Number(w.z) || 1,
        minimized: !!w.minimized, maximized: !!w.maximized,
        restore: w.restore && typeof w.restore === 'object' ? w.restore : null,
      }));
  } catch (_) { return []; }
}

export const useWindowStore = create<WindowState>((set, get) => {
  const update = (fn: (list: WinState[]) => WinState[]) => {
    const windows = fn(get().windows);
    persist(windows);
    set({ windows });
  };

  return {
    windows: restored(),
    area: { w: 1280, h: 720 },
    snapping: null,

    setArea: (area) => {
      if (area.w < 1 || area.h < 1) return;
      const cur = get().area;
      if (cur.w === area.w && cur.h === area.h) return;
      set({ area, windows: refit(get().windows, area) });
    },

    open: (path) => {
      const { windows, area } = get();
      const found = windows.find((w) => w.path === path);
      if (found) {
        update((list) => raise(list.map((w) => (w.id === found.id ? { ...w, minimized: false } : w)), found.id));
        return;
      }
      const z = windows.reduce((m, w) => Math.max(m, w.z), 0) + 1;
      const rect = initialRect(area, windows.length);
      update((list) => [...list, { id: newId(), path, ...rect, z, minimized: false, maximized: false, restore: null }]);
    },

    close: (id) => update((list) => list.filter((w) => w.id !== id)),
    focus: (id) => update((list) => raise(list.map((w) => (w.id === id ? { ...w, minimized: false } : w)), id)),

    // Повторное нажатие по кнопке верхнего окна сворачивает его — так же
    // ведёт себя панель задач в системе, и на это рассчитывают
    toggle: (path) => {
      const { windows } = get();
      const found = windows.find((w) => w.path === path);
      if (!found) { get().open(path); return; }
      const top = topWindow(windows);
      if (top && top.id === found.id) update((list) => list.map((w) => (w.id === found.id ? { ...w, minimized: true } : w)));
      else get().focus(found.id);
    },

    minimize: (id) => update((list) => list.map((w) => (w.id === id ? { ...w, minimized: true } : w))),
    restore: (id) => get().focus(id),
    maximize: (id) => update((list) => list.map((w) => (w.id === id ? toggleMaximize(w, get().area) : w))),

    move: (id, dx, dy) => update((list) => list.map((w) => {
      if (w.id !== id) return w;
      // Тащим развёрнутое — оно «отклеивается» и возвращает прежний размер
      const base = w.maximized && w.restore ? { ...w, ...w.restore, maximized: false, restore: null } : w;
      return { ...base, ...moveRect(base, dx, dy, get().area) };
    })),

    resize: (id, edge, dx, dy) => update((list) => list.map((w) => (
      w.id === id ? { ...w, ...resizeRect(w, edge, dx, dy, get().area), maximized: false } : w
    ))),

    setSnapping: (zone) => { if (get().snapping !== zone) set({ snapping: zone }); },

    applySnap: (id, zone) => {
      if (!zone) { set({ snapping: null }); return; }
      const area = get().area;
      update((list) => list.map((w) => {
        if (w.id !== id) return w;
        const rect = snapRect(zone, area);
        return {
          ...w, ...rect,
          maximized: zone === 'top',
          restore: { x: w.x, y: w.y, w: w.w, h: w.h },
        };
      }));
      set({ snapping: null });
    },

    tileAll: () => update((list) => tile(list, get().area)),
    minimizeAll: () => update((list) => list.map((w) => ({ ...w, minimized: true }))),
  };
});

/** Пути открытых окон в порядке появления — панели задач больше ничего не нужно */
export const openPaths = (list: WinState[]): string[] => {
  const seen: string[] = [];
  for (const w of list) if (!seen.includes(w.path)) seen.push(w.path);
  return seen;
};

/** Раздел верхнего окна: его кнопка на панели показывается активной */
export const activeWindowPath = (list: WinState[]): string => topWindow(list)?.path || '';
