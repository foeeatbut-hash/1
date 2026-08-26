/**
 * Состав ленты текстового документа.
 *
 * Панель движка Univer спрятана целиком, и её команды вызываются отсюда. Это
 * решение, а не удобство: пока панелей две, они живут по разным законам —
 * чужие синие вкладки, чужие отступы, чужой порядок. Одинаковый вид у четырёх
 * редакторов получается устройством, а не дисциплиной.
 *
 * Того, чего мы не перенесли, лишиться нельзя: во вкладке «Вид» осталась
 * кнопка «Панель движка» — она возвращает родную ленту Univer со всем, что в
 * ней есть. Так это будет, пока не перенесём всё нужное.
 *
 * Здесь только описание. Выполняет команды экран (screens/TextDocEditor).
 */
import type { RibbonTab } from './ribbon';
import { DOC_FONTS } from './docExport';

export const DOC_TEXT_COLORS = ['#0f172a', '#be123c', '#b45309', '#047857', '#0369a1'];
export const DOC_MARK_COLORS = ['#fef08a', '#bbf7d0', '#bfdbfe', '#fbcfe8', '#e2e8f0'];

/** Именованные стили абзаца: то же, что в Ворде выпадающим списком «Стиль» */
export const DOC_STYLES = [
  { value: 'normal', label: 'Обычный' },
  { value: 'title', label: 'Название' },
  { value: 'subtitle', label: 'Подзаголовок' },
  { value: 'h1', label: 'Заголовок 1' },
  { value: 'h2', label: 'Заголовок 2' },
  { value: 'h3', label: 'Заголовок 3' },
  { value: 'h4', label: 'Заголовок 4' },
];

/**
 * Лента одна на все документы: что нельзя нажать сейчас, гасится на месте
 * (проп disabled у RibbonBar) вместе с причиной. Собирать разный состав под
 * разные документы значило бы, что кнопка то есть, то нет, — и её каждый раз
 * ищут заново.
 */
export function docRibbon(): RibbonTab[] {
  return [
    {
      name: 'Главная',
      groups: [
        {
          name: 'отмена',
          weight: 30,
          organs: [
            { id: 'doc.undo', kind: 'icon', icon: 'undo', hint: 'Отменить', keys: 'Ctrl+Z' },
            { id: 'doc.redo', kind: 'icon', icon: 'redo', hint: 'Вернуть', keys: 'Ctrl+Y' },
          ],
        },
        {
          name: 'шрифт',
          weight: 100,
          organs: [
            {
              id: 'doc.font', kind: 'select', label: 'Шрифт', hint: 'Шрифт выделенного текста',
              options: DOC_FONTS.map((f) => ({ value: f.value, label: f.label })), width: 130,
            },
            { id: 'doc.size', kind: 'spin', label: '11', hint: 'Кегль' },
            { id: 'doc.bold', kind: 'icon', icon: 'bold', hint: 'Полужирный', keys: 'Ctrl+B', toggle: true },
            { id: 'doc.italic', kind: 'icon', icon: 'italic', hint: 'Курсив', keys: 'Ctrl+I', toggle: true },
            { id: 'doc.underline', kind: 'icon', icon: 'underline', hint: 'Подчёркнутый', keys: 'Ctrl+U', toggle: true },
            { id: 'doc.strike', kind: 'icon', icon: 'strike', hint: 'Зачёркнутый', toggle: true },
          ],
        },
        {
          name: 'цвет',
          weight: 70,
          organs: [
            { id: 'doc.color', kind: 'split', icon: 'color', hint: 'Цвет текста', colors: DOC_TEXT_COLORS },
            { id: 'doc.mark', kind: 'split', icon: 'highlight', hint: 'Заливка текста', colors: DOC_MARK_COLORS },
            { id: 'doc.sub', kind: 'icon', icon: 'sub', hint: 'Подстрочный', toggle: true },
            { id: 'doc.sup', kind: 'icon', icon: 'sup', hint: 'Надстрочный', toggle: true },
          ],
        },
        {
          name: 'абзац',
          weight: 90,
          organs: [
            { id: 'doc.left', kind: 'icon', icon: 'align-left', hint: 'По левому краю' },
            { id: 'doc.center', kind: 'icon', icon: 'align-center', hint: 'По центру' },
            { id: 'doc.right', kind: 'icon', icon: 'align-right', hint: 'По правому краю' },
            { id: 'doc.justify', kind: 'icon', icon: 'align-justify', hint: 'По ширине' },
            { id: 'doc.indent', kind: 'icon', icon: 'indent', hint: 'Увеличить отступ слева' },
            { id: 'doc.outdent', kind: 'icon', icon: 'outdent', hint: 'Уменьшить отступ слева' },
            { id: 'doc.spacing', kind: 'label', label: 'Интервал', icon: 'spacing', hint: 'Междустрочный, до и после абзаца, красная строка' },
          ],
        },
        {
          name: 'списки',
          weight: 60,
          organs: [
            { id: 'doc.bullets', kind: 'icon', icon: 'bullets', hint: 'Маркированный список' },
            { id: 'doc.numbers', kind: 'icon', icon: 'numbers', hint: 'Нумерованный список' },
            { id: 'doc.checklist', kind: 'icon', icon: 'checklist', hint: 'Список с галочками' },
          ],
        },
        {
          name: 'стили',
          weight: 50,
          organs: [
            {
              id: 'doc.style', kind: 'select', label: 'Стиль абзаца', hint: 'Обычный текст, название, заголовки',
              options: DOC_STYLES, width: 128,
            },
          ],
        },
      ],
    },
    {
      name: 'Вставка',
      groups: [
        {
          name: 'таблица',
          weight: 100,
          organs: [
            { id: 'doc.table', kind: 'big', label: 'Таблица', icon: 'table', hint: 'Выберите размер сеткой' },
          ],
        },
        {
          name: 'объекты',
          weight: 80,
          organs: [
            { id: 'doc.image', kind: 'label', label: 'Рисунок', icon: 'image', hint: 'Картинка из файла' },
            { id: 'doc.link', kind: 'label', label: 'Ссылка', icon: 'link', hint: 'Гиперссылка на выделенный текст' },
            { id: 'doc.rule', kind: 'icon', icon: 'rule', hint: 'Горизонтальная черта' },
          ],
        },
        {
          name: 'колонтитулы',
          weight: 60,
          organs: [
            { id: 'doc.headerFooter', kind: 'label', label: 'Колонтитулы', icon: 'page', hint: 'Верхний и нижний колонтитул страницы' },
          ],
        },
        {
          name: 'из проекта',
          weight: 70,
          organs: [
            { id: 'doc.title', kind: 'label', label: 'Титул по шаблону', icon: 'stamp', flux: true, hint: 'Титульный лист заполнится реквизитами этого документа' },
          ],
        },
      ],
    },
    {
      name: 'Разметка',
      groups: [
        {
          name: 'лист',
          weight: 100,
          organs: [
            { id: 'doc.page', kind: 'big', label: 'Параметры', icon: 'page', hint: 'Формат листа, ориентация, поля' },
          ],
        },
        {
          name: 'показать',
          weight: 60,
          organs: [
            { id: 'doc.ruler', kind: 'label', label: 'Линейка', icon: 'ruler', hint: 'Поля и отступы тянутся мышью', toggle: true },
          ],
        },
      ],
    },
    {
      name: 'Данные проекта',
      groups: [
        {
          name: 'поля',
          weight: 100,
          organs: [
            {
              id: 'doc.fields', kind: 'big', label: 'Вставить поле', icon: 'data', flux: true,
              hint: 'Шифр проекта, заказчик, параметр тега, характеристика оборудования',
            },
          ],
        },
        {
          name: 'сейчас',
          weight: 70,
          organs: [
            { id: 'doc.today', kind: 'label', label: 'Сегодня', icon: 'date', flux: true, hint: 'Сегодняшняя дата' },
            { id: 'doc.author', kind: 'label', label: 'Автор', icon: 'info', flux: true, hint: 'Ваше имя из учётной записи' },
          ],
        },
        {
          name: 'выпуск',
          weight: 80,
          organs: [
            { id: 'doc.revision', kind: 'label', label: 'Ревизия', icon: 'history', flux: true, hint: 'Выпустить следующую ревизию: ВДР, титул и лист ревизий' },
            { id: 'doc.versions', kind: 'label', label: 'История', icon: 'layers', flux: true, hint: 'Версии документа и возврат к любой из них' },
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
            { id: 'doc.zoom', kind: 'spin', label: '100 %', hint: 'Масштаб листа на экране' },
            { id: 'doc.zoomReset', kind: 'label', label: 'Сбросить', icon: 'zoom', hint: 'Вернуть 100 %' },
          ],
        },
        {
          name: 'панели',
          weight: 70,
          organs: [
            { id: 'doc.native', kind: 'label', label: 'Панель движка', icon: 'more', toggle: true,
              hint: 'Родная лента движка со всем, чего пока нет в нашей. Документ перечитается' },
          ],
        },
      ],
    },
  ];
}
