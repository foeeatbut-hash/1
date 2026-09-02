/**
 * Проверки вкладок Проводника.
 *
 * Ломается это незаметно: закрыли вкладку — показалась не соседняя, а первая
 * попавшаяся; вернулись в программу — вкладки на месте, но безымянные. Ни то
 * ни другое не падает, и человек списывает это на «программа опять куда-то
 * ушла».
 *
 * Запуск: npx tsx scripts/test-explorer-tabs.ts
 */
import {
  makeTab, safeTabs, activeOf, closeTab, openInTab, moveActive, reorder, ROOT_NAME,
} from '../src/lib/explorerTabs';

let failed = 0;
const check = (name: string, cond: boolean, got?: unknown) => {
  if (cond) return;
  failed++;
  console.error(`  ✗ ${name}${got === undefined ? '' : ` — получили ${JSON.stringify(got)}`}`);
};

console.log('Состав');
{
  check('вкладка по умолчанию — корень', makeTab().folderId === null && makeTab().name === ROOT_NAME);
  check('пустой список даёт одну вкладку', safeTabs([]).length === 1);
  check('мусор в списке не проходит', safeTabs([null as any, undefined as any]).length === 1);
  const t1 = makeTab(null, 'Проводник');
  const t2 = makeTab('f2', 'Чертежи');
  check('идентификаторы разные', t1.id !== t2.id);
  check('сбитый указатель — первая вкладка', activeOf([t1, t2], 'нет такой').id === t1.id);
}

console.log('Открытие');
{
  const t1 = makeTab(null, 'Проводник');
  const first = openInTab([t1], 'f2', 'Чертежи');
  check('новая папка — новая вкладка', first.tabs.length === 2 && first.activeId === first.tabs[1].id);
  const again = openInTab(first.tabs, 'f2', 'Чертежи');
  check('та же папка не плодит близнецов', again.tabs.length === 2, again.tabs.length);
  check('переходим на уже открытую', again.activeId === first.tabs[1].id);
}

console.log('Закрытие');
{
  const a = makeTab('f1', 'Один');
  const b = makeTab('f2', 'Два');
  const c = makeTab('f3', 'Три');

  const mid = closeTab([a, b, c], b.id, b.id);
  check('после закрытой показывается соседняя справа', mid.activeId === c.id, mid.activeId);
  check('вкладок стало меньше на одну', mid.tabs.length === 2);

  const last = closeTab([a, b, c], c.id, c.id);
  check('у последней справа показывается левая', last.activeId === b.id, last.activeId);

  const other = closeTab([a, b, c], a.id, c.id);
  check('закрытие чужой вкладки не меняет показанную', other.activeId === c.id);

  const only = closeTab([a], a.id, a.id);
  check('последняя вкладка не закрывается', only.tabs.length === 1 && only.activeId === a.id);

  const missing = closeTab([a, b], 'нет', a.id);
  check('закрытие несуществующей ничего не ломает', missing.tabs.length === 2 && missing.activeId === a.id);
}

console.log('Переходы и порядок');
{
  const a = makeTab('f1', 'Один');
  const b = makeTab('f2', 'Два');
  const moved = moveActive([a, b], b.id, 'f9', 'Девять');
  check('показанная вкладка запомнила папку', moved[1].folderId === 'f9' && moved[1].name === 'Девять');
  check('соседняя не тронута', moved[0].folderId === 'f1');
  const noName = moveActive([a], a.id, null, '');
  check('без имени вкладка называется корнем', noName[0].name === ROOT_NAME);

  const c = makeTab('f3', 'Три');
  const order = reorder([a, b, c], 0, 2);
  check('вкладку можно переставить', order.map((t) => t.folderId).join(',') === 'f2,f3,f1', order.map((t) => t.folderId));
  check('перестановка на своё место ничего не меняет', reorder([a, b, c], 1, 1)[1].id === b.id);
  check('перестановка за пределы не ломает', reorder([a, b, c], 0, 99).length === 3);
}

if (failed) {
  console.error(`\nПровалено проверок: ${failed}`);
  process.exit(1);
}
console.log('\nВсе проверки вкладок Проводника пройдены');
