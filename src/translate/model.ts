/**
 * Слот под локальный движок перевода.
 *
 * Владелец может поднять у себя — на этой же машине или в своей сети — сервер
 * перевода и указать его адрес. Программа будет спрашивать его там, где своего
 * словаря не хватило. Слот пуст по умолчанию, и в пустом состоянии программа
 * полноценна: движок улучшает свободный текст, но не отвечает ни за термины,
 * ни за память — они и без него точнее.
 *
 * Единственное жёсткое условие — адрес должен быть свой. Программа офлайн, и
 * «почти офлайн» здесь не бывает: `http://127.0.0.1:5000` принимается,
 * `https://translate.example.com` — нет, сколько бы удобно это ни было. Проверка
 * стоит в коде, а не в обещании, и на неё есть отдельная проверка в наборе.
 */

export interface ModelEndpoint {
  /** Адрес сервера, например http://127.0.0.1:5000 */
  url: string;
  /** Ключ, если сервер его спрашивает; хранится у владельца, не в репозитории */
  key?: string;
}

const PRIVATE_HOSTS = [/^localhost$/i, /^127\./, /^0\.0\.0\.0$/, /^\[?::1\]?$/i];

/**
 * Частный адрес: та же машина или своя сеть. Диапазоны — те, что RFC 1918
 * объявляет непубличными, плюс канальный 169.254.x и общий 100.64+ для сетей
 * предприятий.
 */
function isPrivateHost(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, '').toLowerCase();
  if (PRIVATE_HOSTS.some((re) => re.test(h))) return true;
  if (/\.local$/.test(h)) return true;
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const a = Number(m[1]); const b = Number(m[2]);
  if (a === 10) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 169 && b === 254) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

export interface EndpointCheck {
  ok: boolean;
  /** Почему нельзя — показывается в настройках как есть */
  reason: string;
}

/** Годится ли адрес. Пустой адрес — не ошибка, это «движок не подключён». */
export function checkEndpoint(url: string): EndpointCheck {
  const raw = String(url || '').trim();
  if (!raw) return { ok: false, reason: 'Адрес не указан' };
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { ok: false, reason: 'Не похоже на адрес: нужен вид http://127.0.0.1:5000' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, reason: 'Годятся только http и https' };
  }
  if (!isPrivateHost(parsed.hostname)) {
    return {
      ok: false,
      reason: 'Адрес не свой. Программа работает без сети и отправляет текст только на эту машину или в вашу сеть',
    };
  }
  return { ok: true, reason: '' };
}

/** Собрать адрес запроса, не потеряв путь, если владелец его указал */
export function endpointUrl(url: string): string {
  const base = String(url || '').trim().replace(/\/+$/, '');
  return /\/translate$/.test(base) ? base : `${base}/translate`;
}

/**
 * Спросить движок. Ответ принимается в двух видах: наш простой
 * `{ translations: ["…"] }` и распространённый `{ translatedText: "…" }` —
 * чтобы поднятый владельцем сервер не пришлось переписывать под нас.
 *
 * Ошибка не бросается наружу: движок — необязательная добавка, и когда он
 * недоступен, перевод должен просто идти дальше по словарю.
 */
export async function askModel(
  endpoint: ModelEndpoint,
  texts: string[],
  from: string,
  to: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string[] | null> {
  const check = checkEndpoint(endpoint.url);
  if (!check.ok || !texts.length) return null;
  try {
    const res = await fetchImpl(endpointUrl(endpoint.url), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(endpoint.key ? { Authorization: `Bearer ${endpoint.key}` } : {}),
      },
      body: JSON.stringify({ q: texts, source: from, target: to, format: 'text' }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (Array.isArray(data?.translations)) return data.translations.map((x: any) => String(x ?? ''));
    if (Array.isArray(data?.translatedText)) return data.translatedText.map((x: any) => String(x ?? ''));
    if (typeof data?.translatedText === 'string' && texts.length === 1) return [data.translatedText];
    return null;
  } catch {
    return null;
  }
}
