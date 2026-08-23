/**
 * Помощник, руководство и почта.
 *
 * Две связки, которые легко сломать незаметно. Первая: вопрос «где написано
 * про подписи» должен приводить не просто в статью, а в её нужное место —
 * стоит сместиться порогу, и помощник начнёт отвечать «Что можно сделать» на
 * вопрос «почему так». Вторая: разбор просьбы про письма. «Письма от Иванова»
 * и «письма про Иванова» — разные просьбы, и перепутать их значит отдать
 * человеку не тот список.
 *
 * Запуск: npx tsx scripts/test-assistant-links.ts
 */
import { answerFromHandbook, asksWhereWritten, handbookHref } from '../src/assistant/handbookAnswers';
import { parseMailQuery, asksToFindMail, asksAboutMail, nameStem } from '../src/assistant/mailQueries';

let bad = 0;
const ok = (name: string, cond: boolean, got?: any) =>
  cond ? console.log('  ✓', name) : (bad++, console.error('  ✗', name, got !== undefined ? JSON.stringify(got) : ''));

console.log('1. Ответ из руководства');
{
  const a = answerFromHandbook('где в руководстве про подпись в письме', 2);
  ok('вопрос про подписи ведёт в статью «Почта»', a?.articleId === 'mail', a);
  ok('переход указывает и статью, и место', !!a && /article=mail&at=\w+/.test(handbookHref(a)), a && handbookHref(a));
  ok('ответ не пустой и не обрывок', (a?.text.length || 0) > 20, a?.text);
}
{
  const a = answerFromHandbook('как вернуть удалённый файл из корзины', 2);
  ok('вопрос про корзину ведёт в Проводник', a?.articleId === 'explorer', a);
}
{
  const a = answerFromHandbook('чем проектные данные отличаются от общих', 2);
  ok('вопрос про области данных находит свою статью', a?.articleId === 'scopes', a);
}
{
  const a = answerFromHandbook('погода на выходных', 5);
  ok('на посторонний вопрос руководство не отвечает', a === null, a);
}
{
  // Порог существует ради этого: без него статья притягивается к любому слову
  const loose = answerFromHandbook('спасибо', 5);
  ok('на «спасибо» статья не притягивается', loose === null, loose);
}

console.log('\n2. «Где это написано»');
{
  ok('вопрос про руководство узнан', asksWhereWritten('где в руководстве про теги'), true);
  ok('вопрос про справку узнан', asksWhereWritten('где найти про закупки в справке'), true);
  ok('обычная просьба не считается вопросом к руководству', !asksToFindMail('покажи теги'), true);
}

console.log('\n3. Просьбы про почту');
{
  ok('«покажи все письма про 20-PT-001» — это поиск', asksToFindMail('покажи все письма про 20-PT-001'), true);
  ok('«как настроить почту» — не поиск', !asksToFindMail('как настроить почту'), true);
  ok('«что такое общий ящик» — не поиск', !asksToFindMail('зачем нужна общая почта'), true);
  ok('про почту вообще', asksAboutMail('нужна переписка по этому вопросу'), true);
  // Отбор без глагола — люди так и пишут, коротко
  ok('«письма от Петрова» — это поиск', asksToFindMail('письма от Петрова'), true);
  ok('«переписка про клапаны Гермик» — это поиск', asksToFindMail('переписка про клапаны Гермик'), true);
}
{
  const q = parseMailQuery('покажи все письма про 20-PT-001');
  ok('обозначение вытащено', q?.q === '20-pt-001', q);
  ok('отправитель пуст', q?.from === '', q);
}
{
  const q = parseMailQuery('письма от Иванова');
  ok('отправитель вытащен основой', q?.from === 'иванов', q);
  ok('в поиск по тексту фамилия не попала', q?.q === '', q);
  ok('в ответе показано исходное написание', /Иванова/.test(q?.label || ''), q);
}
{
  const q = parseMailQuery('нужны все письма от специалиста Петрова про клапаны Гермик');
  ok('и отправитель, и тема разом', q?.from === 'петров' && /клапаны гермик/.test(q?.q || ''), q);
}
{
  const q = parseMailQuery('покажи письма');
  ok('просьба без уточнения — не поиск', q === null, q);
}
{
  ok('«Ивановым» и «Иванова» сходятся', nameStem('Ивановым') === nameStem('Иванова'), [nameStem('Ивановым'), nameStem('Иванова')]);
  ok('короткое имя не режется', nameStem('Ли') === 'ли', nameStem('Ли'));
  ok('адрес почты остаётся адресом', nameStem('ivanov@mail.ru') === 'ivanov@mail.ru', nameStem('ivanov@mail.ru'));
}

console.log(bad === 0 ? '\nВСЕ ПРОВЕРКИ ПРОЙДЕНЫ' : `\nПРОВАЛОВ: ${bad}`);
process.exit(bad === 0 ? 0 : 1);
