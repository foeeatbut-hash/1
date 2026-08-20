/**
 * Сборка писем в цепочки.
 *
 * IMAP номера цепочки не выдаёт — в отличие от Gmail, где он приходит готовым.
 * Значит считаем сами, и по тем же правилам, что и почтовые клиенты:
 *
 *  1. Если у письма есть References — корень цепочки это первый из них. Это
 *     самый надёжный признак: заголовок собирается машинами, а не людьми.
 *  2. Если References нет, но есть In-Reply-To — берём его.
 *  3. Если нет ни того ни другого — сводим по нормализованной теме. Так
 *     склеиваются переписки, которые прошли через список рассылки или через
 *     почтовик, теряющий заголовки.
 *
 * Правило про тему намеренно ограничено окном в неделю: без него письма
 * «Заявка» за три года собрались бы в одну цепочку на тысячу штук.
 *
 * Чистый модуль — без React и без запросов. Покрыт scripts/test-mail.ts.
 */

/** Окно, в пределах которого письма с одинаковой темой считаем одной перепиской. */
export const SUBJECT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Приставки ответа и пересылки, которые снимаем с темы. Латиница и кириллица:
 * в одной переписке спокойно встречаются «Re:», «Ответ:» и «RE[2]:» разом.
 */
const PREFIX_RE = /^\s*(?:(?:re|res|fw|fwd|aw|sv|vs|отв|ответ|пересылка|перенаправлено)\s*(?:\[\d+\])?\s*:\s*)+/i;

/** Тема без приставок ответа и лишних пробелов, в нижнем регистре. */
export function normalizeSubject(raw: string): string {
  let s = String(raw || '');
  // Приставок бывает несколько подряд, и снимать их надо по очереди
  for (let i = 0; i < 10; i++) {
    const next = s.replace(PREFIX_RE, '');
    if (next === s) break;
    s = next;
  }
  return s.replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Разобрать заголовок References в список Message-ID. */
export function parseRefs(raw: string): string[] {
  return String(raw || '')
    .split(/\s+/)
    .map((s) => s.trim())
    .filter((s) => s.startsWith('<') && s.endsWith('>') && s.length > 2);
}

export interface ThreadInput {
  messageId: string;
  inReplyTo: string;
  refs: string;
  subject: string;
  sentAt: Date | string | number;
}

/**
 * Ключ цепочки для одного письма.
 *
 * `known` — уже посчитанные ключи по Message-ID: если предок известен, ответ
 * получает его ключ, и цепочка не рассыпается на части при догрузке письма,
 * пришедшего позже остальных.
 */
export function threadKeyOf(msg: ThreadInput, known?: Map<string, string>): string {
  const refs = parseRefs(msg.refs);
  const parent = msg.inReplyTo?.trim() || '';

  // По ссылкам вверх: сначала ближайший известный предок, потом корень
  if (known) {
    for (let i = refs.length - 1; i >= 0; i--) {
      const hit = known.get(refs[i]);
      if (hit) return hit;
    }
    if (parent) {
      const hit = known.get(parent);
      if (hit) return hit;
    }
  }
  if (refs.length) return refs[0];
  if (parent) return parent;

  // Ни ссылок, ни родителя — сводим по теме внутри недели
  const norm = normalizeSubject(msg.subject);
  if (!norm) return msg.messageId || '';
  const t = new Date(msg.sentAt).getTime() || 0;
  const bucket = Math.floor(t / SUBJECT_WINDOW_MS);
  return `subj:${bucket}:${norm}`;
}

/**
 * Проставить ключи цепочек целой пачке. Сортируем по времени: письмо-предок
 * почти всегда старше ответа, и один проход по возрастанию времени наполняет
 * `known` в правильном порядке.
 */
export function assignThreadKeys<T extends ThreadInput>(messages: T[]): Array<T & { threadKey: string }> {
  const known = new Map<string, string>();
  const sorted = [...messages].sort(
    (a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime(),
  );
  const out: Array<T & { threadKey: string }> = [];
  for (const m of sorted) {
    const key = threadKeyOf(m, known);
    if (m.messageId) known.set(m.messageId, key);
    out.push({ ...m, threadKey: key });
  }
  return out;
}

/**
 * Как подписать цепочку в списке: «Смирнов», «Смирнов, вы», «Смирнов, вы (3)».
 * Ровно то, что делает Gmail, и по той же причине — из списка должно быть
 * видно, кто в переписке и сколько в ней писем, до её открытия.
 */
export function threadParticipants(names: string[], meLabel = 'вы'): string {
  const seen: string[] = [];
  for (const raw of names) {
    const n = String(raw || '').trim();
    if (!n) continue;
    if (!seen.includes(n)) seen.push(n);
  }
  if (!seen.length) return '';
  // «вы» всегда последним: так короткие имена собеседников видно первыми
  const meAt = seen.indexOf(meLabel);
  if (meAt >= 0 && meAt !== seen.length - 1) {
    seen.splice(meAt, 1);
    seen.push(meLabel);
  }
  if (seen.length <= 3) return seen.join(', ');
  return `${seen[0]}, .., ${seen[seen.length - 1]}`;
}
