/**
 * Рабочий стол (Workspace): раскладка разделов по панелям + keep-alive.
 *
 * Идея: одно большое окно можно поделить на 2 или 4 равные панели, в каждой —
 * свой раздел (можно даже один и тот же в четырёх экземплярах). Разделы не
 * закрываются при переключении: у каждой панели есть свой «стек» посещённых
 * разделов, все они остаются смонтированными и просто скрываются. Поэтому,
 * открыв документ в Конструкторе и уйдя в Теги, при возврате видим тот же
 * открытый документ на том же месте.
 *
 * Активная панель — та, куда попадает навигация из левого меню. Глобальный URL
 * зеркалит активный раздел активной панели (для deep-link и восстановления).
 */
import { create } from 'zustand';

export type LayoutMode = 'single' | 'dual' | 'quad';

export interface Pane {
  id: string;
  stack: string[]; // посещённые пути; последний — активный раздел панели
}

interface WorkspaceState {
  layout: LayoutMode;
  panes: Pane[];
  activePaneId: string;
  setLayout: (mode: LayoutMode, seedPath?: string) => void;
  setActivePane: (id: string) => void;
  // Открыть раздел в активной панели (клик по меню). Если уже открыт —
  // просто делаем активным (состояние сохраняется).
  openInActivePane: (path: string) => void;
  // Открыть раздел в конкретной панели
  openInPane: (paneId: string, path: string) => void;
  // Закрыть вкладку раздела в панели (уходит из keep-alive)
  closeInPane: (paneId: string, path: string) => void;
  activePathOf: (paneId: string) => string;
}

const paneCounter = { n: 0 };
const newPane = (path: string): Pane => ({ id: `pane-${Date.now().toString(36)}-${paneCounter.n++}`, stack: [path] });

const paneCountFor = (mode: LayoutMode) => (mode === 'single' ? 1 : mode === 'dual' ? 2 : 4);

const initialPane = newPane('/');

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  layout: 'single',
  panes: [initialPane],
  activePaneId: initialPane.id,

  setLayout: (mode, seedPath) => {
    const target = paneCountFor(mode);
    set((st) => {
      let panes = st.panes.slice(0, target);
      // добавляем недостающие панели, наследуя текущий активный раздел
      const seed = seedPath || st.panes.find((p) => p.id === st.activePaneId)?.stack.slice(-1)[0] || '/';
      while (panes.length < target) panes.push(newPane(seed));
      const activePaneId = panes.some((p) => p.id === st.activePaneId) ? st.activePaneId : panes[0].id;
      return { layout: mode, panes, activePaneId };
    });
  },

  setActivePane: (id) => set((st) => (st.panes.some((p) => p.id === id) ? { activePaneId: id } : {})),

  openInActivePane: (path) => get().openInPane(get().activePaneId, path),

  openInPane: (paneId, path) =>
    set((st) => ({
      activePaneId: paneId,
      panes: st.panes.map((p) => {
        if (p.id !== paneId) return p;
        const stack = p.stack.filter((x) => x !== path);
        stack.push(path);
        return { ...p, stack };
      }),
    })),

  closeInPane: (paneId, path) =>
    set((st) => ({
      panes: st.panes.map((p) => {
        if (p.id !== paneId) return p;
        const stack = p.stack.filter((x) => x !== path);
        return { ...p, stack: stack.length ? stack : ['/'] };
      }),
    })),

  activePathOf: (paneId) => {
    const p = get().panes.find((x) => x.id === paneId);
    return p ? p.stack[p.stack.length - 1] : '/';
  },
}));
