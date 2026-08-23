import React from 'react';
import { CANVASES, type Canvas } from './canvases';
import { STAGES, type StageId } from './stages';

/**
 * Полка картин в шапке помощника: что показываем и в какой обстановке.
 *
 * Поле — ровно 380×88, как было у робота: место не меняется, меняется то, что
 * в нём живёт.
 *
 * Устройство в два слоя. Холст (canvases.tsx) рисуется в своём отношении
 * сторон — «Мона Лиза» вертикальной, «Сотворение Адама» вытянутым. Обстановка
 * (stages.tsx) занимает остальное место лентой 4,3:1: стена галереи с
 * посетителями, мастерская с художником у мольберта, чертёжный стол.
 *
 * Почему так, а не картина во всю полосу. Ни одна работа не сложена под
 * отношение 4,3:1, и растянутая по ленте она перестаёт быть собой. А человек
 * рядом с рамой даёт масштаб и сразу говорит, что перед вами картина, — этого
 * не сделает никакая подпись.
 *
 * Почему рисуем кодом. Программа работает офлайн, в закрытом контуре:
 * репродукции скачивать неоткуда, а вкладывать в сборку — лишние мегабайты.
 * Нарисованное весит килобайты и разбирается на части: у файла звёзды не
 * замигают, а посетители не подойдут ближе.
 *
 * Право. Все авторы умерли более семидесяти лет назад, работы в общественном
 * достоянии. И это не репродукции, а собственные переложения: узнаваемый
 * мотив, а не копия холста.
 */

export interface Painting {
  id: string;
  title: string;
  artist: string;
  year: string;
  /** Тёмная ли обстановка — от этого зависит цвет подписи поверх неё */
  dark: boolean;
  canvas: keyof typeof CANVASES;
  stage: StageId;
}

/**
 * Порядок и обстановка выбраны намеренно.
 *
 * «Мона Лиза» — в галерее: её и правда смотрят толпой, и это часть того, чем
 * она стала. «Звёздная ночь» и «Подсолнухи» — в мастерской: обе написаны за
 * несколько дней, у мольберта. «Витрувианский человек» — на столе: это чертёж
 * из тетради, а не картина со стены. Обстановки чередуются, чтобы полка при
 * смене не показывала подряд две одинаковые комнаты.
 */
export const PAINTINGS: Painting[] = [
  { id: 'mona', title: 'Мона Лиза', artist: 'Леонардо да Винчи', year: '1503–1519', dark: false, canvas: 'mona', stage: 'gallery' },
  { id: 'starry', title: 'Звёздная ночь', artist: 'Винсент Ван Гог', year: '1889', dark: false, canvas: 'starry', stage: 'studio' },
  { id: 'wave', title: 'Большая волна в Канагаве', artist: 'Кацусика Хокусай', year: '1831', dark: false, canvas: 'wave', stage: 'gallery' },
  { id: 'vitruvian', title: 'Витрувианский человек', artist: 'Леонардо да Винчи', year: 'ок. 1490', dark: true, canvas: 'vitruvian', stage: 'desk' },
  { id: 'scream', title: 'Крик', artist: 'Эдвард Мунк', year: '1893', dark: false, canvas: 'scream', stage: 'gallery' },
  { id: 'sunflowers', title: 'Подсолнухи', artist: 'Винсент Ван Гог', year: '1888', dark: false, canvas: 'sunflowers', stage: 'studio' },
  { id: 'adam', title: 'Сотворение Адама', artist: 'Микеланджело', year: '1512', dark: false, canvas: 'adam', stage: 'gallery' },
  { id: 'ninth', title: 'Девятый вал', artist: 'Иван Айвазовский', year: '1850', dark: false, canvas: 'ninth', stage: 'studio' },
];

export const paintingAt = (i: number): Painting =>
  PAINTINGS[((i % PAINTINGS.length) + PAINTINGS.length) % PAINTINGS.length];

/** Сцена целиком: обстановка со вставленным в неё холстом. */
export function PaintingScene({ painting }: { painting: Painting }) {
  return <StagedScene stage={painting.stage} canvas={CANVASES[painting.canvas]} />;
}

/**
 * Обстановка с любым холстом — нарисованным или снимком.
 *
 * Обстановке всё равно, что вставлено в раму: она знает только отношение
 * сторон и функцию рисования. Благодаря этому зал галереи, мастерская и
 * чертёжный стол работают одинаково и с векторным рисунком, и с
 * репродукцией из файла.
 */
export function StagedScene({ stage, canvas }: { stage: StageId; canvas: Canvas }) {
  const Stage = STAGES[stage];
  return <Stage canvas={canvas} />;
}

/**
 * Нарисованный запас для работы: он есть не у всех.
 *
 * Список работ длиннее списка рисунков — остальные ждут своих файлов. Работа
 * без рисунка и без файла на полку просто не попадает.
 */
export function drawnById(workId: string): { canvas: Canvas; stage: StageId } | null {
  const p = PAINTINGS.find((x) => x.id === workId);
  if (!p) return null;
  return { canvas: CANVASES[p.canvas], stage: p.stage };
}
