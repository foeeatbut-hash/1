/**
 * Рабочий стол (Workspace): раскладка разделов по панелям + keep-alive.
 *
 * Идея: одно большое окно можно поделить на 2 (столбцы или строки) или 4 равные
 * панели, в каждой — свой раздел (можно один и тот же в четырёх экземплярах).
 * Разделы не закрываются при переключении: у каждой панели свой «стек»
 * посещённых разделов, все остаются смонтированными и просто скрываются.
 * Поэтому, открыв документ в Конструкторе и уйдя в Теги, при возврате видим
 * тот же открытый документ на том же месте.
 *
 * Панели никогда не удаляются при смене раскладки (4→1→4 возвращает всё как
 * было) — раскладка лишь определяет, сколько первых панелей видно.
 * Раскладка, вкладки и адреса вкладок сохраняются per-пользователь и
 * восстанавливаются при следующем входе.
 */
import { create } from 'zustand';

export type LayoutMode = 'single' | 'dual' | 'dualh' | 'quad';

export interface Pane {
  id: string;
  stack: string[]; // посещённые пути; последний — активный раздел панели
}

export const paneCountFor = (mode: LayoutMode) => (mode === 'single' ? 1 : mode === 'quad' ? 4 : 2);

interface WorkspaceState {
  layout: LayoutMode;
  panes: Pane[];          // все созданные панели (до 4); видимы первые paneCountFor(layout)
  activePaneId: string;
  // Полный адрес (path+search) каждой вкладки: возврат к вкладке открывает её там же
  frozenHrefs: Record<string, string>; // `${paneId}::${path}` → href
  setLayout: (mode: LayoutMode) => void;
  setActivePane: (id: string) => void;
  openInActivePane: (path: string) => void;
  openInPane: (paneId: string, path: string) => void;
  closeInPane: (paneId: string, path: string) => void;
  closeOthersInPane: (paneId: string, path: string) => void;
  setFrozenHref: (paneId: string, path: string, href: string) => void;
  activePathOf: (paneId: string) => string;
  bindUser: (userId: string | null) => void;
}

const paneCounter = { n: 0 };
const newPane = (path: string): Pane => ({ id: `pane-${Date.now().toString(36)}-${paneCounter.n++}`, stack: [path] });

// ── Память раскладки per-пользователь ──
const persistKey = (userId: string) => `flux_workspace_v1_${userId}`;
let boundUserId: string | null = null;

function loadPersisted(userId: string): Partial<Pick<WorkspaceState, 'layout' | 'panes' | 'activePaneId' | 'frozenHrefs'>> | null {
  try {
    const raw = localStorage.getItem(persistKey(userId));
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (!Array.isArray(p?.panes) || !p.panes.length) return null;
    const panes: Pane[] = p.panes
      .filter((x: any) => x && typeof x.id === 'string' && Array.isArray(x.stack) && x.stack.length)
      .slice(0, 4)
      .map((x: any) => ({ id: x.id, stack: x.stack.map(String) }));
    if (!panes.length) return null;
    return {
      layout: ['single', 'dual', 'dualh', 'quad'].includes(p.layout) ? p.layout : 'single',
      panes,
      activePaneId: panes.some((x) => x.id === p.activePaneId) ? p.activePaneId : panes[0].id,
      frozenHrefs: p.frozenHrefs && typeof p.frozenHrefs === 'object' ? p.frozenHrefs : {},
    };
  } catch (_) { return null; }
}

function persist(st: WorkspaceState) {
  if (!boundUserId) return;
  try {
    localStorage.setItem(persistKey(boundUserId), JSON.stringify({
      layout: st.layout,
      panes: st.panes.map((p) => ({ id: p.id, stack: p.stack })),
      activePaneId: st.activePaneId,
      frozenHrefs: st.frozenHrefs,
    }));
  } catch (_) {}
}

const initialPane = newPane('/');

export const useWorkspaceStore = create<WorkspaceState>((set, get) => {
  // Каждое действие сохраняет состояние после применения
  const update = (fn: (st: WorkspaceState) => Partial<WorkspaceState>) => {
    set((st) => fn(st) as any);
    persist(get());
  };

  return {
    layout: 'single',
    panes: [initialPane],
    activePaneId: initialPane.id,
    frozenHrefs: {},

    setLayout: (mode) => update((st) => {
      const target = paneCountFor(mode);
      // Панели не удаляем — докидываем недостающие, наследуя активный раздел
      const seed = st.panes.find((p) => p.id === st.activePaneId)?.stack.slice(-1)[0] || '/';
      const panes = [...st.panes];
      while (panes.length < target) panes.push(newPane(seed));
      const visible = panes.slice(0, target);
      const activePaneId = visible.some((p) => p.id === st.activePaneId) ? st.activePaneId : visible[0].id;
      return { layout: mode, panes, activePaneId };
    }),

    setActivePane: (id) => update((st) => (st.panes.some((p) => p.id === id) ? { activePaneId: id } : {})),

    openInActivePane: (path) => get().openInPane(get().activePaneId, path),

    openInPane: (paneId, path) => update((st) => ({
      activePaneId: paneId,
      panes: st.panes.map((p) => {
        if (p.id !== paneId) return p;
        const stack = p.stack.filter((x) => x !== path);
        stack.push(path);
        return { ...p, stack };
      }),
    })),

    closeInPane: (paneId, path) => update((st) => {
      const frozenHrefs = { ...st.frozenHrefs };
      delete frozenHrefs[`${paneId}::${path}`];
      return {
        frozenHrefs,
        panes: st.panes.map((p) => {
          if (p.id !== paneId) return p;
          const stack = p.stack.filter((x) => x !== path);
          return { ...p, stack: stack.length ? stack : ['/'] };
        }),
      };
    }),

    closeOthersInPane: (paneId, path) => update((st) => {
      const frozenHrefs = { ...st.frozenHrefs };
      const pane = st.panes.find((p) => p.id === paneId);
      for (const x of (pane?.stack || [])) if (x !== path) delete frozenHrefs[`${paneId}::${x}`];
      return {
        frozenHrefs,
        panes: st.panes.map((p) => (p.id === paneId ? { ...p, stack: [path] } : p)),
      };
    }),

    setFrozenHref: (paneId, path, href) => {
      const st = get();
      const key = `${paneId}::${path}`;
      if (st.frozenHrefs[key] === href) return;
      update((s) => ({ frozenHrefs: { ...s.frozenHrefs, [key]: href } }));
    },

    activePathOf: (paneId) => {
      const p = get().panes.find((x) => x.id === paneId);
      return p ? p.stack[p.stack.length - 1] : '/';
    },

    // Вход пользователя: поднимаем его сохранённую раскладку
    bindUser: (userId) => {
      boundUserId = userId;
      if (!userId) return;
      const saved = loadPersisted(userId);
      if (saved) set(saved as any);
    },
  };
});

// Видимые панели текущей раскладки (первые N)
export const visiblePanes = (st: Pick<WorkspaceState, 'layout' | 'panes'>): Pane[] =>
  st.panes.slice(0, paneCountFor(st.layout));

// Вынести раздел в отдельное окно ОС (Electron) или вкладку браузера
export function openSectionWindow(path: string): void {
  const wc = (window as any).electron?.windowControls;
  if (wc?.openWindow) wc.openWindow(path);
  else window.open(`${window.location.origin}${window.location.pathname}#${path}`, '_blank', 'width=1280,height=800');
}
