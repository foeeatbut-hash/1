/**
 * Клавиши рабочего стола и окон.
 *
 * Вынесено из разметки, потому что ломается незаметно: сочетание, перехваченное
 * не вовремя, не падает и не мигает — оно просто отнимает клавишу у того, кто
 * в этот момент печатает. Инженер, набирающий имя файла, нажимает Delete,
 * чтобы стереть букву, а стол понимает это как «удалить документ».
 *
 * Отсюда главное правило: пока курсор в поле ввода, стол не слышит ничего.
 */

export type DeskAction =
  | 'open' | 'rename' | 'remove' | 'properties' | 'selectAll' | 'refresh'
  | 'clearSelection' | 'toggleView'
  | 'nextWindow' | 'prevWindow' | 'closeWindow' | 'minimizeAll' | 'start'
  | 'newWindow' | 'snapPanel';

export interface KeyEventLike {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
}

/**
 * Печатает ли человек прямо сейчас. Поле ввода, область текста и всё, что
 * помечено contentEditable, забирают клавиши себе целиком.
 */
export function isTyping(el: { tagName?: string; isContentEditable?: boolean } | null): boolean {
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = (el.tagName || '').toUpperCase();
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

/**
 * Что делать по нажатию. null — не наше сочетание, отдаём дальше.
 *
 * `typing` приходит извне, а не вычисляется здесь: модуль не знает про DOM,
 * и это же позволяет его проверить.
 */
export function deskAction(e: KeyEventLike, opts: { typing: boolean; hasSelection: boolean }): DeskAction | null {
  const ctrl = !!(e.ctrlKey || e.metaKey);

  // Alt+Tab и «Пуск» работают даже во время набора: это переключение между
  // окнами, а не правка содержимого. Так же ведёт себя и настоящая система
  if (e.altKey && e.key === 'Tab') return e.shiftKey ? 'prevWindow' : 'nextWindow';
  if (ctrl && e.altKey && (e.key === 'd' || e.key === 'в' || e.key === 'D' || e.key === 'В')) return 'minimizeAll';
  if (ctrl && e.key === 'Escape') return 'start';

  if (opts.typing) return null;

  // Ещё одно окно той же программы — Ctrl+Shift+N, а не Ctrl+N. Голый Ctrl+N
  // Блокнот уже занял под новую заметку, и отнимать у раздела то, чем в нём
  // пользуются каждый день, ради оболочки неправильно
  if (ctrl && e.shiftKey && !e.altKey && (e.key === 'n' || e.key === 'т' || e.key === 'N' || e.key === 'Т')) return 'newWindow';
  if (e.key === 'z' || e.key === 'Z' || e.key === 'я' || e.key === 'Я') {
    // Win+Z — как в системе. metaKey у нас уже занят под Ctrl, поэтому ловим
    // только настоящую клавишу Win (в браузере она приходит как metaKey без ctrl)
    if (e.metaKey && !e.ctrlKey && !e.altKey) return 'snapPanel';
  }

  if (e.key === 'Escape') return 'clearSelection';
  if (ctrl && (e.key === 'a' || e.key === 'ф' || e.key === 'A' || e.key === 'Ф')) return 'selectAll';
  if (ctrl && e.key === 'F4') return 'closeWindow';
  if (e.key === 'F5') return 'refresh';
  if (e.altKey && e.key === 'Enter') return opts.hasSelection ? 'properties' : null;
  if (!opts.hasSelection) return null;
  if (e.key === 'F2') return 'rename';
  if (e.key === 'Delete') return 'remove';
  if (e.key === 'Enter') return 'open';
  return null;
}

/**
 * Следующее окно по Alt+Tab.
 *
 * Порядок — по номеру наложения, а не по появлению: переключаются между тем,
 * что видно, и ожидают попасть в соседнее по глубине. Свёрнутые участвуют:
 * их для того и сворачивали, чтобы вернуть.
 */
export function nextInCycle<T extends { id: string; z: number }>(
  list: T[], currentId: string | null, back = false,
): T | null {
  if (!list.length) return null;
  const order = [...list].sort((a, b) => b.z - a.z);
  const i = order.findIndex((w) => w.id === currentId);
  if (i < 0) return order[0];
  const step = back ? -1 : 1;
  return order[(i + step + order.length) % order.length];
}
