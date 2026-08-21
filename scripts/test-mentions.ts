/**
 * Разбор письма: что программа узнаёт в чужом тексте.
 *
 * Проверяем именно выборку кандидатов — самое хрупкое место. Ошибка в одну
 * сторону даёт письмо, где подсвечено каждое второе слово; ошибка в другую —
 * тег, который человек видит глазами, а программа не замечает.
 *
 * Запуск: npx tsx scripts/test-mentions.ts
 */
import { codeCandidates, fileCandidates, caseVariants, namesInText, isDistinctName } from '../server/mail/mentions';

let bad = 0;
const ok = (name: string, cond: boolean, got?: any) =>
  cond ? console.log('  ✓', name) : (bad++, console.error('  ✗', name, got !== undefined ? JSON.stringify(got) : ''));

const has = (list: string[], v: string) => list.some((x) => x.toLowerCase() === v.toLowerCase());

console.log('1. Обозначения тегов');
{
  const text = 'Добрый день! Просьба подтвердить позиции 20-PT-001, 20-PT-002 и AHU-2 до пятницы.';
  const c = codeCandidates(text);
  ok('нашлось 20-PT-001', has(c, '20-PT-001'), c);
  ok('запятая не прилипла', !c.includes('20-PT-001,'), c);
  ok('нашлось AHU-2', has(c, 'AHU-2'), c);
  ok('точка в конце предложения не прилипла', !c.some((x) => x.endsWith('.')), c);
}
{
  const c = codeCandidates('Смонтированы у1-мн1 и В2, проверить насос3.');
  ok('кириллическое обозначение через дефис', has(c, 'у1-мн1'), c);
  ok('слитное обозначение с цифрой', has(c, 'В2') && has(c, 'насос3'), c);
}
{
  const c = codeCandidates('Обычный текст без единого обозначения, просто слова.');
  ok('в обычном тексте кандидатов нет', c.length === 0, c);
}
{
  // Подписи и реквизиты — главный источник ложных находок
  const c = codeCandidates('С уважением, Иванов И.И., тел. +7 999 123-45-67, ООО «Ромашка»');
  ok('телефон не выдаётся за тег дважды', c.filter((x) => x.includes('123-45-67')).length <= 1, c);
}

console.log('\n2. Имена документов');
{
  const f = fileCandidates('Во вложении Смета_вентиляция.xlsx и План этажа 2.pdf, а также схема.DWG');
  ok('xlsx найден', has(f, 'Смета_вентиляция.xlsx'), f);
  ok('расширение в верхнем регистре найдено', f.some((x) => /схема\.DWG/i.test(x)), f);
  ok('без расширения ничего не берём', !f.some((x) => !x.includes('.')), f);
}
{
  const f = fileCandidates('Ссылка на сайт: example.com/price и почта a@b.ru');
  ok('домен не считается документом', !f.some((x) => x.includes('example.com')), f);
}
{
  // Имя, начинающееся с подчёркивания, — обычное дело, и обрезать его нельзя:
  // в базе лежит «_Смета.xlsx», а искали бы «Смета.xlsx»
  const f = fileCandidates('Во вложении _Смета_вентиляция.xlsx.');
  ok('подчёркивание в начале имени сохраняется', has(f, '_Смета_вентиляция.xlsx'), f);
}

console.log('\n3. Написание');
{
  const v = caseVariants(['AHU-2']);
  ok('в запрос идут все три написания', v.includes('AHU-2') && v.includes('ahu-2') && v.includes('AHU-2'.toUpperCase()), v);
  ok('повторов нет', new Set(v).size === v.length, v);
}

console.log('\n4. Названия книг ищем наоборот');
{
  const docs = [
    { id: '1', name: 'Ведомость расходов' },
    { id: '2', name: 'Лист' },
    { id: '3', name: 'Спецификация клапанов' },
  ];
  const hit = namesInText('Прошу проверить Ведомость расходов по объекту.', docs);
  ok('название книги найдено целиком', hit.length === 1 && hit[0].id === '1', hit);
  // «Лист» встречается в каждом втором письме и книгой быть перестаёт
  const short = namesInText('Лист согласования подписан, лишний лист приложен.', docs);
  ok('короткое название из одного слова пропускается', short.length === 0, short);
  ok('название из двух слов берём и коротким', isDistinctName('План А1'), 'План А1');
  ok('длинное одинокое слово берём', isDistinctName('Аэродинамика'), 'Аэродинамика');
  ok('короткое одинокое слово не берём', !isDistinctName('Смета'), 'Смета');
}

console.log('\n5. Размер письма');
{
  const huge = Array.from({ length: 2000 }, (_, i) => `X-${1000 + i}`).join(' ');
  const c = codeCandidates(huge);
  ok('кандидатов не больше четырёхсот', c.length <= 400, c.length);
}

console.log(bad === 0 ? `\nВСЕ ПРОВЕРКИ ПРОЙДЕНЫ` : `\nПРОВАЛОВ: ${bad}`);
process.exit(bad === 0 ? 0 : 1);
