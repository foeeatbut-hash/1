/**
 * Проверки уведомлений на рабочий стол Windows.
 *
 * Ошибка здесь двусторонняя и обе стороны дорогие: лишнее уведомление лезет
 * поверх открытого окна и раздражает всех, недошедшее не замечает никто — и
 * человек просто перестаёт верить чату. Поэтому правило вынесено в чистый
 * модуль и проверяется по всем сочетаниям.
 *
 * Запуск: npx tsx scripts/test-system-notify.ts
 */
import { readFileSync } from 'fs';
import { shouldNotifySystem, notifyText, badgeCount, BODY_LIMIT } from '../src/lib/systemNotify';

let failed = 0;
const check = (name: string, cond: boolean, got?: unknown) => {
  if (cond) return;
  failed++;
  console.error(`  ✗ ${name}${got === undefined ? '' : ` — получили ${JSON.stringify(got)}`}`);
};

const base = { minimized: false, focused: true, quiet: false, allowed: true, desktop: true };

console.log('Когда показывать');
{
  check('окно свёрнуто — показываем', shouldNotifySystem({ ...base, minimized: true }));
  check('окно не в фокусе — показываем', shouldNotifySystem({ ...base, focused: false }));
  check('человек смотрит в окно — молчим', !shouldNotifySystem(base));
  check('тихий режим сильнее всего', !shouldNotifySystem({ ...base, minimized: true, quiet: true }));
  check('выключенная категория молчит', !shouldNotifySystem({ ...base, minimized: true, allowed: false }));
  check('в браузере системных уведомлений нет', !shouldNotifySystem({ ...base, minimized: true, desktop: false }));

  // Полный перебор: показываем ровно тогда, когда человек смотрит не сюда,
  // категория разрешена, тишины нет и мы в Electron
  for (const minimized of [false, true]) {
    for (const focused of [false, true]) {
      for (const quiet of [false, true]) {
        for (const allowed of [false, true]) {
          for (const desktop of [false, true]) {
            const got = shouldNotifySystem({ minimized, focused, quiet, allowed, desktop });
            const want = desktop && !quiet && allowed && (minimized || !focused);
            check(`перебор ${[minimized, focused, quiet, allowed, desktop].join('')}`, got === want, got);
          }
        }
      }
    }
  }
}

console.log('Текст');
{
  const t = notifyText('Иванов И. И.', '  Посмотрите,  пожалуйста,   опросный лист  ');
  check('имя отправителя — заголовок', t.title === 'Иванов И. И.');
  check('пробелы схлопнуты', t.body === 'Посмотрите, пожалуйста, опросный лист', t.body);
  const long = notifyText('А', 'я'.repeat(400));
  check('длинное подрезано своим многоточием', long.body.length === BODY_LIMIT && long.body.endsWith('…'), long.body.length);
  check('без имени не остаёмся без заголовка', notifyText('', 'текст').title === 'Flux');
  check('пустое тело не ломает', notifyText('Имя', '').body === '');
}

console.log('Счётчик на значке');
{
  check('обычное число', badgeCount(7) === 7);
  check('ноль', badgeCount(0) === 0);
  check('отрицательное не показываем', badgeCount(-3) === 0);
  check('дробное округляем вниз', badgeCount(2.9) === 2);
  check('мусор не ломает', badgeCount(NaN as any) === 0);
}

console.log('Сторона Electron');
{
  const main = readFileSync(new URL('../electron/main.ts', import.meta.url), 'utf8');
  check('уведомление системы заведено', main.includes("ipcMain.handle('notify:system'"));
  check('нажатие возвращает окно', /n\.on\('click'[\s\S]{0,300}?mainWindow\.focus\(\)/.test(main));
  check('нажатие открывает нужное место', /notify:open/.test(main));
  check('счётчик на значке', main.includes("ipcMain.handle('notify:badge'"));
  check('состояние окна отдаётся рендереру', main.includes("ipcMain.handle('notify:window-state'"));

  const preload = readFileSync(new URL('../electron/preload.ts', import.meta.url), 'utf8');
  check('мост открыт наружу', preload.includes('notify:system') && preload.includes('notify:badge'));

  const layout = readFileSync(new URL('../src/components/Layout.tsx', import.meta.url), 'utf8');
  check('решение принимает общее правило', layout.includes('shouldNotifySystem'));
  check('окно спрашивается один раз на пачку', layout.includes('const win = await windowState()'));
}

if (failed) {
  console.error(`\nПровалено проверок: ${failed}`);
  process.exit(1);
}
console.log('\nВсе проверки системных уведомлений пройдены');
