/**
 * Браузер: вкладки, закладки, история.
 *
 * Вкладки здесь — только отражение того, что происходит в главном процессе
 * (electron/browser.ts): страницы живут там, отдельными процессами. Хранилище
 * знает про них ровно то, что рисует адресная строка, — адрес, заголовок,
 * можно ли назад.
 *
 * Закладки общие на проект и лежат на сервере: сайты заказчика, порталы
 * поставщиков и ГОСТы — это то, чем пользуется отдел, а не один человек.
 * История, наоборот, личная и живёт в браузере этой машины: список того, куда
 * человек ходил, — не данные проекта, и в общей базе ему делать нечего.
 */
import { create } from 'zustand';
import { ENV_CONFIG, getAuthToken } from '../config/env';
import { DEFAULT_ENGINE, resolveInput, allowedByList, tabLabel } from '../lib/browserUrl';

export interface BrowserTab {
  id: string;
  url: string;
  title: string;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  /** Страница не открылась: показываем словами, а не белым листом */
  error: string;
}

export interface Bookmark { id: string; title: string; url: string }
export interface HistoryItem { url: string; title: string; at: number }

const HISTORY_KEY = 'flux_browser_history';
const ENGINE_KEY = 'flux_browser_engine';
/** История длиннее тысячи строк никому не нужна, а память занимает */
const HISTORY_MAX = 1000;

const api = () => (window as any).electron?.browser || null;

const readHistory = (): HistoryItem[] => {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch (_) { return []; }
};

const writeHistory = (list: HistoryItem[]) => {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, HISTORY_MAX))); } catch (_) { /* приватный режим */ }
};

const authHeaders = (): Record<string, string> => {
  const t = getAuthToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
};

interface BrowserState {
  ready: boolean;
  tabs: BrowserTab[];
  activeId: string;
  bookmarks: Bookmark[];
  history: HistoryItem[];
  engine: string;
  /** Пустой список — можно куда угодно; заполненный — только туда */
  allowed: string[];
  projectId: string;
  /**
   * Адрес, переданный браузеру со стороны: ссылка из письма, чата или
   * заметки. Окно забирает его при открытии и очищает — иначе следующий
   * приход в раздел снова открывал бы прошлую ссылку.
   */
  pending: string;
  setPending: (url: string) => void;

  load: (projectId: string) => Promise<void>;
  newTab: (url?: string) => Promise<void>;
  closeTab: (id: string) => Promise<void>;
  select: (id: string) => Promise<void>;
  /** Ввели в адресную строку: сами решаем, адрес это или запрос */
  open: (input: string, tabId?: string) => Promise<{ ok: boolean; reason?: string }>;
  act: (action: 'back' | 'forward' | 'reload' | 'stop' | 'zoom-in' | 'zoom-out' | 'zoom-reset' | 'external') => Promise<void>;
  /** Пришло состояние из главного процесса */
  applyState: (s: Partial<BrowserTab> & { id: string }) => void;
  setFailed: (id: string, desc: string) => void;
  addOpened: (id: string, url: string) => void;
  setEngine: (id: string) => void;
  toggleBookmark: () => Promise<void>;
  removeBookmark: (id: string) => Promise<void>;
  clearHistory: () => void;
  setAllowed: (list: string[]) => Promise<void>;
}

const emptyTab = (id: string, url = ''): BrowserTab => ({
  id, url, title: '', loading: false, canGoBack: false, canGoForward: false, error: '',
});

export const useBrowserStore = create<BrowserState>((set, get) => ({
  ready: false,
  tabs: [],
  activeId: '',
  bookmarks: [],
  history: readHistory(),
  engine: (() => { try { return localStorage.getItem(ENGINE_KEY) || DEFAULT_ENGINE; } catch (_) { return DEFAULT_ENGINE; } })(),
  allowed: [],
  projectId: '',
  pending: '',

  setPending: (url) => set({ pending: String(url || '') }),

  load: async (projectId) => {
    set({ projectId });
    // Закладки — общие на проект, список разрешённых адресов — общий на
    // программу: его заводит администратор, и он один на всех
    try {
      const [b, a] = await Promise.all([
        fetch(`${ENV_CONFIG.apiUrl}/settings/browser_bookmarks_${projectId || 'global'}`, { headers: authHeaders() }),
        fetch(`${ENV_CONFIG.apiUrl}/settings/browser_allowed`, { headers: authHeaders() }),
      ]);
      const bj = b.ok ? await b.json() : {};
      const aj = a.ok ? await a.json() : {};
      const parse = (raw: any) => {
        try { const v = raw ? JSON.parse(raw) : []; return Array.isArray(v) ? v : []; } catch (_) { return []; }
      };
      set({ bookmarks: parse(bj.global), allowed: parse(aj.global).map((x: any) => String(x)), ready: true });
    } catch (_) {
      set({ ready: true });
    }
  },

  newTab: async (url = '') => {
    const b = api();
    if (!b) return;
    const id: string = await b.newTab(url);
    if (!id) return;
    set({ tabs: [...get().tabs, emptyTab(id, url)], activeId: id });
  },

  closeTab: async (id) => {
    const b = api();
    if (b) await b.closeTab(id);
    const rest = get().tabs.filter((t) => t.id !== id);
    // Закрыли показанную — показываем соседнюю справа, как в браузере
    let next = get().activeId;
    if (next === id) {
      const was = get().tabs.findIndex((t) => t.id === id);
      next = rest[Math.min(was, rest.length - 1)]?.id || '';
    }
    set({ tabs: rest, activeId: next });
    if (next && b) await b.show(next);
  },

  select: async (id) => {
    const b = api();
    set({ activeId: id });
    if (b) await b.show(id);
  },

  open: async (input, tabId) => {
    const st = get();
    const id = tabId || st.activeId;
    if (!id) { await st.newTab(); }
    const target = tabId || get().activeId;
    const r = resolveInput(input, st.engine);
    if (r.how === 'blocked') return { ok: false, reason: 'Такой адрес открывать нельзя' };
    if (!r.url) return { ok: false, reason: '' };
    if (!allowedByList(r.url, st.allowed)) {
      return { ok: false, reason: 'Адрес не в списке разрешённых. Список ведёт администратор в параметрах' };
    }
    const b = api();
    if (b && target) await b.go(target, r.url);
    return { ok: true };
  },

  act: async (action) => {
    const b = api();
    const id = get().activeId;
    if (b && id) await b.action(id, action);
  },

  applyState: (s) => {
    const tabs = get().tabs.map((t) => (t.id === s.id ? { ...t, ...s, error: s.url ? '' : t.error } : t));
    set({ tabs });
    // В историю пишем только завершённую загрузку: иначе туда попадают все
    // промежуточные перескоки, и найти в ней что-то становится нельзя
    if (s.url && s.loading === false) {
      const title = tabLabel(String(s.title || ''), s.url);
      const list = [{ url: s.url, title, at: Date.now() }, ...get().history.filter((h) => h.url !== s.url)];
      writeHistory(list);
      set({ history: list.slice(0, HISTORY_MAX) });
    }
  },

  setFailed: (id, desc) => set({
    tabs: get().tabs.map((t) => (t.id === id ? { ...t, error: desc, loading: false } : t)),
  }),

  addOpened: (id, url) => {
    if (get().tabs.some((t) => t.id === id)) return;
    set({ tabs: [...get().tabs, emptyTab(id, url)], activeId: id });
  },

  setEngine: (id) => {
    try { localStorage.setItem(ENGINE_KEY, id); } catch (_) { /* приватный режим */ }
    set({ engine: id });
  },

  toggleBookmark: async () => {
    const st = get();
    const tab = st.tabs.find((t) => t.id === st.activeId);
    if (!tab?.url) return;
    const has = st.bookmarks.find((b) => b.url === tab.url);
    const next = has
      ? st.bookmarks.filter((b) => b.url !== tab.url)
      : [...st.bookmarks, { id: `bm-${Date.now()}`, title: tabLabel(tab.title, tab.url), url: tab.url }];
    set({ bookmarks: next });
    await saveBookmarks(st.projectId, next);
  },

  removeBookmark: async (id) => {
    const next = get().bookmarks.filter((b) => b.id !== id);
    set({ bookmarks: next });
    await saveBookmarks(get().projectId, next);
  },

  clearHistory: () => { writeHistory([]); set({ history: [] }); },

  setAllowed: async (list) => {
    const clean = list.map((s) => String(s || '').trim()).filter(Boolean);
    set({ allowed: clean });
    try {
      await fetch(`${ENV_CONFIG.apiUrl}/settings/browser_allowed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ value: JSON.stringify(clean) }),
      });
    } catch (_) { /* сохранится при следующей попытке */ }
  },
}));

async function saveBookmarks(projectId: string, list: Bookmark[]): Promise<void> {
  try {
    await fetch(`${ENV_CONFIG.apiUrl}/settings/browser_bookmarks_${projectId || 'global'}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ value: JSON.stringify(list) }),
    });
  } catch (_) { /* закладка осталась на экране; сохранится при следующей правке */ }
}
