/**
 * Состав ленты Блокнота (заметки и стикеры).
 *
 * Блокнот переезжает на ленту первым: он самый простой и там нет чужого
 * движка — на нём рама и обкатывается. Здесь только описание; выполняет
 * команды сам редактор (components/RichTextEditor).
 *
 * Кнопка появляется вместе с тем, что она делает. Поэтому вкладки собираются
 * от возможностей: нет тегов проекта — нет и кнопки «Тег», а не серая заглушка.
 */
import type { RibbonTab } from './ribbon';

/** Цвета текста и заливки: короткий набор, одинаковый в светлой и тёмной теме */
export const NOTE_TEXT_COLORS = ['#0f172a', '#be123c', '#b45309', '#047857', '#0369a1'];
export const NOTE_MARK_COLORS = ['#fef08a', '#bbf7d0', '#bfdbfe', '#fbcfe8', 'transparent'];

/** Кегли Блокнота: execCommand умеет ровно семь ступеней, берём четыре нужных */
export const NOTE_SIZES = [
  { value: '1', label: 'Мелкий' },
  { value: '3', label: 'Обычный' },
  { value: '5', label: 'Крупный' },
  { value: '7', label: 'Очень крупный' },
];

export const NOTE_BLOCKS = [
  { value: 'p', label: 'Обычный текст' },
  { value: 'h1', label: 'Заголовок 1' },
  { value: 'h2', label: 'Заголовок 2' },
  { value: 'h3', label: 'Заголовок 3' },
  { value: 'blockquote', label: 'Цитата' },
];

export const NOTE_FONTS = [
  { value: 'Arial', label: 'Arial' },
  { value: 'Calibri', label: 'Calibri' },
  { value: 'Times New Roman', label: 'Times New Roman' },
  { value: 'Georgia', label: 'Georgia' },
  { value: 'Courier New', label: 'Courier New' },
  { value: 'Verdana', label: 'Verdana' },
];

export interface NotesRibbonCaps {
  /** Переданы теги проекта — значит, есть что вставлять ссылкой */
  tags: boolean;
  /** Известен проект — значит, поля проекта можно спросить у сервера */
  project: boolean;
}

export function notesRibbon(caps: NotesRibbonCaps): RibbonTab[] {
  const tabs: RibbonTab[] = [
    {
      name: 'Главная',
      groups: [
        {
          name: 'отмена',
          weight: 30,
          organs: [
            { id: 'notes.undo', kind: 'icon', icon: 'undo', hint: 'Отменить', keys: 'Ctrl+Z' },
            { id: 'notes.redo', kind: 'icon', icon: 'redo', hint: 'Вернуть', keys: 'Ctrl+Y' },
          ],
        },
        {
          name: 'шрифт',
          weight: 100,
          organs: [
            { id: 'notes.block', kind: 'select', label: 'Обычный текст', hint: 'Стиль абзаца', options: NOTE_BLOCKS, width: 120 },
            { id: 'notes.font', kind: 'select', label: 'Arial', hint: 'Шрифт', options: NOTE_FONTS, width: 96 },
            { id: 'notes.size', kind: 'spin', label: 'Обычный', hint: 'Размер текста' },
            { id: 'notes.bold', kind: 'icon', icon: 'bold', hint: 'Полужирный', keys: 'Ctrl+B', toggle: true },
            { id: 'notes.italic', kind: 'icon', icon: 'italic', hint: 'Курсив', keys: 'Ctrl+I', toggle: true },
            { id: 'notes.underline', kind: 'icon', icon: 'underline', hint: 'Подчёркнутый', keys: 'Ctrl+U', toggle: true },
            { id: 'notes.strike', kind: 'icon', icon: 'strike', hint: 'Зачёркнутый', toggle: true },
          ],
        },
        {
          name: 'цвет',
          weight: 60,
          organs: [
            { id: 'notes.color', kind: 'split', icon: 'color', hint: 'Цвет текста', colors: NOTE_TEXT_COLORS },
            { id: 'notes.mark', kind: 'split', icon: 'highlight', hint: 'Заливка (маркер)', colors: NOTE_MARK_COLORS },
            { id: 'notes.clear', kind: 'icon', icon: 'eraser', hint: 'Очистить оформление' },
          ],
        },
        {
          name: 'абзац',
          weight: 80,
          organs: [
            { id: 'notes.left', kind: 'icon', icon: 'align-left', hint: 'По левому краю' },
            { id: 'notes.center', kind: 'icon', icon: 'align-center', hint: 'По центру' },
            { id: 'notes.right', kind: 'icon', icon: 'align-right', hint: 'По правому краю' },
            { id: 'notes.justify', kind: 'icon', icon: 'align-justify', hint: 'По ширине' },
            { id: 'notes.indent', kind: 'icon', icon: 'indent', hint: 'Увеличить отступ' },
            { id: 'notes.outdent', kind: 'icon', icon: 'outdent', hint: 'Уменьшить отступ' },
          ],
        },
        {
          name: 'списки',
          weight: 70,
          organs: [
            { id: 'notes.bullets', kind: 'icon', icon: 'bullets', hint: 'Маркированный список', toggle: true },
            { id: 'notes.numbers', kind: 'icon', icon: 'numbers', hint: 'Нумерованный список', toggle: true },
            { id: 'notes.checklist', kind: 'label', label: 'Галочки', icon: 'checklist', hint: 'Клик по галочке отмечает пункт, Enter продолжает список' },
          ],
        },
        {
          name: 'правка',
          weight: 50,
          organs: [
            { id: 'notes.find', kind: 'label', label: 'Найти', icon: 'find', hint: 'Поиск по заметке', keys: 'Ctrl+F', toggle: true },
          ],
        },
      ],
    },
    {
      name: 'Вставка',
      groups: [
        {
          name: 'объекты',
          weight: 100,
          organs: [
            { id: 'notes.table', kind: 'big', label: 'Таблица', icon: 'table', hint: 'Операции со строками и столбцами — правой кнопкой по ячейке' },
            { id: 'notes.image', kind: 'big', label: 'Картинка', icon: 'image', hint: 'Файлом или Ctrl+V со снимком экрана' },
            { id: 'notes.link', kind: 'label', label: 'Ссылка', icon: 'link', hint: 'Клик по ссылке в тексте — открыть или изменить' },
            { id: 'notes.rule', kind: 'icon', icon: 'rule', hint: 'Горизонтальная черта' },
          ],
        },
        {
          name: 'отметки',
          weight: 60,
          organs: [
            { id: 'notes.datetime', kind: 'label', label: 'Дата и время', icon: 'date', hint: 'Вставить текущие дату и время' },
            { id: 'notes.todo', kind: 'label', label: 'Пункт дел', icon: 'checklist', hint: 'Список с галочками' },
          ],
        },
      ],
    },
  ];

  const projectOrgans = [];
  if (caps.tags) {
    projectOrgans.push({
      id: 'notes.tag', kind: 'label' as const, label: 'Тег', icon: 'tag', flux: true,
      hint: 'Ссылка на тег проекта: клик по ней в тексте открывает тег',
    });
  }
  if (caps.project) {
    projectOrgans.push({
      id: 'notes.projectField', kind: 'label' as const, label: 'Поле проекта', icon: 'data', flux: true,
      hint: 'Код, заказчик, объект — берётся из карточки проекта',
    });
  }
  if (projectOrgans.length) {
    tabs.push({
      name: 'Данные проекта',
      groups: [
        { name: 'вставить', weight: 100, organs: projectOrgans },
        {
          name: 'сейчас',
          weight: 60,
          organs: [
            { id: 'notes.today', kind: 'label', label: 'Сегодня', icon: 'date', flux: true, hint: 'Сегодняшняя дата' },
            { id: 'notes.author', kind: 'label', label: 'Автор', icon: 'info', flux: true, hint: 'Ваше имя из учётной записи' },
          ],
        },
      ],
    });
  }

  tabs.push({
    name: 'Вид',
    groups: [
      {
        name: 'масштаб',
        weight: 100,
        organs: [
          { id: 'notes.zoom', kind: 'spin', label: '100 %', hint: 'Размер текста на экране; в самой заметке ничего не меняется' },
          { id: 'notes.zoomReset', kind: 'label', label: 'Сбросить', icon: 'zoom', hint: 'Вернуть 100 %' },
        ],
      },
      {
        name: 'окно',
        weight: 50,
        organs: [
          { id: 'notes.full', kind: 'label', label: 'Во весь экран', icon: 'fullscreen', hint: 'Заметка на весь экран; Esc — обратно', toggle: true },
        ],
      },
    ],
  });

  return tabs;
}
