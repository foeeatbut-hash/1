/**
 * Проверки разбора «сохранил поверх чужой правки».
 *
 * Это ровно тот класс ошибок, ради которого проверки и пишутся: сохранение
 * поверх свежей книги ничем себя не выдаёт — ошибки нет, всё «сохранено», а
 * ведомость молча вернулась к состоянию недельной давности. Поэтому здесь
 * проверяется, что расхождение считается расхождением во всех видах, в каких
 * оно приходит: строкой, датой, миллисекундами.
 */
import { isStale, agoLabel, conflictText, CONFLICT_CHOICES } from '../src/lib/docConflict';

let failed = 0;
const check = (name: string, cond: boolean, got?: unknown) => {
  if (cond) return;
  failed++;
  console.error(`  ✗ ${name}${got === undefined ? '' : ` — получили ${JSON.stringify(got)}`}`);
};

const T1 = '2026-08-26T10:00:00.000Z';
const T2 = '2026-08-26T10:00:05.000Z';

console.log('Что считается расхождением');
{
  check('то же время — не конфликт', !isStale(T1, T1));
  check('другое время — конфликт', isStale(T1, T2));
  check('разница в миллисекунду — тоже конфликт',
    isStale('2026-08-26T10:00:00.000Z', '2026-08-26T10:00:00.001Z'));
  check('та же дата в другом виде — не конфликт', !isStale(T1, '2026-08-26T13:00:00.000+03:00'));
  // Старый клиент базы не присылает: остановить ему работу нельзя
  check('нет базы — записываем как раньше', !isStale(null, T2));
  check('нет базы (пусто) — записываем', !isStale('', T2));
  check('сервер без времени — не выдумываем конфликт', !isStale(T1, null));
}

console.log('Сколько прошло');
{
  const now = new Date('2026-08-26T12:00:00.000Z');
  const back = (min: number) => new Date(now.getTime() - min * 60000).toISOString();
  check('только что', agoLabel(back(0.5), now) === 'только что', agoLabel(back(0.5), now));
  check('минуту назад', agoLabel(back(1), now) === 'минуту назад');
  check('3 минуты назад', agoLabel(back(3), now) === '3 минуты назад', agoLabel(back(3), now));
  check('20 минут назад', agoLabel(back(20), now) === '20 минут назад');
  check('час назад', agoLabel(back(60), now) === 'час назад');
  check('3 часа назад', agoLabel(back(180), now) === '3 часа назад');
  check('10 часов назад', agoLabel(back(600), now) === '10 часов назад');
  check('вчера', agoLabel(back(60 * 26), now) === 'вчера', agoLabel(back(60 * 26), now));
  check('несколько дней', agoLabel(back(60 * 24 * 3), now) === '3 дн. назад');
  check('без времени не роняет', agoLabel(null, now) === 'неизвестно когда');
  check('мусор не роняет', agoLabel('не дата', now) === 'неизвестно когда');
}

console.log('Что написано в разборе');
{
  const now = new Date('2026-08-26T12:00:00.000Z');
  const at = new Date(now.getTime() - 3 * 60000).toISOString();
  const other = conflictText({ who: 'Иванов И.И.', at }, 'Раупов Х.Х.', now);
  check('назван коллега', other.includes('Иванов И.И. менял его'), other);
  check('и когда', other.includes('3 минуты назад'), other);
  check('сказано, что правка не записана', other.includes('никуда не записана'), other);
  // Своё же окно называется своим, иначе человек ищет виноватого коллегу
  const mine = conflictText({ who: 'Раупов Х.Х.', at }, 'Раупов Х.Х.', now);
  check('своя правка названа своей', mine.startsWith('Вы меняли его в другом окне'), mine);
  const nobody = conflictText({ who: '', at: null }, 'Раупов Х.Х.', now);
  check('без имени не пусто', nobody.startsWith('Кто-то менял его'), nobody);
}

console.log('Выходы из конфликта');
{
  check('их три', CONFLICT_CHOICES.length === 3);
  // Первым стоит то, что ничего не теряет: человек читает сверху вниз
  check('сначала безопасное', CONFLICT_CHOICES[0].id === 'copy', CONFLICT_CHOICES.map((c) => c.id));
  check('последним — то, что теряет свою правку', CONFLICT_CHOICES[2].id === 'theirs');
  check('у каждого сказано, чем обернётся', CONFLICT_CHOICES.every((c) => c.hint.length > 10));
  check('«оставить своё» обещает историю версий', CONFLICT_CHOICES.find((c) => c.id === 'mine')!.hint.includes('истори'));
  check('«взять его» честно говорит о потере', CONFLICT_CHOICES.find((c) => c.id === 'theirs')!.hint.includes('потерян'));
}

if (failed) {
  console.error(`\nПровалено проверок: ${failed}`);
  process.exit(1);
}
console.log('\nВсе проверки разбора конфликта пройдены');
