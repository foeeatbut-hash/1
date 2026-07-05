// OCR страниц-сканов PDF. Только браузер/Electron (нужен canvas).
// Все ассеты (worker, wasm-ядро, языковые модели rus+eng) лежат в public/ocr —
// работает полностью офлайн, ничего не скачивается.
//
// Производительность: пул воркеров tesseract распознаёт страницы параллельно,
// пока главный поток рендерит следующие. PDF переиспользуется из общего кэша
// (тот же документ, что и при извлечении текста) — файл не парсится дважды.

import { DocBlock } from './types';
import { pageItemsToBlocks } from './extractors';
import { openPdf, releasePdf } from './pdfShared';

export interface OcrProgress {
  done: number;        // распознано страниц
  totalPages: number;
  status: string;      // «Распознавание 3 из 12…»
}

export interface OcrOptions {
  onProgress?: (p: OcrProgress) => void;
  signal?: AbortSignal;
  /** Сколько страниц распознавать одновременно (по умолчанию — по числу ядер, максимум 3) */
  concurrency?: number;
}

// ── Пул воркеров tesseract ───────────────────────────────────────────────────
// Воркеры тяжёлые (грузят языковые модели), поэтому создаём один раз и держим
// живыми между запусками. Размер пула ограничен, чтобы не раздувать память.

const MAX_POOL = 3;
let pool: any[] = [];
let poolInit: Promise<void> | null = null;

async function createOneWorker(): Promise<any> {
  const { createWorker } = await import('tesseract.js');
  const base = new URL('.', document.baseURI).href.replace(/\/$/, '');
  return createWorker(['rus', 'eng'], 1, {
    workerPath: `${base}/ocr/worker.min.js`,
    corePath: `${base}/ocr`,
    langPath: `${base}/ocr`,
    gzip: true,
    logger: () => {},
  });
}

async function ensurePool(n: number): Promise<any[]> {
  const target = Math.max(1, Math.min(n, MAX_POOL));
  // Сериализуем инициализацию, чтобы параллельные вызовы не создали лишних воркеров
  while (poolInit) { await poolInit; }
  if (pool.length < target) {
    let done!: () => void;
    poolInit = new Promise<void>(r => { done = r; });
    try {
      const need = target - pool.length;
      const created = await Promise.all(Array.from({ length: need }, () => createOneWorker()));
      pool.push(...created);
    } finally {
      done();
      poolInit = null;
    }
  }
  return pool.slice(0, target);
}

/** Типовые ошибки OCR в числах: О→0, З→3, l→1 (только внутри числовых токенов) */
function fixOcrNumbers(s: string): string {
  return s.replace(/(?<=\d)[ОOо](?=\d)|(?<=\d)[ОOо]\b|\b[ОOо](?=\d)/g, '0')
    .replace(/(?<=\d)[Зз](?=\d)/g, '3')
    .replace(/(?<=\d)[lI](?=\d)/g, '1');
}

// Рендер страницы PDF в canvas с ограничением по размеру (память ↓, скорость ↑).
async function renderPage(pdf: any, pageNum: number): Promise<HTMLCanvasElement> {
  const page = await pdf.getPage(pageNum);
  const base = page.getViewport({ scale: 1 });
  const CAP = 3000; // предел по каждой стороне, px
  let scale = Math.min(2.4, CAP / base.width, CAP / base.height);
  scale = Math.max(1.2, scale);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas;
}

function wordsToBlocks(res: any, canvasHeight: number, pageNum: number): DocBlock[] {
  const items = (res.words || [])
    .filter((w: any) => w.text && w.text.trim() && (w.confidence ?? 0) > 25)
    .map((w: any) => ({
      str: fixOcrNumbers(w.text),
      x: w.bbox.x0,
      // Tesseract считает Y сверху вниз, кластеризация ждёт снизу вверх — инвертируем
      y: canvasHeight - w.bbox.y0,
      w: w.bbox.x1 - w.bbox.x0,
    }));
  if (items.length < 3) return [];
  return pageItemsToBlocks(items, pageNum);
}

/**
 * Распознаёт страницы-сканы PDF параллельно. Возвращает блоки в промежуточной модели.
 * Рендер каждой страницы — на главном потоке (pdf.js), распознавание — в пуле воркеров.
 */
export async function ocrPdfPages(
  data: ArrayBuffer,
  pages: number[],
  opts: OcrOptions = {},
): Promise<{ blocks: DocBlock[]; failed: number[]; aborted: boolean }> {
  const { onProgress, signal } = opts;
  const cores = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4;
  const concurrency = Math.max(1, Math.min(opts.concurrency ?? cores - 1, MAX_POOL, pages.length));

  const pdf = await openPdf(data);
  const workers = await ensurePool(concurrency);

  const results: (DocBlock[] | null)[] = new Array(pages.length).fill(null);
  const failed: number[] = [];
  let nextIdx = 0;
  let completed = 0;
  let aborted = false;

  const runLoop = async (worker: any): Promise<void> => {
    while (true) {
      if (signal?.aborted) { aborted = true; return; }
      const i = nextIdx++;
      if (i >= pages.length) return;
      const pageNum = pages[i];
      let canvas: HTMLCanvasElement | null = null;
      try {
        canvas = await renderPage(pdf, pageNum);
        if (signal?.aborted) { aborted = true; return; }
        const { data: res } = await worker.recognize(canvas);
        results[i] = wordsToBlocks(res, canvas.height, pageNum);
        if (!results[i]!.length) failed.push(pageNum);
      } catch (err) {
        console.error(`OCR страницы ${pageNum} не удался:`, err);
        failed.push(pageNum);
      } finally {
        if (canvas) { canvas.width = 0; canvas.height = 0; } // освобождаем память
      }
      completed++;
      onProgress?.({ done: completed, totalPages: pages.length, status: `Распознавание ${completed} из ${pages.length}…` });
    }
  };

  onProgress?.({ done: 0, totalPages: pages.length, status: `Подготовка OCR (${concurrency} потока)…` });
  await Promise.all(workers.map(w => runLoop(w)));

  // Освобождаем PDF-документ (OCR — финальная стадия работы с этим файлом)
  await releasePdf(data);

  const blocks: DocBlock[] = [];
  for (const r of results) if (r) blocks.push(...r);
  return { blocks, failed, aborted };
}

/** Проверка доступности OCR-ассетов (сборка может быть без них) */
export async function ocrAvailable(): Promise<boolean> {
  try {
    const base = new URL('.', document.baseURI).href.replace(/\/$/, '');
    const r = await fetch(`${base}/ocr/worker.min.js`, { method: 'HEAD' });
    return r.ok;
  } catch {
    return false;
  }
}

/** Завершает воркеры OCR и освобождает память (например, при закрытии мастера импорта) */
export async function terminateOcrPool(): Promise<void> {
  const workers = pool;
  pool = [];
  await Promise.all(workers.map(w => { try { return w.terminate(); } catch { return undefined; } }));
}
