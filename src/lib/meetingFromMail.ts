/**
 * Встреча, найденная в письме.
 *
 * «Пожалуйста, подключитесь к совещанию 7 сентября в 10:00, ссылка ниже» —
 * письмо, после которого человек вручную заводит событие, копируя дату, время
 * и ссылку из трёх разных мест. Программа уже разбирает письма
 * (src/translate/mailDigest.ts): даты по-русски, по-английски и по-китайски она
 * находит. Здесь к ним добавляется время, ссылка на встречу и признак того,
 * что письмо вообще про встречу.
 *
 * Ничего не заводится само. Итог этого модуля — предложение, а не событие:
 * встреча, появившаяся в календаре без ведома человека, — уже не помощь.
 *
 * Проверяется scripts/test-meeting-mail.ts.
 */
import { findDates } from '../translate/mailDigest';

/**
 * Хосты, за которыми стоит встреча.
 *
 * Список именно из тех, чем пользуются здесь. Считать встречей любую ссылку
 * нельзя: в письме их пять, и четыре ведут на портал закупок.
 */
const MEET_HOSTS = [
  'telemost.yandex', 'link.mts.ru', 'teams.microsoft', 'teams.live',
  'zoom.us', 'meet.google', 'salutejazz', 'jazz.sber', 'videomost',
  'webinar.ru', 'pruffme', 'dion.vc', 'trueconf', 'vinteo', 'ktalk.ru',
];

/** Слова, которыми зовут на встречу. Регистр не важен, язык — любой из трёх */
const MEET_WORDS =
  /(встреч|совещан|созвон|планёрк|планерк|подключ|приглаша|конференц|конф-колл|selector)|(\bmeeting\b|\bcall\b|\bjoin\b|\binvite\b|\bconference\b)|(会议|通话|加入)/i;

/** Время: 10:00, 10-00, «в 10 утра», 10 am, 10:00 (МСК) */
const TIME_RE =
  /(?:^|[\s(,;])(?:в\s*)?([01]?\d|2[0-3])[:\.-]([0-5]\d)(?!\d)|(?:^|[\s(,;])(?:в\s*)?([01]?\d|2[0-3])\s*(am|pm|утра|вечера|часов|час)/gi;

export interface FoundMeeting {
  /** Начало встречи; время найдено в письме или взято рабочее */
  startsAt: number;
  /** Время нашлось в письме, а не подставлено */
  exactTime: boolean;
  /** Ссылка на встречу; пусто — ссылки в письме нет */
  joinUrl: string;
  /** Как дата была написана в письме — показываем, чтобы можно было сверить */
  said: string;
  /** Насколько уверены: 0…1. Ниже 0.5 не предлагаем вовсе */
  score: number;
}

/** Ссылка на встречу в тексте письма; первая найденная — она же обычно единственная */
export function meetingLink(text: string): string {
  const urls = String(text || '').match(/https?:\/\/[^\s<>"')]+/gi) || [];
  for (const raw of urls) {
    const url = raw.replace(/[.,;)]+$/, '');
    if (MEET_HOSTS.some((h) => url.toLowerCase().includes(h))) return url;
  }
  return '';
}

/** Время из письма: часы и минуты первого попавшегося времени суток */
export function meetingTime(text: string): { h: number; m: number } | null {
  const s = String(text || '');
  TIME_RE.lastIndex = 0;
  let hit: RegExpExecArray | null;
  while ((hit = TIME_RE.exec(s))) {
    if (hit[1] !== undefined) {
      return { h: Number(hit[1]), m: Number(hit[2]) };
    }
    if (hit[3] !== undefined) {
      let h = Number(hit[3]);
      const mark = (hit[4] || '').toLowerCase();
      // «в 3 pm» и «в 3 вечера» — это пятнадцать часов, и промах здесь стоит
      // ровно половины рабочего дня
      if ((mark === 'pm' || mark === 'вечера') && h < 12) h += 12;
      if ((mark === 'am' || mark === 'утра') && h === 12) h = 0;
      return { h, m: 0 };
    }
  }
  return null;
}

/**
 * Похоже ли письмо на приглашение.
 *
 * Уверенность складывается из трёх вещей: слова встречи, ссылки на известную
 * площадку и найденной даты. Одного мало: «созвонимся как-нибудь» — не
 * встреча, а ссылка на Телемост в подписи коллеги — тем более.
 */
export function findMeeting(text: string, now = new Date()): FoundMeeting | null {
  const s = String(text || '');
  if (!s.trim()) return null;

  const hasWords = MEET_WORDS.test(s);
  const joinUrl = meetingLink(s);
  const dates = findDates(s, now);
  const date = dates[0] || null;

  let score = 0;
  if (hasWords) score += 0.4;
  if (joinUrl) score += 0.4;
  if (date) score += 0.3;
  if (score < 0.5 || !date) return null;

  const time = meetingTime(s);
  const at = new Date(date.at);
  if (time) at.setHours(time.h, time.m, 0, 0);
  // Времени в письме нет — ставим десять утра и говорим об этом: подставить
  // молча значит назначить встречу на время, которого никто не называл
  else at.setHours(10, 0, 0, 0);

  return {
    startsAt: at.getTime(),
    exactTime: !!time,
    joinUrl,
    said: date.said,
    score: Math.min(1, score),
  };
}

/** Строка над письмом: что нашли и что предлагаем */
export function meetingHint(m: FoundMeeting): string {
  const d = new Date(m.startsAt);
  const pad = (n: number) => String(n).padStart(2, '0');
  const when = `${d.getDate()}.${pad(d.getMonth() + 1)}`;
  const time = m.exactTime ? `, ${pad(d.getHours())}:${pad(d.getMinutes())}` : ', время не указано';
  const link = m.joinUrl ? ' · ссылка есть' : '';
  return `Похоже на встречу: ${when}${time}${link}`;
}

/**
 * «Не надо» запоминается по отправителю.
 *
 * Рассылка, которая каждый раз пахнет встречей, должна перестать спрашивать
 * после первого отказа: предложение, повторяющееся вопреки ответу, читается
 * как неисправность.
 */
const SKIP_KEY = 'flux_meeting_skip';

const readSkip = (): string[] => {
  try {
    const raw = localStorage.getItem(SKIP_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.map((x) => String(x)) : [];
  } catch (_) { return []; }
};

export function meetingSkipped(addr: string): boolean {
  const a = String(addr || '').toLowerCase();
  return !!a && readSkip().includes(a);
}

export function skipMeetingsFrom(addr: string): void {
  const a = String(addr || '').toLowerCase();
  if (!a) return;
  const list = readSkip();
  if (list.includes(a)) return;
  try { localStorage.setItem(SKIP_KEY, JSON.stringify([...list, a].slice(-200))); } catch (_) { /* приватный режим */ }
}
