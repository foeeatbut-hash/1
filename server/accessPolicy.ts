/** Настройка до входа нужна встроенному серверу, выгрузка всех данных — нет. */
const LOCAL_SETUP = new Set(['/api/db/config', '/api/db/test', '/api/db/switch', '/api/db/save']);

export const isLoopbackAddress = (ip: string): boolean =>
  ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(ip);

export function allowsLocalSetup(route: string, ip: string, origin?: string, host?: string): boolean {
  if (!LOCAL_SETUP.has(route) || !isLoopbackAddress(ip)) return false;
  // Чужая страница в браузере не должна перенастраивать локальную программу.
  if (!origin) return true;
  try { return new URL(origin).host === host; } catch (_) { return false; }
}

export function requiresAdministrator(route: string): boolean {
  return /^\/api\/(db(?:\/|$)|backup(?:\/|$)|seed\/?$|config\/logs\/?$)/i.test(route);
}
