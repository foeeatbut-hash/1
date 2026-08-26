/**
 * Состав ленты редактора чертежей ПДФ.
 *
 * Та же рама, что у документа и таблицы. Отличие одно, но важное: здесь ничего
 * не правят в самом файле. Чертёж поставщика ценен тем, что он не изменён, —
 * поэтому «Пометки» это не рисование по документу, а записи проекта поверх
 * него.
 */
import type { RibbonTab } from './ribbon';

/** Цвета пометок: набор короткий и один и тот же, чтобы красный у всех значил одно */
export const MARKUP_COLORS = ['#be123c', '#b45309', '#047857', '#0369a1', '#0f172a'];

/** Чем помечают. Порядок тот же, что в группе «черчение» ленты */
export const MARKUP_TOOLS = [
  { id: 'CLOUD', label: 'Облако', icon: 'cloud', hint: 'Обвести область: типовая пометка чертёжника' },
  { id: 'RECT', label: 'Рамка', icon: 'rect', hint: 'Прямоугольник вокруг места' },
  { id: 'ARROW', label: 'Стрелка', icon: 'arrow', hint: 'Выноска с замечанием' },
  { id: 'NOTE', label: 'Записка', icon: 'note', hint: 'Точка, раскрывающаяся текстом' },
];

/** Готовые штампы: то, что пишут на чертеже чаще всего */
export const MARKUP_STAMPS = ['Проверено', 'В работу', 'Отменено'];

export function pdfRibbon(): RibbonTab[] {
  return [
    {
      name: 'Главная',
      groups: [
        {
          name: 'страницы',
          weight: 100,
          organs: [
            { id: 'pdf.prev', kind: 'icon', icon: 'prev', hint: 'Предыдущая страница' },
            { id: 'pdf.next', kind: 'icon', icon: 'next', hint: 'Следующая страница' },
          ],
        },
        {
          name: 'масштаб',
          weight: 95,
          organs: [
            { id: 'pdf.zoom', kind: 'spin', label: '100 %', hint: 'Масштаб чертежа на экране' },
            { id: 'pdf.fitWidth', kind: 'label', label: 'По ширине', icon: 'width', hint: 'Вписать лист по ширине окна' },
            { id: 'pdf.fitPage', kind: 'label', label: 'Весь лист', icon: 'fullscreen', hint: 'Вписать лист целиком' },
          ],
        },
        {
          name: 'поворот',
          weight: 50,
          organs: [
            { id: 'pdf.rotateLeft', kind: 'icon', icon: 'rotate-left', hint: 'Повернуть влево' },
            { id: 'pdf.rotateRight', kind: 'icon', icon: 'rotate-right', hint: 'Повернуть вправо' },
          ],
        },
        {
          name: 'файл',
          weight: 70,
          organs: [
            { id: 'pdf.download', kind: 'label', label: 'Скачать', icon: 'save', hint: 'Исходный файл как есть' },
            { id: 'pdf.print', kind: 'label', label: 'Печать', icon: 'print', hint: 'Отправить чертёж на принтер' },
          ],
        },
      ],
    },
    {
      name: 'Пометки',
      groups: [
        {
          name: 'черчение',
          weight: 100,
          organs: [
            { id: 'pdf.cloud', kind: 'big', label: 'Облако', icon: 'cloud', hint: 'Обвести область волнистой линией', toggle: true },
            { id: 'pdf.rect', kind: 'label', label: 'Рамка', icon: 'rect', hint: 'Прямоугольник', toggle: true },
            { id: 'pdf.arrow', kind: 'label', label: 'Стрелка', icon: 'arrow', hint: 'Выноска с замечанием', toggle: true },
            { id: 'pdf.note', kind: 'label', label: 'Записка', icon: 'note', hint: 'Точка с текстом', toggle: true },
          ],
        },
        {
          name: 'вид пометки',
          weight: 90,
          organs: [
            { id: 'pdf.color', kind: 'palette', hint: 'Цвет пометки', colors: MARKUP_COLORS },
            { id: 'pdf.width', kind: 'spin', label: '2 пт', hint: 'Толщина линии' },
          ],
        },
        {
          name: 'штампы',
          weight: 70,
          organs: [
            { id: 'pdf.stampOk', kind: 'label', label: 'Проверено', icon: 'stamp', flux: true, hint: 'Поставить штамп на лист' },
            { id: 'pdf.stampWork', kind: 'label', label: 'В работу', icon: 'stamp', flux: true, hint: 'Поставить штамп на лист' },
            { id: 'pdf.stampNo', kind: 'label', label: 'Отменено', icon: 'stamp', flux: true, hint: 'Поставить штамп на лист' },
          ],
        },
        {
          name: 'разбор',
          weight: 85,
          organs: [
            { id: 'pdf.list', kind: 'label', label: 'Списком', icon: 'panel', flux: true, hint: 'Все пометки чертежа с авторами и состоянием', toggle: true },
            { id: 'pdf.copy', kind: 'label', label: 'В буфер', icon: 'mail', flux: true,
              hint: 'Замечания текстом — вставить в письмо поставщику' },
          ],
        },
      ],
    },
    {
      name: 'Данные проекта',
      groups: [
        {
          name: 'ревизии',
          weight: 100,
          organs: [
            {
              id: 'pdf.scope', kind: 'select', label: 'Пометки', width: 190,
              hint: 'Пометки прежних ревизий показываются серыми — видно, что учтено, а что нет',
              options: [
                { value: 'current', label: 'Этой ревизии' },
                { value: 'all', label: 'Всех ревизий' },
              ],
            },
          ],
        },
        {
          name: 'состояние',
          weight: 80,
          organs: [
            { id: 'pdf.status', kind: 'label', label: 'Стадия', icon: 'stamp', flux: true, hint: 'Стадия файла в Проводнике: черновик, на проверке, согласован' },
          ],
        },
      ],
    },
    {
      name: 'Вид',
      groups: [
        {
          name: 'разворот',
          weight: 100,
          organs: [
            { id: 'pdf.thumbs', kind: 'label', label: 'Миниатюры', icon: 'panel', hint: 'Полоса страниц слева', toggle: true },
            { id: 'pdf.invert', kind: 'label', label: 'Инверсия', icon: 'invert', hint: 'Белое на чёрном — для тёмного помещения', toggle: true },
          ],
        },
      ],
    },
  ];
}
