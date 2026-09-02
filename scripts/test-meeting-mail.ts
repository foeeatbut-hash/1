/**
 * Проверки разбора встречи в письме.
 *
 * Ошибка здесь двусторонняя. Пропустить встречу — вернуть человека к ручному
 * переписыванию даты и ссылки, ради чего разбор и делался. Увидеть встречу
 * там, где её нет, — предлагать завести событие в каждом втором письме, после
 * чего предложение перестают читать вовсе.
 *
 * Запуск: npx tsx scripts/test-meeting-mail.ts
 */
import { findMeeting, meetingLink, meetingTime, meetingHint } from '../src/lib/meetingFromMail';

let failed = 0;
const check = (name: string, cond: boolean, got?: unknown) => {
  if (cond) return;
  failed++;
  console.error(`  ✗ ${name}${got === undefined ? '' : ` — получили ${JSON.stringify(got)}`}`);
};

const NOW = new Date(2026, 8, 2, 9, 0); // 2 сентября 2026

console.log('Ссылка на встречу');
{
  check('МТС Линк', meetingLink('подключайтесь https://link.mts.ru/j/8821 ждём') === 'https://link.mts.ru/j/8821');
  check('Телемост', meetingLink('https://telemost.yandex.ru/j/123') === 'https://telemost.yandex.ru/j/123');
  check('Teams', meetingLink('см. https://teams.microsoft.com/l/meetup-join/x').includes('teams.microsoft'));
  check('точка в конце предложения не съедается',
    meetingLink('ссылка https://zoom.us/j/99.') === 'https://zoom.us/j/99');
  check('портал закупок встречей не считается', meetingLink('https://zakupki.gov.ru/223/x') === '');
  check('без ссылок пусто', meetingLink('здравствуйте, коллеги') === '');
}

console.log('Время');
{
  check('10:00', JSON.stringify(meetingTime('начало в 10:00')) === '{"h":10,"m":0}');
  check('9:30', JSON.stringify(meetingTime('в 9:30 по Москве')) === '{"h":9,"m":30}');
  check('через дефис', JSON.stringify(meetingTime('в 14-30 у нас')) === '{"h":14,"m":30}');
  check('3 pm — это пятнадцать', JSON.stringify(meetingTime('at 3 pm')) === '{"h":15,"m":0}');
  check('3 вечера — тоже пятнадцать', JSON.stringify(meetingTime('в 3 вечера')) === '{"h":15,"m":0}');
  check('9 утра', JSON.stringify(meetingTime('в 9 утра')) === '{"h":9,"m":0}');
  check('без времени — ничего', meetingTime('соберёмся на неделе') === null);
  // Номер документа не должен читаться как время
  check('номер документа не время', meetingTime('документ 21.201 согласован') === null, meetingTime('документ 21.201 согласован'));
}

console.log('Встреча целиком');
{
  const m = findMeeting(
    'Добрый день! Приглашаем на совещание 7 сентября в 10:00. Ссылка: https://link.mts.ru/j/8821',
    NOW,
  );
  check('встреча найдена', !!m);
  check('дата и время сошлись',
    !!m && new Date(m.startsAt).getDate() === 7 && new Date(m.startsAt).getHours() === 10,
    m && new Date(m.startsAt).toString());
  check('время именно из письма', !!m?.exactTime);
  check('ссылка подхвачена', m?.joinUrl === 'https://link.mts.ru/j/8821');
  check('уверенность высокая', (m?.score || 0) >= 0.9, m?.score);

  const en = findMeeting('Please join the meeting on 12 September at 3 pm, link: https://teams.microsoft.com/l/x', NOW);
  check('английское письмо разбирается', !!en && new Date(en.startsAt).getHours() === 15, en && new Date(en.startsAt).getHours());

  const noTime = findMeeting('Просим подключиться к совещанию 7 сентября, ссылка https://telemost.yandex.ru/j/1', NOW);
  check('без времени встреча всё равно найдена', !!noTime);
  check('время подставлено и это видно', noTime?.exactTime === false && new Date(noTime!.startsAt).getHours() === 10);

  const noLink = findMeeting('Планёрка 7 сентября в 10:00 в переговорной', NOW);
  check('встреча без ссылки тоже встреча', !!noLink && noLink.joinUrl === '');
}

console.log('Ложные срабатывания');
{
  check('обычное письмо про документы — не встреча',
    findMeeting('Направляем опросный лист АВО-2 на согласование, срок 12 сентября.', NOW) === null);
  check('ссылка без даты и слов — не встреча',
    findMeeting('Наш сайт: https://example.com', NOW) === null);
  check('«созвонимся как-нибудь» — не встреча', findMeeting('созвонимся как-нибудь на неделе', NOW) === null);
  check('пустое письмо', findMeeting('', NOW) === null);
  // Ссылка на встречу в подписи и никакой даты — не повод предлагать событие
  check('подпись со ссылкой не считается',
    findMeeting('С уважением, Иванов\nМой Телемост: https://telemost.yandex.ru/j/777', NOW) === null);
}

console.log('Подпись предложения');
{
  const m = findMeeting('Совещание 7 сентября в 10:00 https://link.mts.ru/j/1', NOW)!;
  check('в подписи есть дата и время', meetingHint(m) === 'Похоже на встречу: 7.09, 10:00 · ссылка есть', meetingHint(m));
  const t = findMeeting('Просим подключиться 7 сентября https://link.mts.ru/j/1', NOW)!;
  check('про подставленное время сказано прямо', meetingHint(t).includes('время не указано'), meetingHint(t));
}

if (failed) {
  console.error(`\nПровалено проверок: ${failed}`);
  process.exit(1);
}
console.log('\nВсе проверки разбора встречи пройдены');
