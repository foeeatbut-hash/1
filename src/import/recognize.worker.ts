// Фоновый воркер распознавания: тяжёлые регэкспы recognize() и парсинг «чистых»
// форматов (xlsx/xml) уходят с главного потока, чтобы UI не подвисал.
// PDF и DOCX здесь НЕ обрабатываются (им нужны браузерные библиотеки) — их
// извлекают на главном потоке, а сюда передают уже готовые блоки на recognize().

import { extractXlsx, extractXml } from './extractors';
import { recognize } from './recognize';
import type { ExtractedDoc } from './types';

type Req =
  | { type: 'recognize'; id: number; doc: ExtractedDoc }
  | { type: 'extractRecognize'; id: number; ext: string; buffer: ArrayBuffer };

self.onmessage = (e: MessageEvent<Req>) => {
  const msg = e.data;
  try {
    let doc: ExtractedDoc;
    if (msg.type === 'recognize') {
      doc = msg.doc;
    } else {
      doc = msg.ext === 'xml'
        ? extractXml(new TextDecoder('utf-8').decode(msg.buffer))
        : extractXlsx(msg.buffer);
    }
    const draft = recognize(doc);
    (self as any).postMessage({ type: 'result', id: msg.id, draft });
  } catch (err: any) {
    (self as any).postMessage({ type: 'error', id: msg.id, message: err?.message || String(err) });
  }
};
