/**
 * Меню «Файл» документа и таблицы.
 *
 * Разделы одни и те же у обоих редакторов — этим и оправдан общий модуль:
 * человек, перешедший из ведомости в записку, ищет «Выпустить ревизию» там же,
 * где оставил. Действия приходят обработчиками: что именно делает «Печать», у
 * таблицы и документа разное, а место у неё одно.
 *
 * Недоступное не прячется, а гаснет с причиной: «Документ не привязан к строке
 * ВДР — выпускать нечего». Исчезнувший пункт заставляет искать себя заново и
 * подозревать, что программа сломалась.
 */
import type { FileMenuSection } from './ribbon';

export interface FileMenuHandlers {
  saveNow: () => void;
  saveVersion: () => void;
  versions: () => void;
  copy: () => void;
  template: () => void;
  revision: () => void;
  print: () => void;
  pdf: () => void;
  /** «В Ворд» или «В Эксель» — подпись задаётся отдельно */
  office: () => void;
  officeLabel: string;
  officeHint: string;
  toExplorer: () => void;
  plain?: () => void;
  plainLabel?: string;
  properties?: () => void;
  close: () => void;
  /** Причины, по которым пункт нельзя нажать */
  noRevision?: string;
}

export function editorFileMenu(h: FileMenuHandlers): FileMenuSection[] {
  const sections: FileMenuSection[] = [
    {
      name: 'Сохранить',
      items: [
        { label: 'Сохранить сейчас', hint: 'Не дожидаясь автосохранения', icon: 'save', run: h.saveNow },
        { label: 'Сохранить версию', hint: 'Снимок с комментарием — к нему можно вернуться', icon: 'history', run: h.saveVersion },
        { label: 'История версий', hint: 'Список снимков и возврат к любому', icon: 'layers', run: h.versions },
      ],
    },
    {
      name: 'Создать копию',
      items: [
        { label: 'Копия документа', hint: 'Отдельный документ с тем же содержимым', icon: 'copy', run: h.copy },
        { label: 'Сохранить как шаблон', hint: 'Структура и связи без данных — применяется к любому проекту', icon: 'template', run: h.template },
      ],
    },
    {
      name: 'Выпустить ревизию',
      items: [
        {
          label: 'Следующая ревизия', icon: 'stamp', disabled: h.noRevision,
          hint: 'Прежняя остаётся целой: ВДР, титул и лист ревизий обновятся',
          run: h.revision,
        },
      ],
    },
    {
      name: 'Печать и выгрузка',
      items: [
        { label: 'Печать', hint: 'Титул, лист ревизий и тело документа (Ctrl+P)', icon: 'print', run: h.print },
        { label: 'В PDF', hint: 'Готовый к рассылке файл', icon: 'print', run: h.pdf },
        { label: h.officeLabel, hint: h.officeHint, icon: 'doc', run: h.office },
        { label: 'В Проводник', hint: 'Файл появится в общей папке проекта', icon: 'folder', run: h.toExplorer },
      ],
    },
  ];
  if (h.plain && h.plainLabel) {
    sections[3].items.push({ label: h.plainLabel, hint: 'Только содержимое, без оформления', icon: 'extract', run: h.plain });
  }
  sections.push({
    name: 'Закрыть',
    items: [
      ...(h.properties ? [{ label: 'Свойства', hint: 'То же окно, что по Alt+Enter на столе', icon: 'info', run: h.properties }] : []),
      { label: 'Закрыть документ', hint: 'Вернуться туда, откуда открыли', icon: 'reject', run: h.close },
    ],
  });
  return sections;
}
