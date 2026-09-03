/**
 * Проверки обновления программы.
 *
 * Обновление — единственное действие, которое заменяет саму программу, и
 * ошибка здесь стоит дороже любой другой: человек остаётся без работающего
 * exe и без объяснения. Проверить это на живой машине нельзя — сборка и
 * подмена происходят на Windows у сотрудника, — поэтому всё, что можно
 * выразить правилом, проверяется здесь.
 *
 * Запуск: npx tsx scripts/test-updates.ts
 */
// Правила разложены по сторонам: окно сравнивает версии и подписывает кнопку,
// главный процесс качает файл и объясняет отказ. Проверяются вместе — сбой
// обновления одинаково плох с любой стороны границы
import { isNewer, fileUrlOf, blocker, phaseLabel } from '../src/lib/updates';
import { sameServer, installerName, badPackage, downloadError, MIN_EXE_BYTES } from '../electron/updates';

let failed = 0;
const check = (name: string, cond: boolean, got?: unknown) => {
  if (cond) return;
  failed++;
  console.error(`  ✗ ${name}${got === undefined ? '' : ` — получили ${JSON.stringify(got)}`}`);
};

console.log('Сравнение версий');
{
  check('0.85 новее 0.84', isNewer('0.85.0', '0.84.0'));
  check('та же версия не новее', !isNewer('0.84.0', '0.84.0'));
  check('старая не новее', !isNewer('0.83.0', '0.84.0'));
  check('десятая доля не путается с сотой', isNewer('0.10.0', '0.9.0'));
  check('короткая запись сравнивается с длинной', isNewer('1.0', '0.99.99'));
  check('суффикс не ломает сравнение', isNewer('0.85.0-beta', '0.84.0'));
  check('мусор вместо версии не выдаётся за новую', !isNewer('', '0.84.0'));
}

console.log('Адрес файла');
{
  check('относительный путь достраивается сервером',
    fileUrlOf('/api/updates/download/0.85.0', 'http://localhost:3000')
      === 'http://localhost:3000/api/updates/download/0.85.0');
  check('лишняя косая черта не удваивается',
    fileUrlOf('/x', 'http://srv:3000/') === 'http://srv:3000/x');
  check('путь без косой черты тоже достраивается',
    fileUrlOf('x.exe', 'http://srv') === 'http://srv/x.exe');
  check('полный адрес остаётся как есть',
    fileUrlOf('https://github.com/x/Flux.exe', 'http://srv') === 'https://github.com/x/Flux.exe');
  check('пустой адрес остаётся пустым', fileUrlOf('', 'http://srv') === '');
}

console.log('Токен уходит только своему серверу');
{
  const base = 'http://192.168.1.10:3000';
  check('свой сервер узнаётся', sameServer(`${base}/api/updates/download/1`, base));
  check('чужой хост — не свой', !sameServer('https://github.com/x.exe', base));
  check('другой порт — не свой', !sameServer('http://192.168.1.10:4000/x', base));
  check('другая схема — не свой', !sameServer('https://192.168.1.10:3000/x', base));
  check('битый адрес не считается своим', !sameServer('не адрес', base));
}

console.log('Имя скачанного файла');
{
  check('в имени стоит версия', installerName('0.85.0') === 'Flux-0.85.0.exe');
  check('посторонние знаки в имя не попадают',
    !installerName('0.85.0/../../etc').includes('/'), installerName('0.85.0/../../etc'));
}

console.log('Проверка скачанного');
{
  const mz = [0x4d, 0x5a, 0x90, 0x00];
  check('настоящий exe проходит', badPackage(mz, MIN_EXE_BYTES + 1) === '');
  check('страница с ошибкой вместо exe не проходит',
    badPackage([0x3c, 0x21], MIN_EXE_BYTES + 1).includes('не файл программы'));
  check('оборванная загрузка не проходит',
    badPackage(mz, 1024).includes('оборвалась'), badPackage(mz, 1024));
  check('пустой файл не проходит', badPackage([], 0) !== '');
  check('отсутствие данных не роняет проверку', badPackage(null, 0) !== '');
}

console.log('Отказ сервера словами');
{
  check('401 говорит про вход', downloadError(401).includes('вход'));
  check('403 говорит про вход', downloadError(403).includes('вход'));
  check('404 говорит, что делать администратору', downloadError(404).includes('загрузить exe'));
  check('404 называет сервер, у которого спрашивали',
    downloadError(404, '', 'http://192.168.1.10:3000').includes('192.168.1.10:3000'),
    downloadError(404, '', 'http://192.168.1.10:3000'));
  check('404 подсказывает про «тот же сервер»', downloadError(404).includes('тот же сервер'));
  check('500 передаёт слова сервера', downloadError(500, 'диск переполнен').includes('диск переполнен'));
  check('неизвестный код не оставляет человека без объяснения', downloadError(418).includes('418'));
}

console.log('Что мешает обновиться');
{
  const okCase = { electron: true, packaged: true, portable: true, fileUrl: '/api/updates/download/1' };
  check('когда всё на месте — ничего не мешает', blocker(okCase) === '', blocker(okCase));
  check('в браузере обновление не ставится',
    blocker({ ...okCase, electron: false }).includes('браузере'));
  check('в разработке обновление не ставится',
    blocker({ ...okCase, packaged: false }).includes('разработки'));
  check('без файла сказано, что делать администратору',
    blocker({ ...okCase, fileUrl: '' }).toLowerCase().includes('администратору'));
  check('непортативная сборка предупреждает про установщик',
    blocker({ ...okCase, portable: false }).includes('установщик'));
}

console.log('Ход дела одной строкой');
{
  check('этап скачивания показывает проценты', phaseLabel('downloading', 42).includes('42'));
  check('этап проверки назван', phaseLabel('verifying').includes('Проверяю'));
  check('этап установки объясняет закрытие', phaseLabel('installing').includes('Закрываюсь'));
  check('в покое строки нет', phaseLabel('idle') === '');
}

if (failed) {
  console.error(`\nПровалено проверок: ${failed}`);
  process.exit(1);
}
console.log('\nВсе проверки обновления пройдены');
