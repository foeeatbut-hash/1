/**
 * Поиск по тексту ПДФ.
 *
 * Две ловушки, из-за которых поиск по чертежу «не находит то, что видно
 * глазами»: перенос строки внутри слова и обход совпадений по кругу. Обе
 * проверяются здесь, потому что на живом документе они всплывают редко и
 * случайно — а человек в этот момент решает, что поиск сломан.
 *
 * Запуск: npx tsx scripts/test-pdf-search.ts
 */
import { flatten, findInPages, stepHit, hitsLabel } from '../src/lib/pdfSearch';

let failed = 0;
const check = (name: string, cond: boolean, got?: unknown) => {
  if (cond) return;
  failed++;
  console.error(`  ✗ ${name}${got === undefined ? '' : ` — получили ${JSON.stringify(got)}`}`);
};

const pages = [
  { page: 1, text: 'Опросный лист на приточную\nустановку П-1. Расход 5000 м3/ч.' },
  { page: 2, text: 'Насос Н-2, напор 32 м.\nНАСОС резервный Н-3.' },
  { page: 3, text: 'Лист замечаний.' },
];

console.log('Приведение текста');
{
  check('перенос строки становится пробелом', flatten('вентиля\nтор') === 'вентиля тор');
  check('повторные пробелы схлопываются', flatten('а    б') === 'а б');
  check('края обрезаются', flatten('  а  ') === 'а');
  check('пустое остаётся пустым', flatten('') === '');
}

console.log('Что нашлось');
{
  const hits = findInPages(pages, 'насос');
  check('регистр не мешает', hits.length === 2, hits.map((h) => h.snippet));
  check('обе находки со второй страницы', hits.every((h) => h.page === 2), hits);
  check('вокруг совпадения виден текст', hits[0].snippet.includes('Н-2'), hits[0].snippet);

  // Слово, разорванное переносом, человек видит целым — и ищет целым
  const split = findInPages([{ page: 1, text: 'приточную\nустановку' }], 'приточную установку');
  check('слово через перенос строки находится', split.length === 1, split);

  check('пустой запрос ничего не находит', findInPages(pages, '').length === 0);
  check('пробелы вместо запроса — тоже ничего', findInPages(pages, '   ').length === 0);
  check('чего нет, того нет', findInPages(pages, 'дымосос').length === 0);
}

console.log('Ход по совпадениям');
{
  check('первое нажатие — на первое совпадение', stepHit(3, -1, 1) === 0);
  check('назад с самого начала — на последнее', stepHit(3, -1, -1) === 2);
  check('вперёд', stepHit(3, 0, 1) === 1);
  // По кругу: иначе поиск молча упирается в конец, и это читается как
  // «больше не нашлось», хотя нашлось
  check('с последнего вперёд — на первое', stepHit(3, 2, 1) === 0);
  check('с первого назад — на последнее', stepHit(3, 0, -1) === 2);
  check('когда искать нечего — минус один, а не ноль', stepHit(0, -1, 1) === -1);
}

console.log('Подпись у поля');
{
  check('счёт человеческий, с единицы', hitsLabel(5, 0) === '1 из 5', hitsLabel(5, 0));
  check('пусто названо словами', hitsLabel(0, -1).includes('не найдено'));
}

if (failed) {
  console.error(`\nПровалено проверок: ${failed}`);
  process.exit(1);
}
console.log('\nВсе проверки поиска по ПДФ пройдены');
