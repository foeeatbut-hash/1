// OCR страниц-сканов PDF и изображений. Только браузер/Electron (нужен canvas).
// Ассеты (worker, wasm-ядро, модели rus+eng) лежат в public/ocr — работает офлайн.
//
// Возможности:
//  • пул воркеров tesseract: страницы распознаются параллельно, пока главный
//    поток рендерит следующие; PDF переиспользуется из общего кэша (не парсится дважды);
//  • адаптация под память/ядра (deviceMemory, hardwareConcurrency);
//  • гейт качества: слабую страницу авто-ретраим в бóльшем масштабе;
//  • авто-разворот: при плохом первом проходе перебираем ориентации 90/180/270°
//    (без osd.traineddata — на даунскейл-копиях, дёшево);
//  • опция «Улучшить скан»: grayscale → контраст → бинаризация (Otsu) → deskew;
//  • отмена (AbortSignal), прогресс, приём изображений (JPG/PNG/…).

import { DocBlock } from './types';
import { pageItemsToBlocks } from './extractors';
import { openPdf, releasePdf } from './pdfShared';

export interface OcrProgress {
  done: number;
  totalPages: number;
  status: string;
}

export interface OcrOptions {
  onProgress?: (p: OcrProgress) => void;
  signal?: AbortSignal;
  /** Сколько страниц одновременно (по умолчанию — по числу ядер/памяти) */
  concurrency?: number;
  /** Порог средней уверенности слова для ретрая/разворота (0..100, по умолчанию 55) */
  minConfidence?: number;
  /** Пиксельная предобработка (grayscale/контраст/бинаризация/deskew). По умолчанию выкл. */
  enhance?: boolean;
}

export interface OcrPageStat { page: number; confidence: number; words: number; retried?: boolean; rotated?: number; }

export interface OcrResult {
  blocks: DocBlock[];
  failed: number[];
  aborted: boolean;
  pageStats: OcrPageStat[];
  meanConfidence: number;
}

// ── Адаптация под ресурсы ────────────────────────────────────────────────────

const MAX_POOL = 4;

function deviceMemoryGb(): number {
  return (typeof navigator !== 'undefined' && (navigator as any).deviceMemory) || 4;
}

function adaptiveConcurrency(requested: number | undefined, pages: number): number {
  const cores = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4;
  const mem = deviceMemoryGb();
  const memCap = mem <= 2 ? 1 : mem <= 4 ? 2 : MAX_POOL;
  return Math.max(1, Math.min(requested ?? cores - 1, memCap, MAX_POOL, pages));
}

// Предел размера canvas по каждой стороне — от объёма памяти
function renderCap(): number {
  const mem = deviceMemoryGb();
  return mem <= 2 ? 2200 : mem <= 4 ? 2600 : 3000;
}

// ── Пул воркеров tesseract ───────────────────────────────────────────────────

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

// ── Пиксельная обработка ─────────────────────────────────────────────────────

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

/** Даунскейл-копия (для быстрых проб ориентации) */
function downscale(src: HTMLCanvasElement, targetW: number): HTMLCanvasElement {
  const scale = Math.min(1, targetW / src.width);
  const c = makeCanvas(Math.max(1, Math.round(src.width * scale)), Math.max(1, Math.round(src.height * scale)));
  const ctx = c.getContext('2d')!;
  ctx.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

/** Поворот на 0/90/180/270°. Возвращает новый canvas. */
function rotateCanvas(src: HTMLCanvasElement, deg: number): HTMLCanvasElement {
  const d = ((deg % 360) + 360) % 360;
  if (d === 0) return src;
  const swap = d === 90 || d === 270;
  const c = makeCanvas(swap ? src.height : src.width, swap ? src.width : src.height);
  const ctx = c.getContext('2d')!;
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate((d * Math.PI) / 180);
  ctx.drawImage(src, -src.width / 2, -src.height / 2);
  return c;
}

/** Grayscale + растяжение контраста по перцентилям + бинаризация Otsu (in place) */
function enhanceGrayscaleBinarize(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = img.data;
  const n = canvas.width * canvas.height;
  const gray = new Uint8Array(n);
  const hist = new Uint32Array(256);
  for (let i = 0, j = 0; i < px.length; i += 4, j++) {
    // Luma (Rec.601)
    const g = (px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114) | 0;
    gray[j] = g; hist[g]++;
  }
  // Перцентильное растяжение контраста (2% / 98%)
  let lo = 0, hi = 255, acc = 0;
  const loCut = n * 0.02, hiCut = n * 0.98;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= loCut) { lo = v; break; } }
  acc = 0;
  for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc >= n - hiCut) { hi = v; break; } }
  const range = Math.max(1, hi - lo);
  const stretched = new Uint8Array(n);
  const sHist = new Uint32Array(256);
  for (let j = 0; j < n; j++) {
    let v = ((gray[j] - lo) * 255 / range) | 0;
    v = v < 0 ? 0 : v > 255 ? 255 : v;
    stretched[j] = v; sHist[v]++;
  }
  // Порог Otsu
  const thr = otsu(sHist, n);
  for (let i = 0, j = 0; i < px.length; i += 4, j++) {
    const v = stretched[j] >= thr ? 255 : 0;
    px[i] = px[i + 1] = px[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
  return { gray: stretched, thr };
}

function otsu(hist: Uint32Array, total: number): number {
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];
  let sumB = 0, wB = 0, maxVar = -1, threshold = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > maxVar) { maxVar = between; threshold = t; }
  }
  return threshold;
}

/** Оценка мелкого перекоса по дисперсии горизонтальной проекции бинарного изображения */
function estimateSkew(canvas: HTMLCanvasElement): number {
  // Работаем на даунскейле для скорости
  const small = downscale(canvas, 700);
  const ctx = small.getContext('2d', { willReadFrequently: true })!;
  const { data } = ctx.getImageData(0, 0, small.width, small.height);
  const w = small.width, h = small.height;
  const dark = new Uint8Array(w * h);
  for (let i = 0, j = 0; i < data.length; i += 4, j++) dark[j] = data[i] < 128 ? 1 : 0;
  let bestAngle = 0, bestScore = -1;
  for (let a = -4; a <= 4; a += 0.5) {
    const rad = (a * Math.PI) / 180;
    const shear = Math.tan(rad);
    const rows = new Float64Array(h);
    for (let y = 0; y < h; y++) {
      let cnt = 0;
      for (let x = 0; x < w; x++) {
        const yy = (y + shear * (x - w / 2)) | 0;
        if (yy >= 0 && yy < h) cnt += dark[yy * w + x];
      }
      rows[y] = cnt;
    }
    // Дисперсия профиля: максимальна, когда строки текста выровнены горизонтально
    let mean = 0; for (let y = 0; y < h; y++) mean += rows[y]; mean /= h;
    let varc = 0; for (let y = 0; y < h; y++) { const d = rows[y] - mean; varc += d * d; }
    if (varc > bestScore) { bestScore = varc; bestAngle = a; }
  }
  return bestAngle;
}

function applyEnhance(canvas: HTMLCanvasElement): number {
  enhanceGrayscaleBinarize(canvas);
  const angle = estimateSkew(canvas);
  if (Math.abs(angle) >= 0.5) {
    const rad = (-angle * Math.PI) / 180;
    const rotated = makeCanvas(canvas.width, canvas.height);
    const rctx = rotated.getContext('2d')!;
    rctx.fillStyle = '#fff';
    rctx.fillRect(0, 0, rotated.width, rotated.height);
    rctx.translate(rotated.width / 2, rotated.height / 2);
    rctx.rotate(rad);
    rctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(rotated, 0, 0);
    rotated.width = 0; rotated.height = 0;
  }
  return angle;
}

// ── Числовые поправки OCR ────────────────────────────────────────────────────

function fixOcrNumbers(s: string): string {
  return s.replace(/(?<=\d)[ОOо](?=\d)|(?<=\d)[ОOо]\b|\b[ОOо](?=\d)/g, '0')
    .replace(/(?<=\d)[Зз](?=\d)/g, '3')
    .replace(/(?<=\d)[lI](?=\d)/g, '1');
}

// ── Рендер и распознавание ───────────────────────────────────────────────────

async function renderPage(pdf: any, pageNum: number, cap: number): Promise<HTMLCanvasElement> {
  const page = await pdf.getPage(pageNum);
  const base = page.getViewport({ scale: 1 });
  let scale = Math.min(2.6, cap / base.width, cap / base.height);
  scale = Math.max(1.2, scale);
  const viewport = page.getViewport({ scale });
  const canvas = makeCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas;
}

interface Recog { words: any[]; meanConf: number; wordCount: number; }

async function recognizeCanvas(worker: any, canvas: HTMLCanvasElement): Promise<Recog> {
  const { data: res } = await worker.recognize(canvas);
  const words = (res.words || []).filter((w: any) => w.text && w.text.trim());
  const meanConf = words.length ? words.reduce((a: number, w: any) => a + (w.confidence || 0), 0) / words.length : 0;
  return { words, meanConf, wordCount: words.length };
}

function wordsToBlocks(words: any[], canvasHeight: number, pageNum: number): DocBlock[] {
  const items = words
    .filter((w: any) => (w.confidence ?? 0) > 25)
    .map((w: any) => ({
      str: fixOcrNumbers(w.text),
      x: w.bbox.x0,
      y: canvasHeight - w.bbox.y0, // Tesseract: Y сверху вниз → инвертируем
      w: w.bbox.x1 - w.bbox.x0,
    }));
  if (items.length < 3) return [];
  return pageItemsToBlocks(items, pageNum);
}

const scoreOf = (r: Recog) => r.meanConf * Math.sqrt(r.wordCount + 1);

/**
 * Распознаёт один canvas с гейтом качества:
 *  1) (опц.) улучшение изображения;
 *  2) первый проход @0°;
 *  3) если результат слабый — пробуем ориентации 90/180/270° на даунскейле,
 *     и если нашли лучше — распознаём полноразмер в этой ориентации.
 * Возвращает блоки и статистику. Масштаб-ретрай делает вызывающий (нужен ре-рендер).
 */
async function ocrCanvas(
  worker: any,
  canvas: HTMLCanvasElement,
  pageNum: number,
  opts: OcrOptions,
): Promise<{ blocks: DocBlock[]; stat: OcrPageStat }> {
  const minConf = opts.minConfidence ?? 55;
  let rotated = 0;
  if (opts.enhance) applyEnhance(canvas);

  let best = await recognizeCanvas(worker, canvas);
  let bestCanvas = canvas;

  const poor = best.meanConf < minConf || best.wordCount < 5;
  if (poor) {
    // Быстрые пробы ориентации на даунскейле
    const probe = downscale(canvas, 620);
    let bestDeg = 0, bestProbe = scoreOf(await recognizeCanvas(worker, probe));
    for (const deg of [90, 180, 270]) {
      if (opts.signal?.aborted) break;
      const rc = rotateCanvas(probe, deg);
      const s = scoreOf(await recognizeCanvas(worker, rc));
      rc.width = 0; rc.height = 0;
      if (s > bestProbe * 1.15) { bestProbe = s; bestDeg = deg; }
    }
    probe.width = 0; probe.height = 0;
    if (bestDeg !== 0 && !opts.signal?.aborted) {
      const full = rotateCanvas(canvas, bestDeg);
      const r2 = await recognizeCanvas(worker, full);
      if (scoreOf(r2) > scoreOf(best)) { best = r2; bestCanvas = full; rotated = bestDeg; }
      else { full.width = 0; full.height = 0; }
    }
  }

  const blocks = wordsToBlocks(best.words, bestCanvas.height, pageNum);
  const stat: OcrPageStat = { page: pageNum, confidence: Math.round(best.meanConf), words: best.wordCount, rotated: rotated || undefined };
  if (bestCanvas !== canvas) { bestCanvas.width = 0; bestCanvas.height = 0; }
  return { blocks, stat };
}

// ── Публичное API: OCR страниц PDF ───────────────────────────────────────────

export async function ocrPdfPages(
  data: ArrayBuffer,
  pages: number[],
  opts: OcrOptions = {},
): Promise<OcrResult> {
  const { onProgress, signal } = opts;
  const concurrency = adaptiveConcurrency(opts.concurrency, pages.length);
  const cap = renderCap();
  const minConf = opts.minConfidence ?? 55;

  const pdf = await openPdf(data);
  const workers = await ensurePool(concurrency);

  const results: (DocBlock[] | null)[] = new Array(pages.length).fill(null);
  const stats: OcrPageStat[] = [];
  const failed: number[] = [];
  let nextIdx = 0, completed = 0, aborted = false;

  const runLoop = async (worker: any): Promise<void> => {
    while (true) {
      if (signal?.aborted) { aborted = true; return; }
      const i = nextIdx++;
      if (i >= pages.length) return;
      const pageNum = pages[i];
      let canvas: HTMLCanvasElement | null = null;
      try {
        canvas = await renderPage(pdf, pageNum, cap);
        if (signal?.aborted) { aborted = true; return; }
        let { blocks, stat } = await ocrCanvas(worker, canvas, pageNum, opts);
        // Гейт качества: слабую страницу перерисуем крупнее и попробуем ещё раз
        if ((stat.confidence < minConf || stat.words < 5) && !signal?.aborted) {
          canvas.width = 0; canvas.height = 0;
          canvas = await renderPage(pdf, pageNum, Math.min(3600, Math.round(cap * 1.35)));
          const retry = await ocrCanvas(worker, canvas, pageNum, opts);
          if (scoreOf({ words: [], meanConf: retry.stat.confidence, wordCount: retry.stat.words }) >
              scoreOf({ words: [], meanConf: stat.confidence, wordCount: stat.words })) {
            blocks = retry.blocks; stat = { ...retry.stat, retried: true };
          }
        }
        results[i] = blocks;
        stats.push(stat);
        if (!blocks.length) failed.push(pageNum);
      } catch (err) {
        console.error(`OCR страницы ${pageNum} не удался:`, err);
        failed.push(pageNum);
      } finally {
        if (canvas) { canvas.width = 0; canvas.height = 0; }
      }
      completed++;
      onProgress?.({ done: completed, totalPages: pages.length, status: `Распознавание ${completed} из ${pages.length}…` });
    }
  };

  onProgress?.({ done: 0, totalPages: pages.length, status: `Подготовка OCR (${concurrency} поток.)…` });
  await Promise.all(workers.map(w => runLoop(w)));
  await releasePdf(data);

  const blocks: DocBlock[] = [];
  for (const r of results) if (r) blocks.push(...r);
  const meanConfidence = stats.length ? Math.round(stats.reduce((a, s) => a + s.confidence, 0) / stats.length) : 0;
  return { blocks, failed, aborted, pageStats: stats, meanConfidence };
}

// ── Публичное API: OCR изображения (JPG/PNG/…) ───────────────────────────────

export async function ocrImage(data: ArrayBuffer, opts: OcrOptions = {}): Promise<OcrResult> {
  const { onProgress, signal } = opts;
  const [worker] = await ensurePool(1);
  onProgress?.({ done: 0, totalPages: 1, status: 'Распознавание изображения…' });

  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(new Blob([data]));
  } catch (err) {
    console.error('Не удалось декодировать изображение:', err);
    return { blocks: [], failed: [1], aborted: false, pageStats: [], meanConfidence: 0 };
  }
  const cap = renderCap();
  const scale = Math.min(1, cap / bitmap.width, cap / bitmap.height);
  const canvas = makeCanvas(Math.max(1, Math.round(bitmap.width * scale)), Math.max(1, Math.round(bitmap.height * scale)));
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  if (signal?.aborted) return { blocks: [], failed: [], aborted: true, pageStats: [], meanConfidence: 0 };

  const { blocks, stat } = await ocrCanvas(worker, canvas, 1, opts);
  canvas.width = 0; canvas.height = 0;
  onProgress?.({ done: 1, totalPages: 1, status: 'Готово' });
  return {
    blocks, failed: blocks.length ? [] : [1], aborted: false,
    pageStats: [stat], meanConfidence: stat.confidence,
  };
}

// ── Служебное ────────────────────────────────────────────────────────────────

export async function ocrAvailable(): Promise<boolean> {
  try {
    const base = new URL('.', document.baseURI).href.replace(/\/$/, '');
    const r = await fetch(`${base}/ocr/worker.min.js`, { method: 'HEAD' });
    return r.ok;
  } catch {
    return false;
  }
}

export async function terminateOcrPool(): Promise<void> {
  const workers = pool;
  pool = [];
  await Promise.all(workers.map(w => { try { return w.terminate(); } catch { return undefined; } }));
}
