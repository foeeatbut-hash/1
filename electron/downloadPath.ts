/**
 * Имя скачанного файла на диске и личная папка сотрудника.
 *
 * Живёт в главном процессе, а не в src/: имя файла — дело файловой системы, и
 * знать о нём окну незачем (границу слоёв стережёт scripts/test-architecture).
 * Окну достаются подписи и полосы — они в src/lib/downloads.ts.
 *
 * Имя файла с сайта — не имя файла на диске. Оно приходит с кириллицей,
 * пробелами, косыми чертами, а иногда и с попыткой выйти из папки («../»).
 * Здесь правила, по которым из него получается безопасное имя, и правила
 * второго такого же файла: «отчёт.pdf» скачали дважды — второй должен стать
 * «отчёт (2).pdf», а не молча затереть первый.
 *
 * Проверяется скриптом scripts/test-downloads.ts.
 */

// Запрещённые в именах файлов Windows знаки и управляющие символы. Пробела и
// дефиса здесь нет намеренно: в именах документов они законны и нужны
const BAD = /[<>:"/\\|?*\u0000-\u001f]/g;

/** Имена, занятые самой Windows: файл с таким именем создать нельзя */
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/**
 * Безопасное имя файла из того, что прислал сайт.
 *
 * Кириллицу и пробелы сохраняем: это имя человек будет искать глазами, и
 * «otchet_2026.pdf» вместо «Отчёт 2026.pdf» — потеря, а не безопасность.
 */
export function safeFileName(raw: string): string {
  // Только последний кусок пути: «../../etc/passwd» должно стать «passwd»
  const tail = String(raw || '').split(/[\\/]/).pop() || '';
  let name = tail.replace(BAD, '_').replace(/^\.+/, '').trim();
  // Windows молча срезает точку и пробел в конце имени — срежем сами, чтобы
  // имя на диске совпадало с тем, что показано человеку
  name = name.replace(/[. ]+$/, '');
  if (!name) return 'Файл';
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  if (RESERVED.test(stem)) name = `_${name}`;
  // Предел пути Windows — 260 знаков вместе с папкой; 120 на имя с запасом
  if (name.length > 120) {
    const d = name.lastIndexOf('.');
    const ext = d > 0 && name.length - d <= 12 ? name.slice(d) : '';
    name = name.slice(0, 120 - ext.length) + ext;
  }
  return name;
}

/**
 * Имя, которого ещё нет в папке.
 *
 * `taken` — что уже лежит. Второй такой же файл получает «(2)», третий «(3)»:
 * так делает и Проводник Windows, и человеку не нужно этому учиться.
 */
export function uniqueFileName(name: string, taken: Iterable<string>): string {
  const busy = new Set(Array.from(taken, (n) => String(n).toLowerCase()));
  if (!busy.has(name.toLowerCase())) return name;
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  for (let i = 2; i < 1000; i++) {
    const next = `${stem} (${i})${ext}`;
    if (!busy.has(next.toLowerCase())) return next;
  }
  return `${stem} (${Date.now()})${ext}`;
}

/**
 * Личная папка сотрудника внутри общей папки загрузок.
 *
 * Имя папки — логин: он латиницей, не меняется и однозначно указывает на
 * человека. По фамилии папки у двух однофамильцев совпали бы.
 */
export function personFolder(symbol: string): string {
  const clean = String(symbol || '').replace(BAD, '_').replace(/[. ]+$/, '').trim();
  return clean || 'Общая';
}
