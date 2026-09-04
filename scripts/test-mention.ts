/**
 * Вызов помощника в переписке: что считается обращением и что он при этом видит.
 *
 * Две вещи, которые нельзя проверить глазами.
 *
 * Первая: «@» встречается в переписке постоянно — почта, ник, цена. Принять
 * такое за вопрос помощнику значит получить его ответ посреди разговора людей.
 *
 * Вторая, и она важнее: помощник в общей переписке видит НЕ ВСЮ её. Люди пишут
 * в группе о зарплатах, отпусках и заказчиках, и отдавать всё это из-за одного
 * вопроса нельзя — даже своему помощнику, который наружу не ходит. Приватность,
 * о которой нельзя доказать, что она соблюдается, приватностью не является.
 *
 * Запуск: npx tsx scripts/test-mention.ts
 */
import {
  parseMention, isEmptyAsk, contextFor, answerPrefix, CONTEXT_MESSAGES,
} from '../src/lib/mention';

let failed = 0;
const check = (name: string, cond: boolean, got?: unknown) => {
  if (cond) return;
  failed++;
  console.error(`  ✗ ${name}${got === undefined ? '' : ` — получили ${JSON.stringify(got)}`}`);
};

console.log('Что считается обращением к помощнику');
{
  const a = parseMention('@помощник посчитай расход по П1');
  check('обращение узнано', a.toAssistant, a);
  check('вопрос отделён от имени', a.text === 'посчитай расход по П1', a.text);

  const b = parseMention('@помощник, посчитай расход');
  check('запятая после имени не мешает', b.toAssistant && b.text === 'посчитай расход', b);

  check('имя без учёта регистра', parseMention('@Помощник привет').toAssistant);
  check('латиницей тоже', parseMention('@flux привет').toAssistant);
  check('пробел перед «@» не мешает', parseMention('   @помощник привет').toAssistant);
}

console.log('Что обращением НЕ считается');
{
  const mail = parseMention('пишите на ivan@example.com');
  check('почта посреди строки — не вопрос', !mail.toAssistant, mail);
  check('и текст при этом цел', mail.text.includes('ivan@example.com'));

  check('обращение к человеку помощнику не адресовано', !parseMention('@Иванов посмотри').toAssistant);
  check('пустое сообщение', !parseMention('').toAssistant);
  check('одна собака без имени', !parseMention('@').toAssistant);
  check('решётка вместо собаки', !parseMention('#помощник привет').toAssistant);
}

console.log('Обращение без вопроса');
{
  const empty = parseMention('@помощник');
  check('обращение узнано', empty.toAssistant);
  check('но вопроса в нём нет', isEmptyAsk(empty), empty);
  check('с вопросом пустым не считается', !isEmptyAsk(parseMention('@помощник привет')));
}

console.log('Что помощник видит из переписки');
{
  const talk = Array.from({ length: 20 }, (_, i) => ({ id: `m${i}`, author: 'Иванов', text: `строка ${i}` }));
  const seen = contextFor(talk, 'm15');
  check('это не вся переписка', seen.length < talk.length, { всего: talk.length, видно: seen.length });
  check('видно ровно столько, сколько объявлено', seen.length === CONTEXT_MESSAGES + 1, seen.length);
  check('последним идёт сам вопрос', seen[seen.length - 1].id === 'm15', seen[seen.length - 1]);
  check('старое в контекст не попало', !seen.some((m) => m.id === 'm0'), seen.map((m) => m.id));
  // Сказанное ПОСЛЕ вопроса помощник видеть не может: он отвечает на то, что
  // было, а не на то, что напишут дальше
  check('будущего он не видит', !seen.some((m) => m.id === 'm16'), seen.map((m) => m.id));

  const early = contextFor(talk, 'm2');
  check('в начале переписки берётся сколько есть', early.length === 3, early.map((m) => m.id));
  check('чужой идентификатор ничего не открывает', contextFor(talk, 'нет-такого').length === 0);
}

console.log('Ответ подписан');
{
  check('видно, на чей вопрос отвечено', answerPrefix('Иванов').includes('Иванов'));
}

if (failed) {
  console.error(`\nПровалено проверок: ${failed}`);
  process.exit(1);
}
console.log('\nВсе проверки вызова помощника пройдены');
