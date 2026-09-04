/**
 * Скачанное из браузера: имена, размеры, состояния.
 *
 * Всё скачивается в ЛИЧНУЮ папку сотрудника — не в общую «Загрузки» машины и
 * не туда, куда покажет системный диалог. Причина простая: в отделе за одним
 * компьютером иногда работают двое, и общая куча файлов — это чужие документы
 * у себя в папке, а через неделю ещё и «кто это скачал».
 *
 * Здесь то, что показывает окно: размеры, подписи и полоса. Имя файла на
 * диске и личная папка — дело файловой системы, они в electron/downloadPath.ts:
 * окну про это знать нечего, и границу слоёв стережёт test-architecture.
 *
 * Без Electron и без React: числа и строки здесь важнее кода, и проверяются
 * они скриптом (scripts/test-downloads.ts).
 */

/** Состояние скачивания: то же, что показывает полоса */
export type DownloadState = 'progress' | 'done' | 'failed' | 'cancelled';

export interface DownloadItem {
  id: string;
  name: string;
  url: string;
  path: string;
  size: number;        // сколько всего, байт; 0 — сервер не сказал
  received: number;    // сколько уже пришло
  state: DownloadState;
  at: number;          // когда началось
}

/** Размер словами: без долей у килобайт — они там ничего не уточняют */
export function sizeText(bytes: number): string {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return '';
  if (n < 1024) return `${Math.round(n)} Б`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} КБ`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} МБ`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} ГБ`;
}

/**
 * Подпись под именем файла.
 *
 * Сколько осталось — не показываем: время до конца врёт чаще, чем говорит
 * правду, и на медленной сети скачет от «5 секунд» до «14 минут» и обратно.
 * Показываем то, что известно точно: сколько пришло из скольких.
 */
export function progressText(d: Pick<DownloadItem, 'state' | 'size' | 'received'>): string {
  if (d.state === 'failed') return 'не скачалось';
  if (d.state === 'cancelled') return 'отменено';
  if (d.state === 'done') return sizeText(d.size || d.received) || 'готово';
  const got = sizeText(d.received);
  if (!d.size) return got ? `${got} — идёт` : 'идёт';
  return `${got} из ${sizeText(d.size)}`;
}

/** Доля выполненного, 0…1. Без общего размера полосы нет — и врать нечем */
export function progressRatio(d: Pick<DownloadItem, 'state' | 'size' | 'received'>): number {
  if (d.state === 'done') return 1;
  if (!d.size || d.size <= 0) return 0;
  return Math.max(0, Math.min(1, d.received / d.size));
}
