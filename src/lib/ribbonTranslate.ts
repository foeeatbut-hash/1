/**
 * Состав ленты Переводчика.
 *
 * Вкладки идут по тому, чем человек занят: перевести текст, поправить словарь,
 * взять пары из данных проекта, настроить показ. «Данные проекта» здесь не
 * формальность ради общего правила — именно там живёт то, ради чего словарь
 * непуст с первого дня: русские и английские названия из строк ВДР и типов
 * документов стандарта.
 *
 * Направление стоит первым и слева: пока не ясно, откуда и куда, всё остальное
 * бессмысленно.
 */
import type { RibbonTab } from './ribbon';

export const FROM_OPTIONS = [
  { value: 'auto', label: 'Определить' },
  { value: 'ru', label: 'Русский' },
  { value: 'en', label: 'Английский' },
  { value: 'zh', label: 'Китайский' },
];

/** Отдавать программа умеет только на русском и английском — см. types.canWrite */
export const TO_OPTIONS = [
  { value: 'ru', label: 'Русский' },
  { value: 'en', label: 'Английский' },
];

export interface TranslateRibbonCaps {
  /**
   * Подключён локальный движок владельца. Кнопка меняет подпись, а не
   * прячется: «движка нет» — это состояние, о котором надо знать, а не пустое
   * место в ленте.
   */
  model: boolean;
}

export function translateRibbon(caps: TranslateRibbonCaps): RibbonTab[] {
  return [
    {
      name: 'Главная',
      groups: [
        {
          name: 'направление',
          weight: 100,
          organs: [
            { id: 'tr.from', kind: 'select', label: 'С языка', hint: 'Язык исходного текста', options: FROM_OPTIONS, width: 130 },
            { id: 'tr.swap', kind: 'icon', icon: 'swap', hint: 'Поменять языки местами', keys: 'Ctrl+Shift+S' },
            { id: 'tr.to', kind: 'select', label: 'На язык', hint: 'Язык перевода', options: TO_OPTIONS, width: 130 },
          ],
        },
        {
          name: 'перевод',
          weight: 90,
          organs: [
            { id: 'tr.run', kind: 'big', label: 'Перевести', icon: 'languages', flux: true, keys: 'Ctrl+Enter', hint: 'Перевести текст по памяти, словарю и узорам писем' },
            { id: 'tr.copy', kind: 'label', label: 'Копировать', icon: 'copy', hint: 'Перевод в буфер обмена' },
            { id: 'tr.clear', kind: 'label', label: 'Очистить', icon: 'eraser', hint: 'Убрать текст и перевод' },
          ],
        },
        {
          name: 'память',
          weight: 70,
          organs: [
            { id: 'tr.remember', kind: 'label', label: 'Запомнить', icon: 'save', flux: true, hint: 'Положить подтверждённые строки в память переводов' },
            { id: 'tr.confirmAll', kind: 'icon', icon: 'accept', hint: 'Подтвердить все строки разом' },
          ],
        },
        {
          name: 'буфер',
          weight: 30,
          organs: [
            { id: 'tr.paste', kind: 'icon', icon: 'paste', hint: 'Вставить текст из буфера обмена', keys: 'Ctrl+V' },
          ],
        },
      ],
    },
    {
      name: 'Словарь',
      groups: [
        {
          name: 'глоссарий',
          weight: 100,
          organs: [
            { id: 'tr.terms', kind: 'big', label: 'Термины', icon: 'terms', flux: true, hint: 'Словарь проекта: как называем узлы и документы' },
            { id: 'tr.termAdd', kind: 'label', label: 'Добавить', icon: 'plus', hint: 'Новая пара терминов' },
          ],
        },
        {
          name: 'память переводов',
          weight: 80,
          organs: [
            { id: 'tr.memory', kind: 'big', label: 'Память', icon: 'data', flux: true, hint: 'Всё, что уже переводили: сегмент и его перевод' },
            { id: 'tr.tmxOut', kind: 'label', label: 'Выгрузить', icon: 'extract', hint: 'Сохранить память файлом TMX — его понимают все переводческие программы' },
            { id: 'tr.tmxIn', kind: 'label', label: 'Загрузить', icon: 'folder', hint: 'Взять память из файла TMX или из двух колонок' },
          ],
        },
      ],
    },
    {
      name: 'Данные проекта',
      groups: [
        {
          name: 'засев словаря',
          weight: 100,
          organs: [
            { id: 'tr.seed', kind: 'big', label: 'Собрать словарь', icon: 'data', flux: true, hint: 'Взять пары названий из строк ВДР и типов документов стандарта' },
            { id: 'tr.vdrFill', kind: 'label', label: 'Названия ВДР', icon: 'doc', flux: true, hint: 'Заполнить пустые английские названия в реестре документации' },
          ],
        },
      ],
    },
    {
      name: 'Вид',
      groups: [
        {
          name: 'показ',
          weight: 60,
          organs: [
            { id: 'tr.side', kind: 'icon', icon: 'twopage', toggle: true, hint: 'Исходник и перевод рядом, а не друг под другом' },
            { id: 'tr.origin', kind: 'icon', icon: 'info', toggle: true, hint: 'Показывать, откуда взялся перевод каждой строки' },
          ],
        },
        {
          name: 'движок',
          weight: 20,
          organs: [
            {
              id: 'tr.model', kind: 'label', label: caps.model ? 'Движок подключён' : 'Движок',
              icon: 'link',
              hint: caps.model
                ? 'Локальный движок владельца отвечает там, где своего перевода не хватило'
                : 'Подключить свой движок перевода — настройки, раздел «Переводчик»',
            },
          ],
        },
      ],
    },
  ];
}
