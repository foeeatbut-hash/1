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

/**
 * Границы непрозрачного содержимого — чтобы обрезать поля скана.
 *
 * Без этого подпись в документе выходит крошечной: лист А4 отсканирован
 * целиком, подпись занимает в нём пятую часть, а высота в миллиметрах
 * задаётся всей картинке вместе с пустыми полями.
 *
 * @param pad запас вокруг штриха в точках — совсем впритык обрезать нельзя,
 *            хвосты росчерка бледные и частично прозрачные
 */
export function inkBounds(
  data: Uint8ClampedArray, width: number, height: number, pad = 2,
): { x: number; y: number; w: number; h: number } | null {
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;                 // пусто: стёрли всё
  const x = Math.max(0, minX - pad);
  const y = Math.max(0, minY - pad);
  return {
    x, y,
    w: Math.min(width, maxX + pad + 1) - x,
    h: Math.min(height, maxY + pad + 1) - y,
  };
}

/**
 * Подобрать порог по самой картинке, чтобы не крутить ползунок вслепую.
 *
 * Скан подписи — это светлая бумага и тёмный штрих. Ищем, где кончается
 * бумага: берём самый частый светлый уровень (её и видно больше всего) и
 * отступаем вниз, чтобы серые хвосты росчерка остались.
 */
export function suggestThreshold(data: Uint8ClampedArray): number {
  const hist = new Array(256).fill(0);
  for (let i = 0; i < data.length; i += 4) {
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    hist[Math.round(lum)]++;
  }
  // Бумага — самый частый уровень в светлой половине
  let paper = 255, best = -1;
  for (let v = 128; v < 256; v++) if (hist[v] > best) { best = hist[v]; paper = v; }
  const cut = Math.max(24, paper - 42);      // отступ вниз от бумаги
  const t = Math.round((1 - cut / 255) * 100);
  return Math.max(5, Math.min(95, t));
}

/** Хватит ли того, что осталось, чтобы это была подпись, а не грязь */
export function looksEmpty(data: Uint8ClampedArray): boolean {
  return inkRatio(data) < 0.0015;
}
