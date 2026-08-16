/**
 * Подпись сотрудника: убрать фон со скана.
 *
 * Скан подписи с листа — это тёмные штрихи на светлом поле. Чтобы вставить её
 * в документ, поле надо сделать прозрачным. Никакого распознавания: порог по
 * яркости с ползунком и предпросмотром. Инженер видит результат до сохранения
 * и сам решает, где остановиться — это надёжнее угадывания и объяснимо.
 *
 * Разбор пикселей вынесен отдельной чистой функцией: её закрывают проверки,
 * в отличие от работы с canvas в браузере.
 */

/**
 * Порог по умолчанию: убирает белую бумагу, оставляя штрих.
 *
 * Шкала прямая: 0 — не трогать ничего, 100 — убрать всё, кроме чёрного.
 * Первая попытка была обратной и с разрывом в нуле (0 «ничего», а 1 уже стирал
 * почти всё) — это поймала проверка, а не глаз.
 */
export const DEFAULT_THRESHOLD = 28;

/**
 * Сделать прозрачным всё светлее порога.
 *
 * @param data  пиксели RGBA (изменяются на месте)
 * @param threshold 0…100 — насколько сильно убирать фон
 *
 * Полупрозрачность у края штриха оставляем: резкая отсечка даёт «пилу» по
 * контуру, особенно на тонких линиях пера.
 */
export function cutBackground(data: Uint8ClampedArray, threshold: number): void {
  const t = Math.max(0, Math.min(100, threshold)) / 100;
  if (t <= 0) return;   // ноль — не трогать вообще, включая полосу перехода
  // Порог яркости: чем выше ползунок, тем ниже планка и тем больше уходит
  const cut = (1 - t) * 255;
  const soft = Math.max(1, cut * 0.25); // полоса плавного перехода
  for (let i = 0; i < data.length; i += 4) {
    // Яркость по восприятию: глаз видит зелёный сильнее синего
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    if (lum > cut) {
      data[i + 3] = 0;
    } else if (lum > cut - soft) {
      const k = (cut - lum) / soft;  // 0 у границы, 1 у тёмного
      data[i + 3] = Math.round(data[i + 3] * k);
    }
  }
}

/** Доля непрозрачных точек — по ней видно, не стёрли ли подпись целиком */
export function inkRatio(data: Uint8ClampedArray): number {
  let ink = 0;
  const n = data.length / 4;
  for (let i = 3; i < data.length; i += 4) if (data[i] > 8) ink++;
  return n ? ink / n : 0;
}

/** Размер после уменьшения до заданной высоты, с сохранением пропорций */
export function fitToHeight(w: number, h: number, maxHeight: number): { w: number; h: number } {
  if (h <= maxHeight || !h) return { w, h };
  const k = maxHeight / h;
  return { w: Math.max(1, Math.round(w * k)), h: maxHeight };
}

/** Что принимаем: только картинки, и не больше разумного размера файла */
export const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp'];
export const MAX_FILE_BYTES = 8 * 1024 * 1024;
/** До какой высоты уменьшаем перед сохранением: для печати хватает с запасом */
export const STORE_HEIGHT_PX = 300;

export function checkFile(file: { type?: string; size?: number }): string | null {
  if (!file?.type || !ACCEPTED.includes(file.type)) return 'Нужен PNG, JPG или WebP';
  if ((file.size || 0) > MAX_FILE_BYTES) return 'Файл больше 8 МБ — уменьшите картинку';
  return null;
}
