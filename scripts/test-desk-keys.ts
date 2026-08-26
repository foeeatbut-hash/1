/**
 * Проверки клавиш рабочего стола и окон.
 *
 * Здесь ошибка не видна глазом и не падает: сочетание, перехваченное не
 * вовремя, просто отнимает клавишу у того, кто печатает. Инженер стирает букву
 * в имени файла клавишей Delete, а стол понимает это как «удалить документ» —
 * и документ уходит в корзину молча. Поэтому проверяется прежде всего то, чего
 * стол делать НЕ должен.
 */
import { deskAction, isTyping, nextInCycle } from '../src/lib/deskKeys';

let failed = 0;
const check = (name: string, cond: boolean, got?: unknown) => {
  if (cond) return;
  failed++;
  console.error(`  ✗ ${name}${got === undefined ? '' : ` — получили ${JSON.stringify(got)}`}`);
};

const sel = { typing: false, hasSelection: true };
const empty = { typing: false, hasSelection: false };
const typing = { typing: true, hasSelection: true };

console.log('Пока печатают — стол молчит');
{
  check('Delete во время набора не удаляет', deskAction({ key: 'Delete' }, typing) === null);
  check('F2 во время набора не переименовывает', deskAction({ key: 'F2' }, typing) === null);
  check('Enter во время набора не открывает', deskAction({ key: 'Enter' }, typing) === null);
  check('Ctrl+A во время набора выделяет текст, а не значки', deskAction({ key: 'a', ctrlKey: true }, typing) === null);
  check('Escape во время набора не наш', deskAction({ key: 'Escape' }, typing) === null);
  // Переключение окон — не правка содержимого, его отбирать нельзя
  check('Alt+Tab работает и во время набора', deskAction({ key: 'Tab', altKey: true }, typing) === 'nextWindow');
}

console.log('Что считается набором');
{
  check('поле ввода', isTyping({ tagName: 'input' }));
  check('область текста', isTyping({ tagName: 'TEXTAREA' }));
  check('выпадающий список', isTyping({ tagName: 'select' }));
  check('редактируемый блок', isTyping({ tagName: 'DIV', isContentEditable: true }));
  check('обычный блок — не набор', !isTyping({ tagName: 'DIV' }));
  check('пусто не роняет', !isTyping(null));
}

console.log('Действия со значком');
{
  check('F2 — переименовать', deskAction({ key: 'F2' }, sel) === 'rename');
  check('Delete — убрать', deskAction({ key: 'Delete' }, sel) === 'remove');
  check('Enter — открыть', deskAction({ key: 'Enter' }, sel) === 'open');
  check('Alt+Enter — свойства', deskAction({ key: 'Enter', altKey: true }, sel) === 'properties');
  check('без выделения переименовывать нечего', deskAction({ key: 'F2' }, empty) === null);
  check('без выделения удалять нечего', deskAction({ key: 'Delete' }, empty) === null);
  check('без выделения открывать нечего', deskAction({ key: 'Enter' }, empty) === null);
  check('без выделения и свойств нет', deskAction({ key: 'Enter', altKey: true }, empty) === null);
}

console.log('Общие');
{
  check('Ctrl+A — выделить всё', deskAction({ key: 'a', ctrlKey: true }, empty) === 'selectAll');
  check('и в русской раскладке', deskAction({ key: 'ф', ctrlKey: true }, empty) === 'selectAll');
  check('Cmd+A тоже', deskAction({ key: 'a', metaKey: true }, empty) === 'selectAll');
  check('F5 — обновить', deskAction({ key: 'F5' }, empty) === 'refresh');
  check('Escape снимает выделение', deskAction({ key: 'Escape' }, sel) === 'clearSelection');
  check('Ctrl+F4 закрывает окно', deskAction({ key: 'F4', ctrlKey: true }, empty) === 'closeWindow');
  check('Ctrl+Alt+D сворачивает всё', deskAction({ key: 'd', ctrlKey: true, altKey: true }, empty) === 'minimizeAll');
  check('и в русской раскладке', deskAction({ key: 'в', ctrlKey: true, altKey: true }, empty) === 'minimizeAll');
  check('Ctrl+Escape открывает Пуск', deskAction({ key: 'Escape', ctrlKey: true }, empty) === 'start');
  check('Shift+Alt+Tab — назад', deskAction({ key: 'Tab', altKey: true, shiftKey: true }, empty) === 'prevWindow');
  check('чужая клавиша не наша', deskAction({ key: 'q' }, sel) === null);
  check('одна буква без модификаторов не наша', deskAction({ key: 'a' }, sel) === null);
}

console.log('Обход окон');
{
  const w = [{ id: 'a', z: 1 }, { id: 'b', z: 3 }, { id: 'c', z: 2 }];
  check('порядок по наложению, а не по появлению', nextInCycle(w, 'b')!.id === 'c', nextInCycle(w, 'b'));
  check('дальше вниз', nextInCycle(w, 'c')!.id === 'a');
  check('с последнего — по кругу к верхнему', nextInCycle(w, 'a')!.id === 'b');
  check('назад идёт в другую сторону', nextInCycle(w, 'c', true)!.id === 'b', nextInCycle(w, 'c', true));
  check('назад с верхнего — по кругу вниз', nextInCycle(w, 'b', true)!.id === 'a');
  check('никого не выбрано — берём верхнее', nextInCycle(w, null)!.id === 'b');
  check('неизвестное окно — тоже верхнее', nextInCycle(w, 'нет-такого')!.id === 'b');
  check('одно окно возвращает само себя', nextInCycle([{ id: 'a', z: 1 }], 'a')!.id === 'a');
  check('пустой список не роняет', nextInCycle([], 'a') === null);
}

if (failed) {
  console.error(`\nПровалено проверок: ${failed}`);
  process.exit(1);
}
console.log('\nВсе проверки клавиш пройдены');
