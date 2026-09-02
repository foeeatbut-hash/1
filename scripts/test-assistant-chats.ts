/**
 * Проверки истории разговоров с помощником.
 *
 * Ошибки здесь тихие и обидные: разговор без имени в списке неотличим от
 * соседнего, пустой разговор навсегда оседает в истории, а поиск не находит
 * того, что человек точно спрашивал, — потому что искал по имени, а слово было
 * во второй реплике.
 *
 * Запуск: npx tsx scripts/test-assistant-chats.ts
 */
import {
  titleOf, isEmptyTalk, searchText, previewOf, dayLabel, groupByDay, filterChats,
  TITLE_MAX, SEARCH_MAX, type ChatLine, type ChatSummary,
} from '../src/lib/assistantChats';

let failed = 0;
const check = (name: string, cond: boolean, got?: unknown) => {
  if (cond) return;
  failed++;
  console.error(`  ✗ ${name}${got === undefined ? '' : ` — получили ${JSON.stringify(got)}`}`);
};

const hello: ChatLine = { role: 'assistant', text: 'Здравствуйте! Я помощник Flux' };

console.log('Имя разговора');
{
  const lines: ChatLine[] = [hello, { role: 'user', text: 'покажи дубли' }, { role: 'assistant', text: 'Нашёл 3' }];
  check('имя — первая фраза человека, а не приветствие', titleOf(lines) === 'покажи дубли', titleOf(lines));
  check('разговор без вопросов получает запасное имя', titleOf([hello]) === 'Разговор', titleOf([hello]));

  const long = 'покажи все вентиляторы приточных установок с расходом больше трёх тысяч кубометров';
  const t = titleOf([{ role: 'user', text: long }]);
  check('длинное имя обрывается', t.length <= TITLE_MAX + 1, t);
  check('обрыв по слову, а не по букве', !/\S…$/.test(t) || t.endsWith('…'), t);
  check('обрыв помечен многоточием', t.endsWith('…'), t);

  check('перевод строки в имя не попадает',
    titleOf([{ role: 'user', text: 'покажи\n  дубли' }]) === 'покажи дубли');
  check('пробельный вопрос за вопрос не считается',
    titleOf([{ role: 'user', text: '   ' }]) === 'Разговор');
}

console.log('Пустой разговор');
{
  check('приветствие без вопроса — пусто', isEmptyTalk([hello]));
  check('вопрос делает разговор непустым', !isEmptyTalk([hello, { role: 'user', text: 'а' }]));
  check('пробелы вопросом не считаются', isEmptyTalk([hello, { role: 'user', text: '  ' }]));
}

console.log('Поиск по репликам');
{
  const lines: ChatLine[] = [
    hello,
    { role: 'user', text: 'покажи дубли' },
    { role: 'assistant', text: 'Нашёл 3 повтора' },
    { role: 'user', text: 'а ВЕНТИЛЯТОРЫ?' },
  ];
  const s = searchText(lines);
  check('в поиск попадает не только имя', s.includes('вентилятор'), s);
  check('поиск не зависит от регистра', s.includes('вентиляторы') && !s.includes('ВЕНТИЛЯТОРЫ'));
  const huge = searchText([{ role: 'user', text: 'я'.repeat(SEARCH_MAX * 2) }]);
  check('строка поиска не растёт бесконечно', huge.length === SEARCH_MAX, huge.length);
}

console.log('Вторая строка в списке');
{
  const lines: ChatLine[] = [hello, { role: 'user', text: 'дубли' }, { role: 'assistant', text: 'Нашёл 3 повтора' }];
  check('показывается последний ответ помощника', previewOf(lines) === 'Нашёл 3 повтора', previewOf(lines));
  check('вопрос человека за ответ не выдаётся',
    previewOf([hello, { role: 'user', text: 'дубли' }]) === 'Здравствуйте! Я помощник Flux');
  check('длинный ответ обрывается', previewOf([{ role: 'assistant', text: 'я'.repeat(200) }], 20).endsWith('…'));
}

console.log('Разбивка по дням');
{
  const now = new Date('2026-09-02T12:00:00');
  const at = (iso: string) => iso;
  check('сегодняшний назван сегодняшним', dayLabel(at('2026-09-02T09:00:00'), now) === 'Сегодня');
  check('вчерашний назван вчерашним', dayLabel(at('2026-09-01T23:00:00'), now) === 'Вчера');
  check('позавчерашний — на этой неделе', dayLabel(at('2026-08-31T10:00:00'), now) === 'На этой неделе');
  check('прошлогодний назван месяцем и годом', /2025/.test(dayLabel(at('2025-05-05T10:00:00'), now)));
  check('битая дата не роняет список', dayLabel('не дата', now) === 'Когда-то');

  const chats: ChatSummary[] = [
    { id: 'a', title: 'старый', updatedAt: '2026-08-01T10:00:00' },
    { id: 'b', title: 'свежий', updatedAt: '2026-09-02T10:00:00' },
    { id: 'c', title: 'тоже сегодня', updatedAt: '2026-09-02T08:00:00' },
  ];
  const g = groupByDay(chats, now);
  check('свежие сверху', g[0].label === 'Сегодня', g.map((x) => x.label));
  check('за один день — одна группа', g[0].chats.length === 2, g[0].chats.length);
  check('внутри дня тоже свежие сверху', g[0].chats[0].id === 'b', g[0].chats.map((c) => c.id));
}

console.log('Отбор по строке поиска');
{
  const chats: ChatSummary[] = [
    { id: 'a', title: 'покажи дубли', updatedAt: 1, preview: 'Нашёл 3 повтора' },
    { id: 'b', title: 'что не заказано', updatedAt: 2, preview: 'Семь позиций' },
  ];
  check('находит по имени', filterChats(chats, 'дубл').map((c) => c.id).join() === 'a');
  check('находит по ответу', filterChats(chats, 'позиц').map((c) => c.id).join() === 'b');
  check('регистр не мешает', filterChats(chats, 'ДУБЛ').length === 1);
  check('пустой запрос ничего не отсекает', filterChats(chats, '  ').length === 2);
}

if (failed) {
  console.error(`\nПровалено проверок: ${failed}`);
  process.exit(1);
}
console.log('\nВсе проверки истории разговоров пройдены');
