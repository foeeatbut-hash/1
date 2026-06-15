// Декларативные пошаговые демонстрации для встроенного ассистента.
// Каждый шаг подсвечивает элемент по data-tour-атрибуту и ждёт действия пользователя.

export type TourAction = 'click' | 'input' | 'navigate' | 'info';

export interface TourStep {
  text: string;            // что показать в чате и в подсказке у элемента
  target?: string;         // CSS-селектор подсвечиваемого элемента (обычно [data-tour="..."])
  route?: string;          // если шаг требует определённого раздела
  action?: TourAction;     // тип ожидаемого действия (для текста подсказки)
}

export interface Tour {
  id: string;
  title: string;
  keywords: string[];      // по этим словам ассистент предлагает демонстрацию
  intro: string;           // вводный ответ ассистента
  steps: TourStep[];
}

export const TOURS: Tour[] = [
  {
    id: 'add-tag',
    title: 'Как добавить тег',
    keywords: ['добав', 'созда', 'нов'],
    intro: 'Чтобы добавить новый тег, нужно перейти в раздел «Теги» и заполнить форму создания. Нажмите «Показать демонстрацию» — я подсвечу каждый шаг прямо в программе.',
    steps: [
      { text: 'Откройте раздел «Теги» в левом меню.', target: '[data-tour="nav-/registry"]', route: '/registry', action: 'navigate' },
      { text: 'Введите код нового тега латиницей в поле «Код тега».', target: '[data-tour="tag-code-input"]', route: '/registry', action: 'input' },
      { text: 'Нажмите кнопку «Создать», чтобы сохранить тег в базу данных.', target: '[data-tour="tag-create-btn"]', route: '/registry', action: 'click' },
      { text: 'Готово! Тег добавлен и появится в реестре и на графе связей.', action: 'info' },
    ],
  },
  {
    id: 'create-project',
    title: 'Как создать проект',
    keywords: ['проект'],
    intro: 'Проекты создаются в разделе «Проекты». Запускаю демонстрацию.',
    steps: [
      { text: 'Откройте раздел «Проекты» в левом меню.', target: '[data-tour="nav-/projects"]', route: '/projects', action: 'navigate' },
      { text: 'Нажмите кнопку создания нового проекта.', target: '[data-tour="project-create-btn"]', route: '/projects', action: 'click' },
      { text: 'Заполните название проекта и сохраните. Готово!', action: 'info' },
    ],
  },
  {
    id: 'import-equipment',
    title: 'Как импортировать оборудование',
    keywords: ['импорт', 'оборудован', 'эксель', 'excel', 'xml', 'расчет', 'расчёт'],
    intro: 'Оборудование импортируется из файлов расчёта (XLSX/XML) через «Проводник». Показываю шаги.',
    steps: [
      { text: 'Откройте раздел «Проводник» в левом меню.', target: '[data-tour="nav-/explorer"]', route: '/explorer', action: 'navigate' },
      { text: 'Загрузите или выберите файл расчёта (XLSX/XML), нажмите на него правой кнопкой и выберите «Добавить в оборудование».', action: 'info' },
      { text: 'Импортированное оборудование появится в разделе «Оборудование».', target: '[data-tour="nav-/equipment"]', route: '/explorer', action: 'info' },
    ],
  },
  {
    id: 'open-chat',
    title: 'Как написать в рабочий чат',
    keywords: ['чат', 'сообщен', 'написат', 'коллег'],
    intro: 'Рабочий чат — для общения с коллегами. Покажу, как открыть.',
    steps: [
      { text: 'Откройте раздел «Рабочий чат» в левом меню.', target: '[data-tour="nav-/chat"]', route: '/chat', action: 'navigate' },
      { text: 'Выберите собеседника или группу проекта слева, введите сообщение внизу и нажмите отправить.', action: 'info' },
    ],
  },
  {
    id: 'create-note',
    title: 'Как создать заметку',
    keywords: ['заметк', 'блокнот', 'стикер'],
    intro: 'Заметки ведутся в «Блокноте». Демонстрирую.',
    steps: [
      { text: 'Откройте раздел «Блокнот» в левом меню.', target: '[data-tour="nav-/notes"]', route: '/notes', action: 'navigate' },
      { text: 'Нажмите «+», чтобы создать новую заметку, и введите заголовок и текст.', target: '[data-tour="note-create-btn"]', route: '/notes', action: 'click' },
      { text: 'Заметка сохраняется автоматически. Её можно открепить как стикер поверх окон.', action: 'info' },
    ],
  },
];

export function findTourByText(text: string): Tour | null {
  const t = text.toLowerCase();
  // Сначала ищем по названию сущности (тег/проект/...), затем уточняем глаголом
  let best: Tour | null = null;
  let bestScore = 0;
  for (const tour of TOURS) {
    let score = 0;
    for (const kw of tour.keywords) {
      if (t.includes(kw)) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      best = tour;
    }
  }
  return bestScore > 0 ? best : null;
}
