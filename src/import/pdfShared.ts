// Общий доступ к pdf.js: единая настройка воркера и КЭШ открытого документа,
// чтобы извлечение текста и последующий OCR не парсили один и тот же файл дважды.
// Работает в браузере (воркер) и в Node (legacy-сборка для тестов).

/**
 * pdf.js 6 зовёт Map.prototype.getOrInsertComputed — метод из предложения,
 * которого нет ни в одном выпущенном браузере (и в Chromium нашей сборки тоже
 * нет). Без него страница просто не рисуется: ошибка вылетает внутри воркера,
 * канва остаётся прозрачной, и снаружи это выглядит как «чертёж не
 * открывается». Дописываем метод сами — он определён однозначно: есть ключ —
 * вернуть значение, нет — посчитать, положить, вернуть.
 */
function ensureMapGetOrInsert(): void {
  for (const Ctor of [Map, WeakMap] as any[]) {
    const proto = Ctor?.prototype;
    if (!proto || typeof proto.getOrInsertComputed === 'function') continue;
    proto.getOrInsertComputed = function (key: any, callback: (k: any) => any) {
      if (this.has(key)) return this.get(key);
      const value = callback(key);
      this.set(key, value);
      return value;
    };
    proto.getOrInsert = function (key: any, value: any) {
      if (this.has(key)) return this.get(key);
      this.set(key, value);
      return value;
    };
  }
}

let pdfjsPromise: Promise<any> | null = null;

export async function loadPdfJs(): Promise<any> {
  if (pdfjsPromise) return pdfjsPromise;
  ensureMapGetOrInsert();
  pdfjsPromise = (async () => {
    if (typeof window !== 'undefined') {
      const pdfjs: any = await import('pdfjs-dist');
      const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url' as any)).default;
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
      return pdfjs;
    }
    // Node (тесты): legacy-сборка без воркера
    return await import(/* @vite-ignore */ 'pdfjs-dist/legacy/build/pdf.mjs');
  })().catch(err => {
    pdfjsPromise = null;
    throw err;
  });
  return pdfjsPromise;
}

// Кэш по ссылке на исходный ArrayBuffer: один и тот же файл открывается один раз.
const docCache = new Map<ArrayBuffer, Promise<any>>();

export function openPdf(data: ArrayBuffer): Promise<any> {
  let doc = docCache.get(data);
  if (!doc) {
    doc = (async () => {
      const pdfjs = await loadPdfJs();
      return pdfjs.getDocument({ data: new Uint8Array(data), useSystemFonts: true }).promise;
    })().catch(err => {
      docCache.delete(data);
      throw err;
    });
    docCache.set(data, doc);
  }
  return doc;
}

// Освобождает документ (после OCR): закрывает pdf.js-объект и чистит кэш.
export async function releasePdf(data: ArrayBuffer): Promise<void> {
  const doc = docCache.get(data);
  if (!doc) return;
  docCache.delete(data);
  try {
    const pdf = await doc;
    await pdf.destroy();
  } catch {
    /* уже закрыт */
  }
}
