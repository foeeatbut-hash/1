/**
 * Список работ, которые может показать полка.
 *
 * Здесь только сведения о картине — название, автор, год — и признак, тёмная
 * она или светлая. Ни рисования, ни файлов: и то и другое подключается
 * снаружи (см. photos.ts и paintings.tsx).
 *
 * Зачем список отдельно от изображений. Нарисованных картин восемь, а работ в
 * этом списке два десятка с лишним: остальные ждут своих файлов. Список — то,
 * что не меняется, когда файл появляется или пропадает; он же задаёт порядок
 * и подписи. Работа без изображения просто не попадает на полку и никак себя
 * не проявляет — ни пустой рамой, ни ошибкой.
 *
 * Порядок намеренно перемешан по настроению и стране: подряд идущие работы не
 * должны быть похожи. Полка перебирает список по кругу, и две тёмные морские
 * бури подряд читались бы как одна и та же картина.
 */

export interface Work {
  /** Он же имя файла в src/art/images: mona.jpg, kiss.webp — расширение любое */
  id: string;
  title: string;
  artist: string;
  year: string;
  /** Тёмная ли работа — от этого зависит цвет подписи, если она ляжет поверх */
  dark: boolean;
  /** В какой обстановке показывать: зал, мастерская или чертёжный стол */
  stage: 'gallery' | 'studio' | 'desk';
}

export const WORKS: Work[] = [
  { id: 'mona', title: 'Мона Лиза', artist: 'Леонардо да Винчи', year: '1503–1519', dark: false, stage: 'gallery' },
  { id: 'starry', title: 'Звёздная ночь', artist: 'Винсент Ван Гог', year: '1889', dark: true, stage: 'studio' },
  { id: 'wave', title: 'Большая волна в Канагаве', artist: 'Кацусика Хокусай', year: '1831', dark: false, stage: 'gallery' },
  { id: 'morning', title: 'Утро в сосновом лесу', artist: 'Иван Шишкин', year: '1889', dark: false, stage: 'gallery' },
  { id: 'vitruvian', title: 'Витрувианский человек', artist: 'Леонардо да Винчи', year: 'ок. 1490', dark: false, stage: 'desk' },
  { id: 'kiss', title: 'Поцелуй', artist: 'Густав Климт', year: '1908', dark: false, stage: 'gallery' },
  { id: 'scream', title: 'Крик', artist: 'Эдвард Мунк', year: '1893', dark: false, stage: 'gallery' },
  { id: 'redhorse', title: 'Купание красного коня', artist: 'Кузьма Петров-Водкин', year: '1912', dark: false, stage: 'studio' },
  { id: 'pearl', title: 'Девушка с жемчужной серёжкой', artist: 'Ян Вермеер', year: 'ок. 1665', dark: true, stage: 'gallery' },
  { id: 'sunflowers', title: 'Подсолнухи', artist: 'Винсент Ван Гог', year: '1888', dark: false, stage: 'studio' },
  { id: 'rooks', title: 'Грачи прилетели', artist: 'Алексей Саврасов', year: '1871', dark: false, stage: 'gallery' },
  { id: 'adam', title: 'Сотворение Адама', artist: 'Микеланджело', year: '1512', dark: false, stage: 'gallery' },
  { id: 'venus', title: 'Рождение Венеры', artist: 'Сандро Боттичелли', year: 'ок. 1485', dark: false, stage: 'gallery' },
  { id: 'bogatyrs', title: 'Богатыри', artist: 'Виктор Васнецов', year: '1898', dark: false, stage: 'gallery' },
  { id: 'impression', title: 'Впечатление. Восход солнца', artist: 'Клод Моне', year: '1872', dark: false, stage: 'studio' },
  { id: 'ninth', title: 'Девятый вал', artist: 'Иван Айвазовский', year: '1850', dark: false, stage: 'studio' },
  { id: 'stranger', title: 'Неизвестная', artist: 'Иван Крамской', year: '1883', dark: true, stage: 'gallery' },
  { id: 'supper', title: 'Тайная вечеря', artist: 'Леонардо да Винчи', year: '1498', dark: false, stage: 'gallery' },
  { id: 'alyonushka', title: 'Алёнушка', artist: 'Виктор Васнецов', year: '1881', dark: true, stage: 'gallery' },
  { id: 'gothic', title: 'Американская готика', artist: 'Грант Вуд', year: '1930', dark: false, stage: 'gallery' },
  { id: 'courtyard', title: 'Московский дворик', artist: 'Василий Поленов', year: '1878', dark: false, stage: 'studio' },
  { id: 'watch', title: 'Ночной дозор', artist: 'Рембрандт', year: '1642', dark: true, stage: 'gallery' },
  { id: 'barge', title: 'Бурлаки на Волге', artist: 'Илья Репин', year: '1873', dark: false, stage: 'gallery' },
  { id: 'school', title: 'Афинская школа', artist: 'Рафаэль', year: '1511', dark: false, stage: 'gallery' },
];

export const workById = (id: string): Work | undefined => WORKS.find((w) => w.id === id);
