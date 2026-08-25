/**
 * Проверки меню «Пуск».
 *
 * Три места, где ошибка не видна глазом: отбор по правам (лишний раздел в меню
 * заметит только тот, у кого его быть не должно), поиск по названию с чужой
 * раскладкой и список недавних, который обязан переживать закрытие раздела.
 */
import {
  groupSections, countFound, allowed, matches, toRu, visibleRecent, RECENT_SHOWN,
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
  // Сам список ведёт рабочий стол; здесь проверяется только то, что меню
  // показывает из него, — и это ровно то место, где ошибка не видна глазом
  const r = visibleRecent(['/users', '/mail', '/нет-такого', '/registry'], S, false);
  check('недоступное по правам выпало', !r.some((s) => s.path === '/users'), r.map((s) => s.path));
  check('несуществующий путь выпал', !r.some((s) => s.path === '/нет-такого'));
  check('порядок сохранён', r.map((s) => s.path).join(',') === '/mail,/registry', r.map((s) => s.path));
  check('администратору свой раздел виден', visibleRecent(['/users'], S, true).length === 1);
  const dup = visibleRecent(['/mail', '/mail', '/registry'], S, false);
  check('повтор не задваивается', dup.length === 2, dup.map((s) => s.path));
  const many = Array.from({ length: RECENT_SHOWN + 4 }, () => '/mail');
  check(`показываем не больше ${RECENT_SHOWN}`, visibleRecent(many, S, false).length <= RECENT_SHOWN);
  check('пустой список не ломает', visibleRecent([], S, false).length === 0);
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
