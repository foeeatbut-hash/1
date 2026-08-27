/**
 * Проверки центра уведомлений.
 *
 * Тут ошибаются тихо и дорого: отложенное, вернувшееся не в тот час, приходит
 * тогда, когда уже поздно, а всплывашка, показанная второй раз, приучает
 * закрывать уведомления не глядя — и следующее, важное, закроют тоже.
 *
 * Запуск: npx tsx scripts/test-notify.ts
 */
import {
  SNOOZE_CHOICES, QUIET_CHOICES, snoozeUntil, quietUntil, isQuiet, untilLabel,
  visibleNow, dueSnoozed, freshOnes, groupByDay, personalGroups, appOf,
} from '../src/lib/notifCenter';

let failed = 0;
const check = (name: string, cond: boolean, got?: unknown) => {
  if (cond) return;
  failed++;
  console.error(`  ✗ ${name}${got === undefined ? '' : ` — получили ${JSON.stringify(got)}`}`);
};

// Четверг, 27 августа 2026, 14:00
const NOW = new Date(2026, 7, 27, 14, 0, 0, 0).getTime();
const n = (id: string, over: Partial<any> = {}) => ({
  id, category: 'ЧАТ', title: `Сообщение ${id}`, body: '', targetRoute: '/chat?from=u1',
  isRead: false, createdAt: new Date(NOW).toISOString(), ...over,
});

console.log('Отложить');
{
  check('выбор короткий', SNOOZE_CHOICES.length === 4, SNOOZE_CHOICES.length);
  check('15 минут — это 15 минут', snoozeUntil('15m', NOW) === NOW + 900000);
  check('час — это час', snoozeUntil('1h', NOW) === NOW + 3600000);
  const ev = new Date(snoozeUntil('evening', NOW));
  check('«к вечеру» — сегодня в 18:00', ev.getHours() === 18 && ev.getDate() === 27, ev.toString());
  const late = new Date(snoozeUntil('evening', new Date(2026, 7, 27, 19, 0).getTime()));
  check('вечером «к вечеру» — уже завтра', late.getDate() === 28 && late.getHours() === 18, late.toString());
  const tm = new Date(snoozeUntil('tomorrow', NOW));
  check('«завтра утром» — завтра в 9', tm.getDate() === 28 && tm.getHours() === 9, tm.toString());
}

console.log('Тихий режим');
{
  check('выбора три', QUIET_CHOICES.length === 3);
  check('на час', quietUntil('1h', NOW) === NOW + 3600000);
  const today = new Date(quietUntil('today', NOW));
  check('до конца дня — сегодня в 23:59', today.getDate() === 27 && today.getHours() === 23, today.toString());
  check('тихо, пока не вышло время', isQuiet(NOW + 1000, NOW));
  check('вышло время — снова слышно', !isQuiet(NOW - 1000, NOW));
  check('невыставленный тихий режим — не тихо', !isQuiet(null, NOW));
  check('подпись про сегодня', untilLabel(new Date(2026, 7, 27, 15, 40).getTime(), NOW) === 'до 15:40',
    untilLabel(new Date(2026, 7, 27, 15, 40).getTime(), NOW));
  check('подпись про завтра',
    untilLabel(new Date(2026, 7, 28, 9, 0).getTime(), NOW) === 'до завтра, 09:00');
}

console.log('Что показывать сейчас');
{
  const list = [n('a'), n('b'), n('c')];
  const snoozed = { b: NOW + 60000, c: NOW - 60000 };
  const shown = visibleNow(list, snoozed, NOW);
  check('отложенное спрятано', !shown.some((x) => x.id === 'b'), shown.map((x) => x.id));
  check('вышедшее из отсрочки вернулось', shown.some((x) => x.id === 'c'), shown.map((x) => x.id));
  check('остальное на месте', shown.some((x) => x.id === 'a'));
  check('вернувшееся находится по времени', dueSnoozed(snoozed, NOW).join() === 'c', dueSnoozed(snoozed, NOW));
}

console.log('Всплывашка только новому');
{
  const prev = new Set(['a']);
  const fresh = freshOnes(prev, [n('a'), n('b'), n('c', { isRead: true })]);
  check('старое второй раз не всплывает', !fresh.some((x) => x.id === 'a'), fresh.map((x) => x.id));
  check('новое всплывает', fresh.some((x) => x.id === 'b'));
  check('прочитанное не всплывает', !fresh.some((x) => x.id === 'c'));
  check('первый заход не показывает всё разом',
    freshOnes(new Set(['a', 'b']), [n('a'), n('b')]).length === 0);
}

console.log('Группы');
{
  const days = groupByDay([
    { createdAt: new Date(NOW).toISOString() },
    { createdAt: new Date(NOW - 86400000).toISOString() },
    { createdAt: new Date(NOW - 5 * 86400000).toISOString() },
    { createdAt: '' },
  ], NOW);
  check('сегодня, вчера, дата и «Ранее»',
    days.map((g) => g.title).join('|').startsWith('Сегодня|Вчера|'), days.map((g) => g.title));
  check('«Ранее» — для записей без даты', days.some((g) => g.title === 'Ранее'));

  const groups = personalGroups([n('a'), n('b', { category: 'ДОКУМЕНТЫ' }), n('c', { category: 'НЕЧТО' })]);
  check('порядок подразделов задан списком', groups[0].key === 'ДОКУМЕНТЫ', groups.map((g) => g.key));
  check('незнакомая категория уходит в «Прочее»', groups.some((g) => g.key === 'ПРОЧЕЕ'));
  check('пустых подразделов нет', groups.every((g) => g.items.length > 0));
}

console.log('Чья это программа');
{
  check('по адресу перехода', appOf(n('a')) === '/chat');
  check('без адреса — по категории', appOf(n('b', { targetRoute: '', category: 'ЧАТ' })) === '/chat');
  check('документы ведут в Менеджмент', appOf(n('c', { targetRoute: '', category: 'ДОКУМЕНТЫ' })) === '/management');
  check('решётка адресом не считается', appOf(n('d', { targetRoute: '#', category: 'СИСТЕМА' })) === '/');
}

console.log(failed === 0 ? '\nВсе проверки центра уведомлений пройдены' : `\nПровалено: ${failed}`);
process.exit(failed === 0 ? 0 : 1);
