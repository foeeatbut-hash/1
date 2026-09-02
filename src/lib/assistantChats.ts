/**
 * Разговоры с помощником: имя, поиск и что считать пустым.
 *
 * До сих пор разговор жил до перезагрузки страницы. Это выглядело мелочью,
 * пока не выяснилось, чем люди пользуются: вопрос помощнику — это чаще всего
 * «как мы делали это в прошлый раз». Ответ на него ищут не в справке, а в
 * собственной переписке двухнедельной давности.
 *
 * Правила отсюда — не про хранение, а про то, как переписка выглядит списком.
 * Ошибки здесь тихие: разговор без имени в списке неотличим от соседнего, а
 * пустой, сохранённый по случайному нажатию, засоряет список навсегда.
 *
 * Без React и без обращений к сети — это правила, а не работа с базой.
 */

/** Одна реплика в том виде, в каком она попадает в список и в поиск */
export interface ChatLine {
  role: 'user' | 'assistant';
  text: string;
}

/** Строка списка разговоров */
export interface ChatSummary {
  id: string;
  title: string;
  updatedAt: string | number;
  /** Начало последнего ответа — чтобы отличить два разговора с похожим именем */
  preview?: string;
}

/** Сколько знаков имени помещается в узкий список слева */
export const TITLE_MAX = 60;

/**
 * Имя разговора — первая фраза человека.
 *
 * Не первая реплика вообще: первая реплика всегда приветствие помощника, и
 * список из двадцати одинаковых «Здравствуйте! Я помощник Flux» бесполезен.
 */
export function titleOf(lines: ChatLine[], fallback = 'Разговор'): string {
  const first = lines.find((l) => l.role === 'user' && l.text.trim());
  const raw = (first?.text || '').replace(/\s+/g, ' ').trim();
  if (!raw) return fallback;
  if (raw.length <= TITLE_MAX) return raw;
  // Обрываем по слову: «покажи все вентиляторы в системе прито…» читается,
  // «покажи все вентиляторы в системе прито» — нет
  const cut = raw.slice(0, TITLE_MAX);
  const space = cut.lastIndexOf(' ');
  return `${(space > TITLE_MAX / 2 ? cut.slice(0, space) : cut).trim()}…`;
}

/**
 * Есть ли в разговоре что сохранять.
 *
 * Пустой разговор — тот, где человек ничего не спросил. Сохранять его значит
 * заводить в списке строку «Разговор» без содержания: открыл помощника,
 * передумал, закрыл — и получил запись в истории.
 */
export const isEmptyTalk = (lines: ChatLine[]): boolean =>
  !lines.some((l) => l.role === 'user' && l.text.trim());

/**
 * Строка для поиска: все реплики строчными буквами.
 *
 * Ищут по тому, что спрашивали, а не по имени разговора: имя — только первая
 * фраза, а нужное слово чаще во второй. Длину ограничиваем: разговор на сто
 * реплик не должен раздувать строку поиска до мегабайта.
 */
export const SEARCH_MAX = 8000;
export function searchText(lines: ChatLine[]): string {
  const all = lines.map((l) => (l.text || '').replace(/\s+/g, ' ').trim()).filter(Boolean).join(' ');
  return all.toLowerCase().slice(0, SEARCH_MAX);
}

/** Начало последнего ответа помощника — вторая строка в списке */
export function previewOf(lines: ChatLine[], max = 90): string {
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i];
    if (l.role !== 'assistant') continue;
    const t = (l.text || '').replace(/\s+/g, ' ').trim();
    if (!t) continue;
    return t.length > max ? `${t.slice(0, max).trim()}…` : t;
  }
  return '';
}

/** Разговоры по дням: «Сегодня», «Вчера», дата — как в любой переписке */
export function dayLabel(at: string | number, now: Date = new Date()): string {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return 'Когда-то';
  const midnight = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((midnight(now) - midnight(d)) / 86400000);
  if (days <= 0) return 'Сегодня';
  if (days === 1) return 'Вчера';
  if (days < 7) return 'На этой неделе';
  if (days < 31) return 'В этом месяце';
  return d.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
}

/** Список по дням, свежие сверху — порядок в списке слева */
export function groupByDay(chats: ChatSummary[], now: Date = new Date()): { label: string; chats: ChatSummary[] }[] {
  const sorted = [...chats].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  const out: { label: string; chats: ChatSummary[] }[] = [];
  for (const c of sorted) {
    const label = dayLabel(c.updatedAt, now);
    const last = out[out.length - 1];
    if (last && last.label === label) last.chats.push(c);
    else out.push({ label, chats: [c] });
  }
  return out;
}

/**
 * Отбор списка по строке поиска, когда искать приходится на клиенте.
 *
 * Сервер ищет по всем репликам (поле search), но список уже загружен, и пока
 * человек набирает, отвечать должен он, а не сеть.
 */
export function filterChats(chats: ChatSummary[], q: string): ChatSummary[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return chats;
  return chats.filter((c) =>
    c.title.toLowerCase().includes(needle) || (c.preview || '').toLowerCase().includes(needle));
}
