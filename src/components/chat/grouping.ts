/**
 * Как переписка разбивается на кучки.
 *
 * В мессенджерах подряд идущие сообщения одного человека показываются одним
 * блоком: имя пишется один раз сверху, кружок с буквой — один раз снизу,
 * между сообщениями узкий зазор. Раньше в Flux каждое сообщение несло свою
 * шапку «имя • часы • действия», и переписка из пяти коротких реплик подряд
 * выглядела как пять писем: полезного текста на экране оставалось меньше
 * трети, остальное — повторяющиеся подписи.
 *
 * Кучка разрывается, когда сменился отправитель, прошло больше пяти минут
 * или наступил новый день. Пять минут — обычная граница: за это время реплика
 * перестаёт быть продолжением предыдущей.
 *
 * Модуль чистый: массив на входе, разметка на выходе.
 */

export interface Groupable {
  id: string;
  senderId: string;
  createdAt: string;
}

export interface GroupMark {
  /** Первое сообщение кучки: над ним пишется имя */
  first: boolean;
  /** Последнее: рядом с ним рисуется кружок отправителя, у пузыря — уголок */
  last: boolean;
  /** Начался новый день: перед сообщением ставится дата */
  newDay: boolean;
  /** Как назвать этот день: «Сегодня», «Вчера», «14 марта» */
  dayLabel: string;
}

const GAP_MS = 5 * 60 * 1000;

/** Понятное название дня. Год добавляем только у прошлых лет. */
export function dayLabelOf(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === now.toDateString()) return 'Сегодня';
  if (d.toDateString() === yesterday.toDateString()) return 'Вчера';
  return d.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
  });
}

/** Разметка для всего списка: по метке на каждое сообщение, в том же порядке. */
export function markGroups(list: Groupable[], now: Date = new Date()): GroupMark[] {
  return list.map((m, i) => {
    const prev = i > 0 ? list[i - 1] : null;
    const next = i < list.length - 1 ? list[i + 1] : null;

    const newDay = !prev || new Date(prev.createdAt).toDateString() !== new Date(m.createdAt).toDateString();
    const breaksBefore = newDay || !prev || prev.senderId !== m.senderId
      || new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() > GAP_MS;
    const breaksAfter = !next
      || next.senderId !== m.senderId
      || new Date(next.createdAt).toDateString() !== new Date(m.createdAt).toDateString()
      || new Date(next.createdAt).getTime() - new Date(m.createdAt).getTime() > GAP_MS;

    return { first: breaksBefore, last: breaksAfter, newDay, dayLabel: dayLabelOf(m.createdAt, now) };
  });
}

/** Часы и минуты — то, что пишется в углу пузыря. */
export const timeOf = (iso: string): string =>
  new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
