/**
 * Подключение к базе данных: сборка и разбор строки подключения.
 *
 * Раньше строку подключения человек писал руками целиком:
 *
 *     mysql://Flux:pa$$w0rd@192.168.120.14:3306/Flux
 *
 * Так делать нельзя по трём причинам, и все три уже случились. Её путают с
 * адресом сервера программы и вписывают не в то поле — после чего программа
 * перестаёт работать целиком. Пароль со спецзнаками (`$`, `!`, `@`) ломает
 * разбор, и человек видит «не удалось подключиться» без объяснения. И наконец,
 * такую строку невозможно показать на экране: она вся — секрет.
 *
 * Поэтому человек отвечает на пять понятных вопросов — движок, сервер, порт,
 * база, имя и пароль, — а строку собирает программа, экранируя всё, что нужно.
 *
 * Без React и без сети: правила проверяются скриптом (scripts/test-db-url.ts).
 */

export type DbEngine = 'LOCAL' | 'POSTGRES' | 'MARIADB';

export interface DbParts {
  engine: DbEngine;
  host: string;
  port: string;
  database: string;
  user: string;
  password: string;
}

export const DEFAULT_PORT: Record<DbEngine, string> = {
  LOCAL: '',
  POSTGRES: '5432',
  MARIADB: '3306',
};

export const ENGINE_LABEL: Record<DbEngine, string> = {
  LOCAL: 'На этом компьютере',
  POSTGRES: 'PostgreSQL',
  MARIADB: 'MariaDB / MySQL',
};

export const emptyParts = (engine: DbEngine = 'POSTGRES'): DbParts => ({
  engine,
  host: '',
  port: DEFAULT_PORT[engine],
  database: '',
  user: '',
  password: '',
});

/**
 * Собрать строку подключения.
 *
 * Имя и пароль экранируются обязательно: пароль отдела в этом проекте
 * содержит `$`, `!`, `@`, `+` и `=`, и без экранирования такая строка
 * разбирается не туда — «сервером» становится кусок пароля.
 */
export function buildDbUrl(p: DbParts): string {
  if (p.engine === 'LOCAL') return '';
  const scheme = p.engine === 'MARIADB' ? 'mysql' : 'postgresql';
  const host = String(p.host || '').trim();
  const port = String(p.port || DEFAULT_PORT[p.engine]).trim();
  const db = String(p.database || '').trim();
  const cred = p.user
    ? `${encodeURIComponent(p.user)}${p.password ? `:${encodeURIComponent(p.password)}` : ''}@`
    : '';
  return `${scheme}://${cred}${host}${port ? `:${port}` : ''}/${encodeURIComponent(db)}`;
}

/** Разобрать строку обратно на поля — чтобы показать человеку, что настроено */
export function parseDbUrl(url: string): DbParts {
  const raw = String(url || '').trim();
  if (!raw) return emptyParts('LOCAL');
  const engine: DbEngine = /^(mysql|mariadb):/i.test(raw) ? 'MARIADB' : 'POSTGRES';
  try {
    const u = new URL(raw);
    return {
      engine,
      host: u.hostname,
      port: u.port || DEFAULT_PORT[engine],
      database: decodeURIComponent(u.pathname.replace(/^\//, '')),
      user: decodeURIComponent(u.username || ''),
      password: decodeURIComponent(u.password || ''),
    };
  } catch (_) {
    return { ...emptyParts(engine) };
  }
}

/** Чего не хватает, чтобы подключаться. Пустая строка — всё на месте */
export function missing(p: DbParts): string {
  if (p.engine === 'LOCAL') return '';
  if (!String(p.host || '').trim()) return 'Укажите сервер базы — имя или адрес.';
  if (!String(p.database || '').trim()) return 'Укажите название базы данных.';
  if (!String(p.user || '').trim()) return 'Укажите имя пользователя базы.';
  const port = String(p.port || '').trim();
  if (port && !/^\d{1,5}$/.test(port)) return 'Порт — это число, например 5432 или 3306.';
  return '';
}

/**
 * Как подключение выглядит строкой внизу экрана входа.
 *
 * Пароля здесь нет и быть не может: строка стоит на виду, её видит любой, кто
 * подошёл к столу, и она попадает в каждый снимок экрана.
 */
export function dbLabel(p: DbParts): string {
  if (p.engine === 'LOCAL') return 'База: на этом компьютере';
  const where = [p.host, p.port].filter(Boolean).join(':');
  const name = p.database ? ` · ${p.database}` : '';
  return `База: ${p.engine === 'MARIADB' ? 'MariaDB' : 'PostgreSQL'} · ${where}${name}`;
}

/** То же для уже настроенной строки подключения */
export const labelOfUrl = (dbType: string, url: string): string =>
  dbLabel(String(dbType).toUpperCase() === 'REMOTE' ? parseDbUrl(url) : emptyParts('LOCAL'));
