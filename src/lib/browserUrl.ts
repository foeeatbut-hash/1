/**
 * Адресная строка браузера: что человек ввёл — адрес или запрос.
 *
 * Единственное место в браузере, где ошибка не видна глазом и стоит дорого.
 * Принять «опросный лист АВО-2» за адрес — значит показать пустую страницу
 * вместо поиска. Принять `192.168.1.100:3000` за запрос — значит отправить
 * внутренний адрес предприятия в чужую поисковую строку, то есть наружу.
 * Второе хуже: это уже утечка, а не неудобство.
 *
 * Поэтому правило живёт отдельно от разметки и проверяется скриптом
 * (scripts/test-browser.ts).
 */

/** Схемы, которые открываем как есть. Всё прочее (file:, javascript:) — нет */
const SCHEMES = /^(https?|ftp):\/\//i;
/** Опасные схемы: их не открываем никогда, даже если человек ввёл руками */
const BLOCKED = /^(javascript|data|file|blob|about):/i;

/** Похоже на адрес, а не на фразу */
const LOOKS_LIKE_HOST = /^[a-z0-9.-]+(:\d{1,5})?(\/.*)?$/i;
/** Внутренние адреса: localhost, 127.х, 10.х, 172.16–31.х, 192.168.х */
export const PRIVATE_HOST =
  /^(localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/i;

export interface SearchEngine { id: string; label: string; url: string }

/**
 * Поисковики на выбор. Свой шаблон — для предприятий с внутренним поиском:
 * программа не должна заставлять ходить наружу, если внутри есть своё.
 */
export const ENGINES: SearchEngine[] = [
  { id: 'yandex', label: 'Яндекс', url: 'https://yandex.ru/search/?text=%s' },
  { id: 'google', label: 'Google', url: 'https://www.google.com/search?q=%s' },
  { id: 'ddg', label: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=%s' },
];

export const DEFAULT_ENGINE = 'yandex';

export const engineById = (id: string): SearchEngine =>
  ENGINES.find((e) => e.id === id) || ENGINES[0];

export interface Resolved {
  /** Куда идти */
  url: string;
  /** Как решили: по адресу или через поиск */
  how: 'url' | 'search' | 'blocked';
  /** Что искали — для истории и подписи вкладки */
  query?: string;
}

/**
 * Разобрать введённое.
 *
 * Порядок проверок — от самого однозначного к самому спорному: явная схема,
 * запрещённая схема, внутренний адрес, похожее на хост, всё остальное — поиск.
 */
export function resolveInput(raw: string, engineId = DEFAULT_ENGINE, searchTemplate?: string): Resolved {
  const text = String(raw || '').trim();
  if (!text) return { url: '', how: 'search', query: '' };

  if (BLOCKED.test(text)) return { url: '', how: 'blocked' };
  if (SCHEMES.test(text)) return { url: text, how: 'url' };

  // Внутренний адрес без схемы — самый частый случай в закрытом контуре:
  // «192.168.1.100:3000», «localhost:5000». Отправить его в поиск нельзя
  const host = text.split('/')[0].split(':')[0];
  if (PRIVATE_HOST.test(host)) return { url: `http://${text}`, how: 'url' };

  // Пробел означает фразу: адресов с пробелами не бывает
  if (!/\s/.test(text) && LOOKS_LIKE_HOST.test(text) && text.includes('.')) {
    return { url: `https://${text}`, how: 'url' };
  }

  const tpl = searchTemplate && searchTemplate.includes('%s')
    ? searchTemplate
    : engineById(engineId).url;
  return { url: tpl.replace('%s', encodeURIComponent(text)), how: 'search', query: text };
}

/** Хост адреса; пусто, если адрес не разбирается */
export function hostOf(url: string): string {
  try { return new URL(url).hostname; } catch (_) { return ''; }
}

/**
 * Что показывать в адресной строке. Схему `https://` прячем, как это делают
 * браузеры: она есть всегда и place в строке занимает; `http://` оставляем —
 * это уже разница, о которой человеку стоит знать.
 */
export function prettyUrl(url: string): string {
  if (!url) return '';
  return url.replace(/^https:\/\//i, '').replace(/\/$/, '');
}

/**
 * Разрешён ли адрес списком.
 *
 * Пустой список означает «любые»: у большинства так и будет. Заполненный —
 * единственный приемлемый режим для заказчика с закрытым контуром, и работает
 * он по хосту и его поддоменам, а не по подстроке: `gost.ru` в списке не
 * должен открывать `gost.ru.example.com`.
 */
export function allowedByList(url: string, list: string[]): boolean {
  const hosts = (list || []).map((h) => String(h || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '')).filter(Boolean);
  if (!hosts.length) return true;
  const host = hostOf(url).toLowerCase();
  if (!host) return false;
  return hosts.some((h) => host === h || host.endsWith(`.${h}`));
}

/** Подпись вкладки: заголовок страницы, иначе хост, иначе «Новая вкладка» */
export function tabLabel(title: string, url: string): string {
  const t = String(title || '').trim();
  if (t) return t;
  const h = hostOf(url);
  return h || 'Новая вкладка';
}
