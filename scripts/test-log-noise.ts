/**
 * Фильтр журнала: проверяем на настоящих строках из журнала программы.
 *
 * Тексты ниже взяты из pdm_action_log собранного exe и из разработки — те же
 * сообщения, только имена служб в собранном виде сжаты. Прошлый фильтр искал
 * несжатое имя и у людей не срабатывал; проверка нужна, чтобы это не повторить
 * молча.
 */
import { isBenignUniverDisposeError, isResizeObserverNoise } from '../src/lib/logNoise.js';

let f = 0;
const ok = (n: string, c: boolean, d?: any) =>
  c ? console.log('  ✓', n) : (f++, console.error('  ✗', n, d !== undefined ? String(d).slice(0, 200) : ''));

console.log('1. Потерянная служба движка при закрытии редактора');
ok('сжатое имя из собранного exe',
  isBenignUniverDisposeError('[redi]: Expect 1 dependency item(s) for id "ps" but get 0. Did you forget to register it?'));
ok('полное имя из разработки',
  isBenignUniverDisposeError('[redi]: Expect 1 dependency item(s) for id "HoverManagerService" but get 0. Did you forget to register it?'));
ok('с приставкой Uncaught Error',
  isBenignUniverDisposeError('Uncaught Error: [redi]: Expect 1 dependency item(s) for id "ps" but get 0.'));

console.log('2. Настоящие поломки фильтр не глотает');
ok('обычная ошибка', !isBenignUniverDisposeError('Cannot read properties of undefined (reading \'body\')'));
ok('другая жалоба redi', !isBenignUniverDisposeError('[redi]: Cannot register the same identifier twice.'));
ok('пусто', !isBenignUniverDisposeError(''));
ok('не строка', !isBenignUniverDisposeError(undefined as any));

console.log('3. Наблюдатель размера');
ok('строка из журнала',
  isResizeObserverNoise('ResizeObserver loop completed with undelivered notifications.'));
ok('второй вид того же предупреждения',
  isResizeObserverNoise('ResizeObserver loop limit exceeded'));
ok('чужая ошибка не подходит', !isResizeObserverNoise('ResizeObserver is not defined'));

console.log(f === 0 ? '\nВСЕ ТЕСТЫ ПРОЙДЕНЫ' : `\nПРОВАЛОВ: ${f}`);
process.exit(f === 0 ? 0 : 1);
