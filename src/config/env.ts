/**
 * Global Environment Configuration
 * Dual-mode Support: Strict local mock mode for development/sandbox,
 * and transparent physical network mode for packaged production.
 */

// Detect standard electron environment variables or sandbox environments
export const isLocalMode = (() => {
  if (typeof window !== 'undefined') {
    // If running in browser/preview and not on the specific production office IP, default to local relative API
    if (window.location.hostname !== '192.168.1.100') {
      return true;
    }
  }
  if (typeof process !== 'undefined') {
    if (process.env.NODE_ENV === 'development' || !process.env.IS_PRODUCTION || !process.env.NODE_ENV) {
      return true;
    }
  }
  return false;
})();

export const ENV = {
  isProduction: false, // Флаг для будущего переключения на боевой сервер компании
  serverUrl: 'http://192.168.1.100:5000', // Будущий IP-адрес офисного сервера
};

export const ENV_CONFIG = {
  isLocalMode,
  apiUrl: isLocalMode ? 'http://localhost:3000/api' : 'http://192.168.1.100:5000/api',
  socketUrl: isLocalMode ? 'ws://localhost:3000' : 'ws://192.168.1.100:5000',
  updatesUrl: 'http://192.168.1.100/updates/'
};

// Глобальная обёртка fetch: (1) в собранном Electron (file://) переписывает
// относительные /api/... на встроенный сервер; (2) ВСЕГДА подробно логирует
// каждый запрос и ответ в журнал — чтобы в crash-логе было видно «что нажали →
// какой запрос → что ответил сервер».
if (typeof window !== 'undefined') {
  const isFile = window.location.protocol === 'file:';
  const baseUrl = 'http://localhost:3000';
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
        if (isFile && input.startsWith('/')) input = baseUrl + input;
      } else if (input instanceof URL) {
        urlForLog = input.pathname + input.search;
        if (isFile && input.protocol === 'file:') input = baseUrl + input.pathname + input.search;
      } else if (typeof Request !== 'undefined' && input instanceof Request) {
        urlForLog = input.url;
        if (isFile && input.url.startsWith('file://')) {
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
