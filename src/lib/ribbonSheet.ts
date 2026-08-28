/**
 * Состав ленты таблицы.
 *
 * Та же рама и тот же порядок, что у текстового документа: человек, перешедший
 * из записки в ведомость, ничего не ищет заново. Отличается тем, чем таблица
 * отличается от текста, — числом, ячейками, закреплением областей и умными
 * блоками.
 *
 * Привычное не переименовано: «Закрепить области», «Объединить», «Формат по
 * образцу» называются ровно так, как в Экселе. Инженер знает эти слова двадцать
 * лет; своя терминология в этом месте — препятствие, а не находка.
 */
import type { RibbonTab } from './ribbon';
import { DOC_FONTS } from './docExport';

export const SHEET_TEXT_COLORS = ['#0f172a', '#be123c', '#b45309', '#047857', '#0369a1'];
export const SHEET_FILL_COLORS = ['#fef9c3', '#dcfce7', '#e0f2fe', '#fee2e2', '#f1f5f9'];

/** Форматы числа: то, что в ведомостях встречается каждый день */
export const SHEET_FORMATS = [
  { value: 'General', label: 'Общий' },
  { value: '0', label: 'Целое' },
  { value: '0.00', label: '0,00' },
  { value: '#,##0.00', label: '1 234,56' },
  { value: '0.00%', label: 'Проценты' },
  { value: '#,##0.00\\ ₽', label: 'Рубли' },
  { value: 'DD.MM.YYYY', label: 'Дата' },
];

export function sheetRibbon(): RibbonTab[] {
  return [
    {
      name: 'Главная',
      groups: [
        {
          name: 'отмена',
          weight: 30,
          organs: [
            { id: 'sh.undo', kind: 'icon', icon: 'undo', hint: 'Отменить', keys: 'Ctrl+Z' },
            { id: 'sh.redo', kind: 'icon', icon: 'redo', hint: 'Вернуть', keys: 'Ctrl+Y' },
          ],
        },
        {
          name: 'шрифт',
          weight: 100,
          organs: [
            {
              id: 'sh.font', kind: 'select', label: 'Шрифт', hint: 'Шрифт выделенных ячеек',
              options: DOC_FONTS.map((f) => ({ value: f.value, label: f.label })), width: 130,
            },
            { id: 'sh.size', kind: 'spin', label: 'кегль', hint: 'Размер шрифта в выделении' },
            { id: 'sh.bold', kind: 'icon', icon: 'bold', hint: 'Полужирный', keys: 'Ctrl+B', toggle: true },
            { id: 'sh.italic', kind: 'icon', icon: 'italic', hint: 'Курсив', keys: 'Ctrl+I', toggle: true },
            { id: 'sh.underline', kind: 'icon', icon: 'underline', hint: 'Подчёркнутый', keys: 'Ctrl+U', toggle: true },
            { id: 'sh.strike', kind: 'icon', icon: 'strike', hint: 'Зачёркнутый', toggle: true },
          ],
        },
        {
          name: 'цвет',
          weight: 80,
          organs: [
            { id: 'sh.color', kind: 'split', icon: 'color', hint: 'Цвет текста', colors: SHEET_TEXT_COLORS },
            { id: 'sh.fill', kind: 'split', icon: 'fill', hint: 'Заливка ячеек', colors: SHEET_FILL_COLORS },
            { id: 'sh.borders', kind: 'label', label: 'Границы', icon: 'borders', hint: 'Все границы выделенного' },
            { id: 'sh.noBorders', kind: 'icon', icon: 'eraser', hint: 'Убрать границы' },
          ],
        },
        {
          name: 'выравнивание',
          weight: 90,
          organs: [
            { id: 'sh.left', kind: 'icon', icon: 'align-left', hint: 'По левому краю' },
            { id: 'sh.center', kind: 'icon', icon: 'align-center', hint: 'По центру' },
            { id: 'sh.right', kind: 'icon', icon: 'align-right', hint: 'По правому краю' },
            { id: 'sh.top', kind: 'icon', icon: 'top', hint: 'По верхнему краю' },
            { id: 'sh.bottom', kind: 'icon', icon: 'bottom', hint: 'По нижнему краю' },
            { id: 'sh.wrap', kind: 'icon', icon: 'wrap', hint: 'Переносить текст в ячейке', toggle: true },
          ],
        },
        {
          name: 'число',
          weight: 85,
          organs: [
            {
              id: 'sh.format', kind: 'select', label: 'Формат', hint: 'Формат числа в выделенных ячейках',
              options: SHEET_FORMATS, width: 110,
            },
          ],
        },
        {
          name: 'ячейки',
          weight: 75,
          organs: [
            { id: 'sh.merge', kind: 'icon', icon: 'merge', hint: 'Объединить выделенные ячейки' },
            { id: 'sh.unmerge', kind: 'icon', icon: 'split', hint: 'Разъединить' },
            { id: 'sh.rowAfter', kind: 'icon', icon: 'rows', hint: 'Вставить строку ниже' },
            { id: 'sh.colAfter', kind: 'icon', icon: 'cols', hint: 'Вставить столбец справа' },
            { id: 'sh.delRow', kind: 'icon', icon: 'minus', hint: 'Удалить строку' },
            { id: 'sh.delCol', kind: 'icon', icon: 'trash', hint: 'Удалить столбец' },
          ],
        },
        {
          name: 'правка',
          weight: 50,
          organs: [
            { id: 'sh.clear', kind: 'label', label: 'Очистить', icon: 'eraser', hint: 'Содержимое выделенных ячеек' },
          ],
        },
      ],
    },
    {
      name: 'Вставка',
      groups: [
        {
          name: 'строки',
          weight: 100,
          organs: [
            { id: 'sh.rowBefore', kind: 'big', label: 'Строка', icon: 'rows', hint: 'Вставить строку выше выделенной' },
            { id: 'sh.colBefore', kind: 'big', label: 'Столбец', icon: 'cols', hint: 'Вставить столбец слева' },
          ],
        },
        {
          name: 'лист',
          weight: 70,
          organs: [
            { id: 'sh.newSheet', kind: 'label', label: 'Новый лист', icon: 'sheet', hint: 'Добавить лист в книгу' },
          ],
        },
        {
          name: 'из проекта',
          weight: 90,
          organs: [
            { id: 'sh.wizard', kind: 'big', label: 'Собрать данные', icon: 'data', flux: true,
              hint: 'Умный блок: строки из проекта по отбору, обновляются по кнопке' },
            { id: 'sh.title', kind: 'label', label: 'Титул', icon: 'stamp', flux: true,
              hint: 'Шаблон титульного листа для этой книги', toggle: true },
          ],
        },
      ],
    },
    {
      name: 'Данные проекта',
      groups: [
        {
          name: 'умные блоки',
          weight: 100,
          organs: [
            { id: 'sh.blocks', kind: 'big', label: 'Блоки', icon: 'blocks', flux: true,
              hint: 'Список блоков книги: что откуда собрано и когда обновлялось', toggle: true },
            { id: 'sh.refreshAll', kind: 'label', label: 'Обновить всё', icon: 'refresh', flux: true,
              hint: 'Перечитать данные проекта во всех блоках книги' },
          ],
        },
        {
          name: 'подстановки',
          weight: 80,
          organs: [
            { id: 'sh.placeholders', kind: 'label', label: 'Метки', icon: 'formula', flux: true,
              hint: 'Лента меток: кнопка вставляет метку в ячейку', toggle: true },
            { id: 'sh.fillData', kind: 'label', label: 'Заполнить', icon: 'refresh', flux: true,
              hint: 'Подставить данные вместо меток' },
          ],
        },
        {
          name: 'выпуск',
          weight: 60,
          organs: [
            { id: 'sh.template', kind: 'label', label: 'Как шаблон', icon: 'template', flux: true,
              hint: 'Сохранить структуру и блоки для других проектов' },
            { id: 'sh.versions', kind: 'label', label: 'История', icon: 'layers', flux: true,
              hint: 'Версии книги и возврат к любой' },
            // Заказчику уходят два варианта документа, и второй раньше собирали
            // руками. Кнопка стоит рядом с выпуском, потому что это и есть выпуск
            { id: 'sh.english', kind: 'label', label: 'Английская версия', icon: 'languages', flux: true,
              hint: 'Собрать английский вариант документа: второй файл, второй лист, столбец рядом или две строки в ячейке' },
          ],
        },
      ],
    },
    {
      name: 'Вид',
      groups: [
        {
          name: 'масштаб',
          weight: 100,
          organs: [
            { id: 'sh.zoom', kind: 'spin', label: '100 %', hint: 'Масштаб листа на экране' },
            { id: 'sh.zoomReset', kind: 'label', label: 'Сбросить', icon: 'zoom', hint: 'Вернуть 100 %' },
          ],
        },
        {
          name: 'закрепить',
          weight: 90,
          organs: [
            { id: 'sh.freeze', kind: 'label', label: 'Области', icon: 'lock', hint: 'Закрепить строки и столбцы до выделенной ячейки' },
            { id: 'sh.unfreeze', kind: 'label', label: 'Снять', icon: 'reject', hint: 'Убрать закрепление' },
            { id: 'sh.grid', kind: 'icon', icon: 'borders', hint: 'Показывать сетку', toggle: true },
          ],
        },
        {
          name: 'панели',
          weight: 40,
          organs: [
            { id: 'sh.native', kind: 'label', label: 'Панель движка', icon: 'more', toggle: true,
              hint: 'Родная лента движка со всем, чего пока нет в нашей. Книга перечитается' },
          ],
        },
      ],
    },
  ];
}
