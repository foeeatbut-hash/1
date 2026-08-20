import { useEffect, useRef } from 'react';

/**
 * Escape закрывает всплывающее окно.
 *
 * Раньше каждое окно решало это само, и из двадцати одного окна Escape
 * обрабатывали шесть: в Проводнике, Оборудовании, Конструкторе, мастере
 * импорта тегов и карточке проекта клавиша не делала ничего, хотя в соседнем
 * окне работала. Комментарий в ModalProvider при этом уверял, что «Esc
 * закрывает окно — как и все остальные всплывающие окна программы».
 *
 * Окна бывают вложенными: поверх карточки проекта открывается подтверждение
 * удаления. Закрываться должно только верхнее, поэтому открытые окна стоят в
 * стопке и клавишу получает последнее вставшее — как и ожидает человек.
 */
type Entry = { fn: () => void };

const stack: Entry[] = [];
let bound = false;

function bindOnce() {
  if (bound || typeof window === 'undefined') return;
  bound = true;
  window.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || !stack.length) return;
    // Поле ввода может занять Escape под себя — отмену правки ячейки, закрытие
    // списка подсказок. Такое поле помечает событие обработанным, и тогда окно
    // остаётся открытым: человек гасил подсказку, а не окно.
    if (e.defaultPrevented) return;
    e.preventDefault();
    stack[stack.length - 1].fn();
  });
}

/**
 * @param open   открыто ли окно сейчас — пока закрыто, клавишу не слушаем
 * @param onClose что делать по Escape
 */
export function useEscapeClose(open: boolean, onClose: () => void) {
  // Замыкание onClose пересоздаётся при каждой отрисовке. В стопке держим
  // постоянную запись, которая зовёт свежую версию: иначе либо порядок
  // вложенности сбивается на каждой отрисовке, либо закрытие идёт по старому.
  const latest = useRef(onClose);
  latest.current = onClose;

  useEffect(() => {
    if (!open) return;
    bindOnce();
    const entry: Entry = { fn: () => latest.current() };
    stack.push(entry);
    return () => {
      const i = stack.indexOf(entry);
      if (i >= 0) stack.splice(i, 1);
    };
  }, [open]);
}
