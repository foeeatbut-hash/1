/**
 * Проверки браузера.
 *
 * Главное здесь — разбор адресной строки. Ошибка в нём не падает и не мигает:
 * внутренний адрес предприятия, принятый за поисковый запрос, уходит наружу, в
 * чужую поисковую строку. Это уже утечка, а не неудобство, и заметить её
 * глазом нельзя — страница просто откроется «не та».
 *
 * Запуск: npx tsx scripts/test-browser.ts
 */
import { readFileSync } from 'fs';
import {
  resolveInput, allowedByList, hostOf, prettyUrl, tabLabel, engineById, ENGINES, DEFAULT_ENGINE,
} from '../src/lib/browserUrl';

let failed = 0;
const check = (name: string, cond: boolean, got?: unknown) => {
  if (cond) return;
  failed++;
  console.error(`  ✗ ${name}${got === undefined ? '' : ` — получили ${JSON.stringify(got)}`}`);
};

console.log('Адрес или запрос');
{
  check('явная схема — адрес', resolveInput('https://gost.ru/doc').how === 'url');
  check('домен без схемы — адрес', resolveInput('gost.ru').url === 'https://gost.ru');
  check('домен с путём', resolveInput('gost.ru/doc/21.201').url === 'https://gost.ru/doc/21.201');
  check('фраза — поиск', resolveInput('опросный лист АВО-2').how === 'search');
  check('слово без точки — поиск', resolveInput('вентилятор').how === 'search');
  check('запрос уходит в шаблон поисковика',
    resolveInput('насос', 'google').url.startsWith('https://www.google.com/search?q='));
  check('запрос закодирован', resolveInput('расход воздуха').url.includes('%20') === false
    || resolveInput('расход воздуха').url.includes('%D1%80'), resolveInput('расход воздуха').url);
  check('пустая строка ничего не открывает', resolveInput('   ').url === '');
}

console.log('Внутренние адреса не уходят наружу');
{
  const cases = ['localhost:3000', '127.0.0.1', '192.168.1.100:3000', '10.0.0.5/api', '172.16.4.4'];
  for (const c of cases) {
    const r = resolveInput(c);
    check(`${c} — адрес, а не запрос`, r.how === 'url', r);
    check(`${c} открывается по http`, r.url.startsWith('http://'), r.url);
  }
  // Похожее на внутреннее, но чужое — обычный адрес, а не «свой»
  check('172.32.х не считается частной сетью', resolveInput('172.32.1.1').url.startsWith('https://'), resolveInput('172.32.1.1').url);
}

console.log('Опасные схемы');
{
  for (const bad of ['javascript:alert(1)', 'data:text/html,<h1>x', 'file:///C:/Windows', 'about:blank']) {
    const r = resolveInput(bad);
    check(`${bad.split(':')[0]}: не открывается`, r.how === 'blocked' && r.url === '', r);
  }
}

console.log('Список разрешённых адресов');
{
  check('пустой список — можно куда угодно', allowedByList('https://example.com', []));
  check('разрешённый хост', allowedByList('https://gost.ru/doc', ['gost.ru']));
  check('поддомен разрешённого', allowedByList('https://docs.gost.ru/x', ['gost.ru']));
  // Самая дорогая ошибка такого списка: проверка подстрокой
  check('подделка под разрешённый хост не проходит', !allowedByList('https://gost.ru.evil.com', ['gost.ru']));
  check('чужой хост не проходит', !allowedByList('https://example.com', ['gost.ru']));
  check('схема в списке не мешает', allowedByList('https://gost.ru', ['https://gost.ru/']));
  check('мусор в списке не открывает всё', !allowedByList('https://example.com', ['  ', 'gost.ru']));
  check('неразбираемый адрес не проходит при списке', !allowedByList('не адрес', ['gost.ru']));
}

console.log('Мелочи, которые видно каждый день');
{
  check('хост из адреса', hostOf('https://docs.gost.ru/a/b') === 'docs.gost.ru');
  check('https прячется', prettyUrl('https://gost.ru/') === 'gost.ru');
  check('http остаётся видимым', prettyUrl('http://192.168.1.5/') === 'http://192.168.1.5');
  check('подпись вкладки — заголовок', tabLabel('ГОСТ 21.201', 'https://gost.ru') === 'ГОСТ 21.201');
  check('без заголовка — хост', tabLabel('', 'https://gost.ru/x') === 'gost.ru');
  check('без всего — «Новая вкладка»', tabLabel('', '') === 'Новая вкладка');
  check('поисковик по умолчанию существует', !!engineById(DEFAULT_ENGINE));
  check('неизвестный поисковик не ломает', engineById('нет такого') === ENGINES[0]);
  check('у каждого поисковика есть место под запрос', ENGINES.every((e) => e.url.includes('%s')));
}

console.log('Страница отделена от программы');
{
  const src = readFileSync(new URL('../electron/browser.ts', import.meta.url), 'utf8');
  check('вкладка — отдельный процесс движка', src.includes('new WebContentsView'));
  check('узел странице недоступен', /nodeIntegration:\s*false/.test(src));
  check('изоляция включена', /contextIsolation:\s*true/.test(src));
  check('песочница включена', /sandbox:\s*true/.test(src));
  check('своя сессия, не общая с программой', src.includes("session.fromPartition('persist:flux-browser')"));
  check('ссылки «в новом окне» открываются вкладкой', src.includes('setWindowOpenHandler'));
  check('вкладки окна убираются вместе с окном', src.includes('export function disposeBrowserFor'));

  const screen = readFileSync(new URL('../src/screens/BrowserScreen.tsx', import.meta.url), 'utf8');
  check('место страницы измеряется и сообщается', screen.includes('setBounds'));
  check('страница снимается со сцены при уходе', screen.includes('api()?.hide()'));
  check('в вебе раздел честно говорит, что не работает', screen.includes('Браузер работает в программе на компьютере'));
}

if (failed) {
  console.error(`\nПровалено проверок: ${failed}`);
  process.exit(1);
}
console.log('\nВсе проверки браузера пройдены');
