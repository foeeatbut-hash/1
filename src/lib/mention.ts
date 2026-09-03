/**
 * Вызов помощника в переписке через «@».
 *
 * Правило простое на словах и коварное в разборе: сообщение, начинающееся с
 * «@», адресовано помощнику. Дальше начинаются вопросы, на которые надо
 * ответить одинаково всегда, а не «как получилось»: где кончается имя, что
 * делать с «@» посреди строки (почта, ник, цена), что если после «@» пусто.
 *
 * И главное — приватность. Помощник в общей переписке видит НЕ ВСЮ её. Он
 * получает обращённое к нему сообщение и несколько последних для связности;
 * остальное остаётся между людьми. Правило записано здесь и проверяется
 * скриптом: приватность, о которой нельзя доказать, что она соблюдается, —
 * это не приватность.
 */

/** Имена, на которые помощник откликается */
export const ASSISTANT_NAMES = ['помощник', 'flux', 'флакс', 'ии', 'ai'];

/** Сколько предыдущих сообщений уходит помощнику для связности */
export const CONTEXT_MESSAGES = 6;

export interface Mention {
  /** К помощнику ли обращение */
  toAssistant: boolean;
  /** Имя, которое написали после «@» */
  name: string;
  /** Сам вопрос — без «@имя» */
  text: string;
}

/**
 * Разбор сообщения.
 *
 * Обращение считается только в НАЧАЛЕ строки: «@помощник, посчитай» — вопрос,
 * а «пиши на ivan@example.com» — не вопрос, и путать их нельзя.
 */
export function parseMention(raw: string): Mention {
  const s = String(raw ?? '');
  const trimmed = s.trimStart();
  if (!trimmed.startsWith('@')) return { toAssistant: false, name: '', text: s.trim() };

  // Имя кончается на пробеле или знаке препинания: «@помощник,» — тоже имя
  const m = /^@([^\s,.:;!?]*)([\s\S]*)$/.exec(trimmed);
  if (!m) return { toAssistant: false, name: '', text: s.trim() };
  const name = m[1] || '';
  const rest = (m[2] || '').replace(/^[\s,.:;!?]+/, '').trim();
  const known = ASSISTANT_NAMES.includes(name.toLowerCase());
  return { toAssistant: !!name && known, name, text: rest };
}

/** Обращение без вопроса: «@помощник» и всё — отвечать не на что */
export const isEmptyAsk = (m: Mention): boolean => m.toAssistant && m.text.length === 0;

export interface ChatLine {
  id: string;
  author: string;
  text: string;
}

/**
 * Что помощник увидит из переписки.
 *
 * Не вся история: обращённое к нему сообщение и несколько предыдущих. Люди
 * пишут в группе о зарплатах, отпусках и заказчиках, и отдавать это целиком
 * из-за одного вопроса нельзя — даже своему помощнику, который наружу не ходит.
 */
export function contextFor(all: ChatLine[], askId: string, depth = CONTEXT_MESSAGES): ChatLine[] {
  const at = all.findIndex((m) => m.id === askId);
  if (at < 0) return [];
  const from = Math.max(0, at - depth);
  return all.slice(from, at + 1);
}

/** Подпись ответа: видно, на чей вопрос отвечено */
export const answerPrefix = (who: string): string => `Ответ для ${who}:`;
