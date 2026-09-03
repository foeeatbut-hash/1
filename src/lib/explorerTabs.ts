/**
 * Вкладки Проводника: состав, порядок и что остаётся после закрытия.
 *
 * Без React и без DOM — как и всё, что ломается незаметно. Закрытая вкладка,
 * после которой показалась не соседняя, а первая попавшаяся, выглядит не как
 * ошибка, а как «программа опять куда-то ушла»; вкладка, потерявшая имя,
 * превращается в безымянный ярлык, по которому невозможно вернуться.
 *
 * Правила взяты из настоящего проводника и из браузера, потому что оттуда же
 * у людей и привычка:
 *   — закрыли показанную вкладку → показывается соседняя СПРАВА, а если её
 *     нет — слева;
 *   — последняя вкладка не закрывается: окно без вкладок показывать нечего;
 *   — открытие той же папки не плодит близнецов, а переходит на неё.
 *
 * Проверяется scripts/test-explorer-tabs.ts.
 */

export interface ExpTab {
  id: string;
  /** Папка вкладки; null — корень Проводника */
  folderId: string | null;
  /** Что написано на вкладке */
  name: string;
}

export const ROOT_NAME = 'Проводник';

let seq = 1;
export const newTabId = (): string => `tab${seq++}`;

export const makeTab = (folderId: string | null = null, name = ROOT_NAME): ExpTab => ({
  id: newTabId(), folderId, name: name || ROOT_NAME,
});

/** Вкладок всегда хотя бы одна: окно без вкладок — не состояние программы */
export function safeTabs(tabs: ExpTab[]): ExpTab[] {
  const list = (tabs || []).filter((t) => t && typeof t.id === 'string');
  return list.length ? list : [makeTab()];
}

/** Показанная вкладка; если указатель сбит — первая */
export function activeOf(tabs: ExpTab[], activeId: string): ExpTab {
  const list = safeTabs(tabs);
  return list.find((t) => t.id === activeId) || list[0];
}

/**
 * Закрыть вкладку. Возвращает и новый список, и то, что показывать дальше.
 *
 * Показывается соседняя справа — так делает браузер, и рука уже привыкла к
 * тому, что после закрытия под курсором оказывается следующая, а не первая.
 */
export function closeTab(tabs: ExpTab[], id: string, activeId: string): { tabs: ExpTab[]; activeId: string } {
  const list = safeTabs(tabs);
  if (list.length === 1) return { tabs: list, activeId: list[0].id };
  const at = list.findIndex((t) => t.id === id);
  if (at < 0) return { tabs: list, activeId };
  const rest = list.filter((t) => t.id !== id);
  if (id !== activeId) return { tabs: rest, activeId };
  const next = rest[Math.min(at, rest.length - 1)];
  return { tabs: rest, activeId: next.id };
}

/** Открыть папку новой вкладкой; та же папка уже открыта — переходим на неё */
export function openInTab(
  tabs: ExpTab[], folderId: string | null, name: string,
): { tabs: ExpTab[]; activeId: string } {
  const list = safeTabs(tabs);
  const same = list.find((t) => t.folderId === folderId);
  if (same) return { tabs: list, activeId: same.id };
  const tab = makeTab(folderId, name);
  return { tabs: [...list, tab], activeId: tab.id };
}

/** Показанная вкладка переехала в другую папку — запоминаем это в ней */
export function moveActive(tabs: ExpTab[], activeId: string, folderId: string | null, name: string): ExpTab[] {
  return safeTabs(tabs).map((t) => (t.id === activeId ? { ...t, folderId, name: name || ROOT_NAME } : t));
}

/** Переставить вкладку мышью: с какого места на какое */
export function reorder(tabs: ExpTab[], from: number, to: number): ExpTab[] {
  const list = safeTabs(tabs);
  if (from === to || from < 0 || from >= list.length) return list;
  const out = [...list];
  const [moved] = out.splice(from, 1);
  out.splice(Math.max(0, Math.min(out.length, to)), 0, moved);
  return out;
}

// ── Сохранение между запусками ──────────────────────────────────────────────

const KEY = 'flux_explorer_tabs';

/** Вкладки переживают перезапуск: человек оставил три папки открытыми не зря */
export function saveTabs(tabs: ExpTab[], activeId: string): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ tabs: safeTabs(tabs).slice(0, 12), activeId }));
  } catch (_) { /* приватный режим */ }
}

export function loadTabs(): { tabs: ExpTab[]; activeId: string } {
  try {
    const raw = localStorage.getItem(KEY);
    const v = raw ? JSON.parse(raw) : null;
    const tabs = safeTabs(Array.isArray(v?.tabs) ? v.tabs : []);
    // Идентификаторы восстановленных вкладок не должны сталкиваться с новыми
    for (const t of tabs) {
      const n = Number(String(t.id).replace(/\D/g, ''));
      if (Number.isFinite(n) && n >= seq) seq = n + 1;
    }
    const activeId = tabs.some((t) => t.id === v?.activeId) ? String(v.activeId) : tabs[0].id;
    return { tabs, activeId };
  } catch (_) {
    return { tabs: [makeTab()], activeId: '' };
  }
}
