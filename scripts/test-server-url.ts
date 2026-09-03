/**
 * Проверки адреса сервера и пряток пароля.
 *
 * Проверка написана по случившемуся: в поле «Сервер компании» вписали строку
 * подключения к базе, поле её приняло, и программа перестала работать целиком —
 * включая экран входа, с которого это можно было бы исправить. Пароль при этом
 * уехал в диагностический журнал открытым текстом.
 *
 * Запуск: npx tsx scripts/test-server-url.ts
 */
import { checkServerUrl, isServerUrl, useSaved, maskSecrets } from '../src/lib/serverUrl';

let failed = 0;
const check = (name: string, cond: boolean, got?: unknown) => {
  if (cond) return;
  failed++;
  console.error(`  ✗ ${name}${got === undefined ? '' : ` — получили ${JSON.stringify(got)}`}`);
};

console.log('Годные адреса');
{
  check('обычный адрес с портом',
    checkServerUrl('http://192.168.1.100:3000').url === 'http://192.168.1.100:3000');
  check('адрес без схемы дополняется http',
    checkServerUrl('192.168.1.100:3000').url === 'http://192.168.1.100:3000');
  check('https сохраняется', checkServerUrl('https://flux.local').url === 'https://flux.local');
  check('хвостовая косая черта убирается',
    checkServerUrl('http://srv:3000/').url === 'http://srv:3000');
  check('путь в адресе не мешает', checkServerUrl('http://srv:3000/flux').url === 'http://srv:3000');
  check('пусто — это встроенный сервер, а не ошибка',
    checkServerUrl('').url === '' && checkServerUrl('').error === '');
  check('пробелы по краям не мешают', checkServerUrl('  http://srv:3000  ').url === 'http://srv:3000');
}

console.log('Строка подключения к базе в поле сервера');
{
  const dsn = 'mysql://Flux:pa$$w0rd@192.168.120.14:3306/Flux';
  const r = checkServerUrl(dsn);
  check('адресом сервера не становится', r.url === '', r.url);
  check('сказано, что это база', r.error.includes('базе данных'), r.error);
  check('сказано, куда идти вместо этого', r.error.includes('База'), r.error);
  check('mariadb:// тоже не проходит', !!checkServerUrl('mariadb://u:p@h:3306/db').error);
  check('postgresql:// тоже не проходит', !!checkServerUrl('postgresql://u:p@h/db').error);
  check('file: тоже не проходит', !!checkServerUrl('file:C:/base.sqlite').error);
}

console.log('Прочее негодное');
{
  check('логин с паролем в http-адресе не проходит',
    checkServerUrl('http://user:secret@srv:3000').error.includes('пароля'),
    checkServerUrl('http://user:secret@srv:3000').error);
  check('ftp не проходит', !!checkServerUrl('ftp://srv').error);
  check('одно слово с пробелами не проходит', !!checkServerUrl('сервер компании').error);
  check('короткая проверка согласна с подробной', !isServerUrl('mysql://u:p@h/db') && isServerUrl('srv:3000'));
}

console.log('Сохранённый адрес');
{
  const good = useSaved('http://192.168.1.100:3000');
  check('годный сохранённый применяется', good.url === 'http://192.168.1.100:3000' && !good.warn);

  const bad = useSaved('mysql://Flux:pass@192.168.120.14:3306/Flux');
  check('негодный сохранённый не применяется', bad.url === '', bad.url);
  check('о непримении сказано словами', bad.warn.includes('встроенном сервере'), bad.warn);
  check('пустой сохранённый молчит', useSaved('').url === '' && useSaved('').warn === '');
}

console.log('Пароль в тексте');
{
  const dsn = 'mysql://Flux:l!e41!rBPBVxZKF@192.168.120.14:3306/Flux';
  const hidden = maskSecrets(dsn);
  check('пароль замазан', !hidden.includes('l!e41!rBPBVxZKF'), hidden);
  check('имя пользователя видно', hidden.includes('Flux:***@'), hidden);
  check('адрес остаётся читаемым', hidden.includes('192.168.120.14:3306'), hidden);
  check('password= тоже замазывается',
    !maskSecrets('Server=h;Password=Секрет1;Db=x').includes('Секрет1'),
    maskSecrets('Server=h;Password=Секрет1;Db=x'));
  check('обычный текст не портится', maskSecrets('всё хорошо') === 'всё хорошо');
  check('адрес без пароля не портится',
    maskSecrets('http://192.168.1.100:3000/api/health') === 'http://192.168.1.100:3000/api/health');
}

if (failed) {
  console.error(`\nПровалено проверок: ${failed}`);
  process.exit(1);
}
console.log('\nВсе проверки адреса сервера пройдены');
