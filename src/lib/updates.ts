/**
 * Обновление программы: сравнение версий, адрес файла и разбор отказов.
 *
 * Здесь то, что раньше было размазано по виджету и главному процессу и оттого
 * молчало. Обновление у портативной программы — единственное действие, которое
 * заменяет саму программу, и человеку в нём нужно ровно одно: нажал — и через
 * минуту работает новая версия. Всё остальное он видеть не должен, а если не
 * получилось — обязан прочитать, ПОЧЕМУ, а не «Error invoking remote method».
 *
 * Здесь — сторона окна: сравнение версий, адрес файла и что показывать на
 * кнопке. Правила самого скачивания живут у главного процесса
 * (electron/updates.ts), потому что решаются там же, где качается файл, а
 * окно кода главного процесса не видит и видеть не должно.
 *
 * Без React и без сети: правила проверяются скриптом (scripts/test-updates.ts),
 * потому что ошибиться здесь легко, а увидеть ошибку можно только на чужой
 * машине в день выпуска.
 */

/** Новее ли выложенная версия той, что запущена */
export function isNewer(latest: string, current: string): boolean {
  // Суффиксы вроде «-beta» дают NaN при Number() — оставляем цифры и точки
  const parts = (v: string) => String(v || '').replace(/[^0-9.]/g, '').split('.').map((x) => Number(x) || 0);
  const l = parts(latest);
  const c = parts(current);
  for (let i = 0; i < Math.max(l.length, c.length); i++) {
    if ((l[i] || 0) > (c[i] || 0)) return true;
    if ((l[i] || 0) < (c[i] || 0)) return false;
  }
  return false;
}

/**
 * Полный адрес файла обновления. Относительный путь достраивается адресом
 * сервера, с которым программа и так работает.
 */
export function fileUrlOf(fileUrl: string, base: string): string {
  const raw = String(fileUrl || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  const b = String(base || '').replace(/\/+$/, '');
  return `${b}${raw.startsWith('/') ? '' : '/'}${raw}`;
}

/** Что мешает начать обновление прямо сейчас; пустая строка — ничего */
export function blocker(o: {
  electron: boolean; packaged: boolean; portable: boolean; fileUrl: string;
}): string {
  if (!o.electron) {
    return 'Обновление ставится только в самой программе. В браузере файл можно лишь скачать.';
  }
  if (!o.packaged) return 'Это режим разработки — обновление здесь не ставится.';
  if (!o.fileUrl) {
    return 'У релиза нет файла. Администратору нужно загрузить exe или указать прямую ссылку.';
  }
  if (!o.portable) {
    return 'Программа запущена не портативным файлом — обновление поставит обычный установщик.';
  }
  return '';
}

/** Строка хода дела для одной кнопки: человек видит этап, а не проценты в никуда */
export type Phase = 'idle' | 'checking' | 'available' | 'downloading' | 'verifying' | 'installing' | 'failed';

export function phaseLabel(phase: Phase, percent = 0): string {
  switch (phase) {
    case 'checking': return 'Сверяю версии…';
    case 'downloading': return `Скачиваю… ${Math.round(percent)}%`;
    case 'verifying': return 'Проверяю файл…';
    case 'installing': return 'Закрываюсь и обновляюсь…';
    default: return '';
  }
}
