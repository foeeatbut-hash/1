/**
 * Конфигурация подключения клиента к серверу.
 *
 * Одна настройка — адрес сервера (localStorage `flux_server_url`):
 *  - пусто  → «встроенный» режим: в Electron это локальный Express на
 *    localhost:3000, в браузере — тот же origin, откуда открыта страница
 *    (сервер раздаёт фронтенд статикой). Так работает сегодняшний офлайн-тест.
 *  - задан  → «сервер компании»: ВСЕ запросы (fetch и socket.io) идут на него,
 *    встроенный сервер в Electron не запускается (см. electron/main.ts).
 *
 * Дублируется в config.json (remote_server_url) через IPC — чтобы главный
 * процесс Electron знал о выборе ещё до загрузки рендерера.
 */

const SERVER_URL_KEY = 'flux_server_url';

// Нормализованный адрес сервера компании ('' = встроенный режим)
export function getConfiguredServerUrl(): string {
  try {
    const saved = (localStorage.getItem(SERVER_URL_KEY) || '').trim();
    if (!saved) return '';
    const withProto = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(saved) ? saved : `http://${saved}`;
    return withProto.replace(/\/+$/, '');
  } catch (_) {
    return '';
  }
}

// База для HTTP-запросов: '' означает «относительные пути от текущего origin»
export function getServerBaseUrl(): string {
  const configured = getConfiguredServerUrl();
  if (configured) return configured;
  if (typeof window !== 'undefined' && window.location.protocol === 'file:') {
    return 'http://localhost:3000'; // Electron: встроенный сервер
  }
  return '';
}

// Сохраняет выбор сервера (пустая строка = встроенный) и синхронизирует
// config.json главного процесса Electron. Применяется после перезагрузки окна.
export async function setConfiguredServerUrl(url: string): Promise<void> {
  const clean = String(url || '').trim();
  try {
    if (clean) localStorage.setItem(SERVER_URL_KEY, clean);
    else localStorage.removeItem(SERVER_URL_KEY);
  } catch (_) {}
  try {
    const win = window as any;
    if (win.electron?.ipcRenderer?.invoke) {
      await win.electron.ipcRenderer.invoke('app:set-server-url', clean);
    }
  } catch (_) {}
}

// Адрес зафиксирован на момент загрузки: смена сервера = перезагрузка окна,
// чтобы не жить в состоянии «половина запросов туда, половина сюда»
export const SERVER_BASE_URL = getServerBaseUrl();

export const ENV_CONFIG = {
  // '' + '/api' = относительный '/api' — работает в браузере, открытом с сервера
  apiUrl: `${SERVER_BASE_URL}/api`,
  // socket.io сам поднимает websocket поверх http(s)-адреса
  socketUrl: SERVER_BASE_URL ||
    (typeof window !== 'undefined' && window.location.protocol !== 'file:'
      ? window.location.origin
      : 'http://localhost:3000'),
};

// Глобальная обёртка fetch: (1) переписывает корневые пути (/api/…, /chat_files/…)
// на адрес сервера, когда страница открыта не с него (Electron file:// или задан
// сервер компании); (2) подробно логирует запросы/ответы в журнал — чтобы в
// crash-логе было видно «что нажали → какой запрос → что ответил сервер».
if (typeof window !== 'undefined') {
  const needsRewrite = window.location.protocol === 'file:' || !!getConfiguredServerUrl();
  const baseUrl = SERVER_BASE_URL || 'http://localhost:3000';
  const originalFetch = window.fetch.bind(window);

  const logApi = (level: 'INFO' | 'ERROR', ctx: string, msg: string) => {
    try {
      // ленивый импорт, чтобы не создавать циклов на этапе модуля
      const store = (window as any).__pdmLogStore;
      if (store) store.getState().addLog(level, ctx, msg);
    } catch (_) {}
  };

  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    let urlForLog = '';
    try {
      if (typeof input === 'string') {
        urlForLog = input;
        if (needsRewrite && input.startsWith('/')) input = baseUrl + input;
      } else if (input instanceof URL) {
        urlForLog = input.pathname + input.search;
        if (needsRewrite && input.protocol === 'file:') input = baseUrl + input.pathname + input.search;
      } else if (typeof Request !== 'undefined' && input instanceof Request) {
        urlForLog = input.url;
        if (needsRewrite && input.url.startsWith('file://')) {
          const u = new URL(input.url);
          input = new Request(baseUrl + u.pathname + u.search, input);
        }
      }
    } catch (e) {}

    const method = (init?.method || (input instanceof Request ? input.method : 'GET') || 'GET').toUpperCase();
    const isApi = /\/api\//.test(urlForLog);
    const shortUrl = urlForLog.replace(/^https?:\/\/[^/]+/, '').replace(/^.*\/api\//, '/api/');
    // Фоновые поллинги (уведомления, чат) идут каждые несколько секунд —
    // их успешные запросы не пишем, чтобы не забивать журнал шумом (ошибки пишем)
    const isBackgroundPoll = method === 'GET' && /\/api\/(notifications|chat\/(messages|group-messages|groups))/.test(shortUrl);
    if (isApi && !isBackgroundPoll) logApi('INFO', 'Запрос', `${method} ${shortUrl}`);

    try {
      const res = await originalFetch(input as any, init);
      if (isApi && (!isBackgroundPoll || !res.ok)) logApi(res.ok ? 'INFO' : 'ERROR', 'Ответ', `${res.status} ${method} ${shortUrl}`);
      return res;
    } catch (err: any) {
      if (isApi) logApi('ERROR', 'Сбой запроса', `${method} ${shortUrl}: ${err?.message || err}`);
      throw err;
    }
  }) as typeof window.fetch;
}
