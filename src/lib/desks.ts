/**
 * Рабочие столы: счёт без React и без DOM.
 *
 * Столы делят окна, но не файлы: значки, корзина и папки на всех столах одни и
 * те же. Поэтому здесь нет ничего, кроме перенумерации — и ровно в ней легко
 * ошибиться. Убрали второй стол из трёх — окна четвёртого... четвёртого нет, а
 * окна третьего обязаны стать окнами второго, иначе они уедут в никуда и с
 * панели задач исчезнут насовсем.
 *
 * Проверяется scripts/test-windows.ts.
 */
import type { WinState } from './windows';

/** Имя нового стола: человек его переименует, но пустым оно быть не должно */
export const deskName = (index: number): string => `Стол ${index + 1}`;

/** Столов всегда хотя бы один: «ни одного стола» — это не состояние программы */
export function safeDesks(names: unknown): string[] {
  if (Array.isArray(names) && names.length && names.every((x) => typeof x === 'string' && x)) {
    return names as string[];
  }
  return [deskName(0)];
}

/** Показанный стол не может указывать за список: столы убирают, пока смотрят */
export const clampDesk = (index: number, count: number): number =>
  Math.min(Math.max(0, index), Math.max(0, count - 1));

/**
 * Куда переедут окна убираемого стола: на предыдущий, а первого — на новый
 * первый. Стол — это раскладка, а не хранилище, и терять вместе с ним открытые
 * документы человек не соглашался.
 */
export const deskAfterRemoval = (index: number): number => Math.max(0, index - 1);

/** Перенумеровать окна после того, как стол убран */
export function reindexWindows(list: WinState[], removed: number): WinState[] {
  const to = deskAfterRemoval(removed);
  return list.map((w) => {
    if (w.desk === removed) return { ...w, desk: to };
    return w.desk > removed ? { ...w, desk: w.desk - 1 } : w;
  });
}

/** Стол по кругу не переключается: за краем ничего нет, и упираться — честно */
export const stepDesk = (index: number, delta: number, count: number): number =>
  clampDesk(index + delta, count);
