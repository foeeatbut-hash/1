/**
 * Проверки меню «Пуск».
 *
 * Три места, где ошибка не видна глазом: отбор по правам (лишний раздел в меню
 * заметит только тот, у кого его быть не должно), поиск по названию с чужой
 * раскладкой и список недавних, который обязан переживать закрытие раздела.
 */
import {
  groupSections, countFound, allowed, matches, toRu,
  pushRecent, readRecent, writeRecent, recentSections, RECENT_MAX,
  type StartSource,
} from '../src/lib/startMenu';
import { SECTIONS } from '../src/workspace/sections';

let failed = 0;
const check = (name: string, cond: boolean, got?: unknown) => {
  if (cond) return;
  failed++;
  console.error(`  ✗ ${name}${got === undefined ? '' : ` — получили ${JSON.stringify(got)}`}`);
};

const S: StartSource[] = [
  { path: '/', title: 'Главная', scope: 'mixed' },
  { path: '/registry', title: 'Теги', scope: 'project' },
  { path: '/equipment', title: 'Оборудование', scope: 'project' },
  { path: '/explorer', title: 'Проводник', scope: 'global' },
  { path: '/mail', title: 'Почта', scope: 'global' },
  { path: '/settings', title: 'Настройки', scope: 'mixed' },
  { path: '/users', title: 'Сотрудники', scope: 'global', adminOnly: true },
];

console.log('Права');
{
  check('обычному сотруднику не видно админский раздел', !allowed(S, false).some((s) => s.path === '/users'));
  check('администратору видно', allowed(S, true).some((s) => s.path === '/users'));
  const g = groupSections(S, false);
  check('в группах нет админского', !g.some((x) => x.items.some((i) => i.path === '/users')));
}

console.log('Группы');
{
  const g = groupSections(S, true);
  check('две группы: проектная и общая', g.map((x) => x.id).join(',') === 'project,global', g.map((x) => x.id));
  check('Теги в проектной', g[0].items.some((i) => i.path === '/registry'));
  check('Почта в общей', g[1].items.some((i) => i.path === '/mail'));
  const flat = g.flatMap((x) => x.items.map((i) => i.path));
  check('смешанные в группы не попали', !flat.includes('/') && !flat.includes('/settings'), flat);
  const empty = groupSections([{ path: '/a', title: 'А', scope: 'global' }], false);
  check('пустая группа не показывается', empty.length === 1 && empty[0].id === 'global');
}

console.log('Поиск');
{
  check('точное вхождение', matches('Оборудование', 'обор'));
  check('регистр не важен', matches('Оборудование', 'ОБОР'));
  check('пустой запрос пропускает всё', matches('Что угодно', '   '));
  check('чужое не находится', !matches('Теги', 'почта'));
  check('раскладка: ntub → теги', toRu('ntub') === 'теги', toRu('ntub'));
  check('поиск понимает чужую раскладку', matches('Теги', 'ntub'));
  check('раскладка не ломает обычный запрос', matches('Почта', 'почт'));
  const g = groupSections(S, true, 'по');
  check('поиск сузил список', countFound(g) === 1, g.flatMap((x) => x.items.map((i) => i.title)));
  check('ничего не нашлось — групп нет', countFound(groupSections(S, true, 'ъъъ')) === 0);
}

console.log('Недавние');
{
  let l: string[] = [];
  l = pushRecent(l, '/mail');
  l = pushRecent(l, '/registry');
  check('последний открытый — первый в списке', l[0] === '/registry', l);
  l = pushRecent(l, '/mail');
  check('повтор поднимается наверх, а не задваивается', l.join(',') === '/mail,/registry', l);
  let long: string[] = [];
  for (let i = 0; i < RECENT_MAX + 4; i++) long = pushRecent(long, `/p${i}`);
  check(`длина ограничена ${RECENT_MAX}`, long.length === RECENT_MAX, long.length);
  check('вытесняется самый старый', !long.includes('/p0'));

  // Хранилище: подделка вместо localStorage, чтобы проверка не зависела от среды
  const box: Record<string, string> = {};
  const fake = { getItem: (k: string) => box[k] ?? null, setItem: (k: string, v: string) => { box[k] = v; } };
  writeRecent(fake, ['/mail', '/registry']);
  check('прочиталось то, что записали', readRecent(fake).join(',') === '/mail,/registry');
  check('сломанное значение не роняет чтение', (() => { box['flux_recent_sections'] = '{не json'; return readRecent(fake).length === 0; })());
  check('без хранилища не падает', readRecent(null).length === 0 && (writeRecent(null, ['/a']), true));

  const r = recentSections(['/users', '/mail', '/нет-такого'], S, false);
  check('недоступное по правам выпало из недавних', r.map((s) => s.path).join(',') === '/mail', r.map((s) => s.path));
  check('несуществующий путь выпал', !r.some((s) => s.path === '/нет-такого'));
}

console.log('Настоящий реестр');
{
  const g = groupSections(SECTIONS as any, false);
  check('обычный сотрудник видит разделы', countFound(g) > 5, countFound(g));
  const admin = groupSections(SECTIONS as any, true);
  check('администратору видно больше', countFound(admin) > countFound(g));
  check('у всех показанных есть название', g.every((x) => x.items.every((i) => !!i.title)));
}

if (failed) {
  console.error(`\nПровалено проверок: ${failed}`);
  process.exit(1);
}
console.log('\nВсе проверки меню «Пуск» пройдены');
