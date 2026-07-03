// OCR страниц-сканов PDF. Только браузер/Electron (нужен canvas).
// Все ассеты (worker, wasm-ядро, языковые модели rus+eng) лежат в public/ocr —
// работает полностью офлайн, ничего не скачивается.

import { DocBlock } from './types';
import { pageItemsToBlocks } from './extractors';

export interface OcrProgress {
  page: number;
  totalPages: number;
  status: string;   // «распознавание 43%»
}

let workerPromise: Promise<any> | null = null;

async function getWorker(): Promise<any> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = await import('tesseract.js');
      const base = new URL('.', document.baseURI).href.replace(/\/$/, '');
      const worker = await createWorker(['rus', 'eng'], 1, {
        workerPath: `${base}/ocr/worker.min.js`,
        corePath: `${base}/ocr`,
        langPath: `${base}/ocr`,
        gzip: true,
        // Логи не нужны в консоли пользователей
        logger: () => {},
      });
      return worker;
    })().catch(err => {
      workerPromise = null;
      throw err;
    });
  }
  return workerPromise;
}

/** Типовые ошибки OCR в числах: О→0, З→3, l→1 (только внутри числовых токенов) */
function fixOcrNumbers(s: string): string {
  return s.replace(/(?<=\d)[ОOо](?=\d)|(?<=\d)[ОOо]\b|\b[ОOо](?=\d)/g, '0')
    .replace(/(?<=\d)[Зз](?=\d)/g, '3')
    .replace(/(?<=\d)[lI](?=\d)/g, '1');
}

/**
 * Распознаёт страницы-сканы PDF. Возвращает блоки в промежуточной модели.
 * Рендер страницы делается через pdfjs на canvas с увеличением ×2.5.
 */
export async function ocrPdfPages(
  data: ArrayBuffer,
  pages: number[],
  onProgress?: (p: OcrProgress) => void,
): Promise<{ blocks: DocBlock[]; failed: number[] }> {
  const pdfjs: any = await import('pdfjs-dist');
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url' as any)).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const pdf = await pdfjs.getDocument({ data: new Uint8Array(data) }).promise;
  const worker = await getWorker();
  const blocks: DocBlock[] = [];
  const failed: number[] = [];

  for (let i = 0; i < pages.length; i++) {
    const pageNum = pages[i];
    onProgress?.({ page: pageNum, totalPages: pages.length, status: `Рендер страницы ${i + 1} из ${pages.length}…` });
    try {
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 2.5 });
      const canvas = document.createElement('canvas');
      canvas.width = Math.min(viewport.width, 4000);
      canvas.height = Math.min(viewport.height, 4000);
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      await page.render({ canvasContext: ctx, viewport }).promise;

      onProgress?.({ page: pageNum, totalPages: pages.length, status: `Распознавание страницы ${i + 1} из ${pages.length}…` });
      const { data: res } = await worker.recognize(canvas);

      // Слова с координатами → та же кластеризация строк/колонок, что у текстового PDF
      const items = (res.words || [])
        .filter((w: any) => w.text && w.text.trim() && (w.confidence ?? 0) > 25)
        .map((w: any) => ({
          str: fixOcrNumbers(w.text),
          x: w.bbox.x0,
          // Tesseract считает Y сверху вниз, кластеризация ждёт снизу вверх — инвертируем
          y: canvas.height - w.bbox.y0,
          w: w.bbox.x1 - w.bbox.x0,
        }));
      if (items.length < 3) { failed.push(pageNum); continue; }
      blocks.push(...pageItemsToBlocks(items, pageNum));
      canvas.width = 0; canvas.height = 0; // освобождаем память
    } catch (err) {
      console.error(`OCR страницы ${pageNum} не удался:`, err);
      failed.push(pageNum);
    }
  }
  return { blocks, failed };
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
