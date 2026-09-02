/**
 * Браузер внутри программы: вкладки и страницы.
 *
 * Chromium внутри Flux уже есть — Electron это он и есть. Поэтому «свой
 * браузер» — не установка чужой программы, а ещё один слой того же движка,
 * которым нарисована сама Flux.
 *
 * Каждая вкладка — отдельный WebContentsView со своим процессом. Не `webview`
 * и не `iframe`: первый устарел и рушит окно вместе с собой, второй половина
 * сайтов просто не пускает (X-Frame-Options), и «браузер» показывал бы пустоту
 * ровно там, где он нужнее всего.
 *
 * Страница не имеет доступа ни к программе, ни к её данным: свой процесс, свой
 * preload не подключается вовсе, изоляция включена. Всё общение идёт через
 * явные действия человека в окне браузера, которое рисует React.
 *
 * Расположение страницы задаёт окно программы: React знает, где у него полоса
 * вкладок и адресная строка, а главный процесс — нет. Поэтому границы
 * приезжают сюда числами.
 */
import { BrowserWindow, WebContentsView, ipcMain, shell, session } from 'electron';

interface Tab {
  id: string;
  view: WebContentsView;
  /** Окно программы, которому принадлежит вкладка */
  ownerId: number;
}

const tabs = new Map<string, Tab>();
/** Какая вкладка показана в каком окне: остальные сняты со сцены */
const shown = new Map<number, string>();
/** Границы страницы в окне: одни на окно, приезжают из React */
const bounds = new Map<number, { x: number; y: number; width: number; height: number }>();

let nextId = 1;
const newId = () => `tab-${nextId++}`;

const ownerOf = (event: Electron.IpcMainInvokeEvent): BrowserWindow | null =>
  BrowserWindow.fromWebContents(event.sender);

/**
 * Состояние вкладки — то, что рисует адресная строка. Отдаём целиком на любое
 * событие: разбирать по частям («сменился только заголовок») здесь дороже, чем
 * послать четыре поля.
 */
function stateOf(tab: Tab) {
  const wc = tab.view.webContents;
  return {
    id: tab.id,
    url: wc.getURL(),
    title: wc.getTitle(),
    loading: wc.isLoading(),
    canGoBack: wc.navigationHistory.canGoBack(),
    canGoForward: wc.navigationHistory.canGoForward(),
  };
}

const send = (ownerId: number, channel: string, payload: any) => {
  const win = BrowserWindow.fromId(ownerId);
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
};

/** Показать страницу вкладки в окне и убрать со сцены прежнюю */
function place(ownerId: number, tabId: string) {
  const win = BrowserWindow.fromId(ownerId);
  if (!win || win.isDestroyed()) return;
  const prev = shown.get(ownerId);
  if (prev && prev !== tabId) {
    const old = tabs.get(prev);
    if (old) { try { win.contentView.removeChildView(old.view); } catch (_) { /* уже снята */ } }
  }
  const tab = tabs.get(tabId);
  if (!tab) { shown.delete(ownerId); return; }
  try { win.contentView.addChildView(tab.view); } catch (_) { /* уже на сцене */ }
  const b = bounds.get(ownerId);
  if (b) tab.view.setBounds(b);
  shown.set(ownerId, tabId);
}

function createTab(win: BrowserWindow, url: string): string {
  const id = newId();
  const view = new WebContentsView({
    webPreferences: {
      // Страница — чужая. Ни узла, ни моста, ни общей сессии с программой:
      // браузер для работы внутри контура, а не дырка в данные проекта
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      session: session.fromPartition('persist:flux-browser'),
    },
  });
  const tab: Tab = { id, view, ownerId: win.id };
  tabs.set(id, tab);

  const wc = view.webContents;
  const push = () => send(win.id, 'browser:state', stateOf(tab));

  wc.on('page-title-updated', push);
  wc.on('did-navigate', push);
  wc.on('did-navigate-in-page', push);
  wc.on('did-start-loading', push);
  wc.on('did-stop-loading', push);
  wc.on('did-fail-load', (_e, code, desc, failedUrl) => {
    // Обрыв показываем словами, а не пустой белой страницей: человек должен
    // видеть, что именно не открылось и почему
    if (code === -3) return; // отменённая навигация — не ошибка
    send(win.id, 'browser:failed', { id, code, desc, url: failedUrl });
    push();
  });

  // Ссылка «в новом окне» открывается новой вкладкой, а не окном ОС: окно
  // браузера одно, и выпадающие поверх него окна ломают это обещание
  wc.setWindowOpenHandler(({ url: target }) => {
    const child = createTab(win, target);
    send(win.id, 'browser:opened', { id: child, url: target });
    return { action: 'deny' };
  });

  // Скачивание отдаём системе: сохранять молча в неизвестное место хуже, чем
  // спросить. Куда именно — решает человек в диалоге системы
  wc.session.on('will-download', (_e, item) => {
    send(win.id, 'browser:download', { name: item.getFilename(), size: item.getTotalBytes() });
  });

  if (url) void wc.loadURL(url).catch(() => { /* об ошибке скажет did-fail-load */ });
  return id;
}

export function setupBrowser() {
  ipcMain.handle('browser:new-tab', (event, url: string) => {
    const win = ownerOf(event);
    if (!win) return '';
    const id = createTab(win, String(url || ''));
    place(win.id, id);
    return id;
  });

  ipcMain.handle('browser:show', (event, tabId: string) => {
    const win = ownerOf(event);
    if (!win) return false;
    place(win.id, String(tabId || ''));
    return true;
  });

  /** Снять страницу со сцены: окно браузера закрыли или ушли в другой раздел */
  ipcMain.handle('browser:hide', (event) => {
    const win = ownerOf(event);
    if (!win) return false;
    const cur = shown.get(win.id);
    if (cur) {
      const tab = tabs.get(cur);
      if (tab) { try { win.contentView.removeChildView(tab.view); } catch (_) { /* уже снята */ } }
      shown.delete(win.id);
    }
    return true;
  });

  ipcMain.handle('browser:close-tab', (event, tabId: string) => {
    const win = ownerOf(event);
    const tab = tabs.get(String(tabId || ''));
    if (!tab) return false;
    if (win && shown.get(win.id) === tab.id) {
      try { win.contentView.removeChildView(tab.view); } catch (_) { /* уже снята */ }
      shown.delete(win.id);
    }
    try { (tab.view.webContents as any).close?.(); } catch (_) { /* уже закрыта */ }
    tabs.delete(tab.id);
    return true;
  });

  ipcMain.handle('browser:bounds', (event, b: { x: number; y: number; width: number; height: number }) => {
    const win = ownerOf(event);
    if (!win) return false;
    const box = {
      x: Math.max(0, Math.round(b?.x || 0)),
      y: Math.max(0, Math.round(b?.y || 0)),
      width: Math.max(0, Math.round(b?.width || 0)),
      height: Math.max(0, Math.round(b?.height || 0)),
    };
    bounds.set(win.id, box);
    const cur = shown.get(win.id);
    const tab = cur ? tabs.get(cur) : null;
    if (tab) tab.view.setBounds(box);
    return true;
  });

  ipcMain.handle('browser:go', (_event, payload: { id: string; url: string }) => {
    const tab = tabs.get(String(payload?.id || ''));
    if (!tab) return false;
    void tab.view.webContents.loadURL(String(payload?.url || '')).catch(() => { /* did-fail-load скажет */ });
    return true;
  });

  ipcMain.handle('browser:action', (_event, payload: { id: string; action: string }) => {
    const tab = tabs.get(String(payload?.id || ''));
    if (!tab) return false;
    const wc = tab.view.webContents;
    const act = String(payload?.action || '');
    if (act === 'back' && wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack();
    else if (act === 'forward' && wc.navigationHistory.canGoForward()) wc.navigationHistory.goForward();
    else if (act === 'reload') wc.reload();
    else if (act === 'stop') wc.stop();
    else if (act === 'zoom-in') wc.setZoomLevel(Math.min(5, wc.getZoomLevel() + 0.5));
    else if (act === 'zoom-out') wc.setZoomLevel(Math.max(-5, wc.getZoomLevel() - 0.5));
    else if (act === 'zoom-reset') wc.setZoomLevel(0);
    else if (act === 'find') wc.findInPage('');
    else if (act === 'external') void shell.openExternal(wc.getURL()).catch(() => {});
    return true;
  });

  ipcMain.handle('browser:state', (_event, tabId: string) => {
    const tab = tabs.get(String(tabId || ''));
    return tab ? stateOf(tab) : null;
  });

  /** Выделенный на странице текст — для перевода и вопроса помощнику */
  ipcMain.handle('browser:selection', async (_event, tabId: string) => {
    const tab = tabs.get(String(tabId || ''));
    if (!tab) return '';
    try {
      const text = await tab.view.webContents.executeJavaScript('String(window.getSelection())', true);
      return String(text || '').slice(0, 4000);
    } catch (_) { return ''; }
  });
}

/** Окно программы закрылось — уносим его вкладки, иначе они останутся жить */
export function disposeBrowserFor(winId: number) {
  for (const [id, tab] of tabs) {
    if (tab.ownerId !== winId) continue;
    try { (tab.view.webContents as any).close?.(); } catch (_) { /* уже закрыта */ }
    tabs.delete(id);
  }
  shown.delete(winId);
  bounds.delete(winId);
}
