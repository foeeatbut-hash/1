/**
 * Кучки сообщений в переписке.
 *
 * Разметка решает, где написать имя, где нарисовать кружок отправителя и где
 * поставить дату. Ошибка здесь не падает и не бросается в глаза на трёх
 * сообщениях — она проявляется на длинной переписке тем, что имя пишется у
 * каждой реплики или не пишется вовсе.
 *
 * Запуск: npx tsx scripts/test-chat-grouping.ts
 */
import { markGroups, dayLabelOf, timeOf } from '../src/components/chat/grouping';

let bad = 0;
const ok = (name: string, cond: boolean, got?: any) =>
  cond ? console.log('  ✓', name) : (bad++, console.error('  ✗', name, got !== undefined ? JSON.stringify(got) : ''));

const NOW = new Date('2026-08-21T12:00:00');
const at = (iso: string) => new Date(iso).toISOString();
const msg = (id: string, senderId: string, iso: string) => ({ id, senderId, createdAt: at(iso) });

console.log('1. Подряд идущие сообщения одного человека');
{
  const list = [
    msg('1', 'a', '2026-08-21T10:00:00'),
    msg('2', 'a', '2026-08-21T10:01:00'),
    msg('3', 'a', '2026-08-21T10:02:00'),
  ];
  const m = markGroups(list, NOW);
  ok('имя пишется только у первого', [m[0].first, m[1].first, m[2].first].join() === 'true,false,false', m);
  ok('кружок рисуется только у последнего', [m[0].last, m[1].last, m[2].last].join() === 'false,false,true', m);
}

console.log('\n2. Кучка рвётся');
{
  const list = [
    msg('1', 'a', '2026-08-21T10:00:00'),
    msg('2', 'b', '2026-08-21T10:01:00'),
  ];
  const m = markGroups(list, NOW);
  ok('на смене отправителя', m[0].last && m[1].first, m);
}
{
  const list = [
    msg('1', 'a', '2026-08-21T10:00:00'),
    msg('2', 'a', '2026-08-21T10:20:00'),
  ];
  const m = markGroups(list, NOW);
  ok('на паузе больше пяти минут', m[0].last && m[1].first, m);
}
{
  const list = [
    msg('1', 'a', '2026-08-21T10:00:00'),
    msg('2', 'a', '2026-08-21T10:04:00'),
  ];
  const m = markGroups(list, NOW);
  ok('на паузе в четыре минуты не рвётся', !m[0].last && !m[1].first, m);
}
{
  // Полночь: сообщения рядом по времени, но день разный
  const list = [
    msg('1', 'a', '2026-08-20T23:59:00'),
    msg('2', 'a', '2026-08-21T00:01:00'),
  ];
  const m = markGroups(list, NOW);
  ok('на смене суток рвётся даже через две минуты', m[1].newDay && m[1].first && m[0].last, m);
}

console.log('\n3. Дата');
{
  const m = markGroups([msg('1', 'a', '2026-08-21T09:00:00')], NOW);
  ok('дата ставится перед первым сообщением списка', m[0].newDay, m);
  ok('сегодня называется «Сегодня»', m[0].dayLabel === 'Сегодня', m[0].dayLabel);
}
{
  ok('вчера называется «Вчера»', dayLabelOf(at('2026-08-20T09:00:00'), NOW) === 'Вчера',
    dayLabelOf(at('2026-08-20T09:00:00'), NOW));
  const old = dayLabelOf(at('2026-03-14T09:00:00'), NOW);
  ok('давняя дата — числом и месяцем без года', old === '14 марта', old);
  const older = dayLabelOf(at('2025-03-14T09:00:00'), NOW);
  ok('дата прошлого года — с годом', /2025/.test(older), older);
}

console.log('\n4. Время в углу пузыря');
{
  const t = timeOf(at('2026-08-21T09:07:00'));
  ok('часы и минуты с ведущим нулём', t === '09:07', t);
}

console.log('\n5. Пустая переписка');
{
  ok('пустой список не ломает разметку', markGroups([], NOW).length === 0, true);
}

console.log(bad === 0 ? '\nВСЕ ПРОВЕРКИ ПРОЙДЕНЫ' : `\nПРОВАЛОВ: ${bad}`);
process.exit(bad === 0 ? 0 : 1);
