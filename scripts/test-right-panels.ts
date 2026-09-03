/**
 * Правая колонка: панели уживаются друг с другом и не лезут на панель задач.
 *
 * Проверка написана по двум жалобам владельца. Панели накрывали панель задач —
 * то есть часы, календарь и значки трея, ровно то, ради чего она нужна. И они
 * не умели быть открытыми одновременно: открытие одной закрывало другую, и
 * человек, читавший уведомление и решивший спросить помощника, терял
 * уведомление из виду.
 *
 * Ошибка в раскладке не падает и не мигает — она тихо отрезает кусок экрана.
 * Поэтому правила проверяются здесь, а не глазами.
 *
 * Запуск: npx tsx scripts/test-right-panels.ts
 */
import {
  dockPlan, clampSplit, partHeights, openPanel, closePanel, togglePanel,
  panelTitle, NARROW_W, MIN_PART, type PanelId,
} from '../src/lib/rightPanels';

let failed = 0;
const check = (name: string, cond: boolean, got?: unknown) => {
  if (cond) return;
  failed++;
  console.error(`  ✗ ${name}${got === undefined ? '' : ` — получили ${JSON.stringify(got)}`}`);
};

const N: PanelId = 'notifications';
const A: PanelId = 'assistant';

console.log('Очередь открытых панелей');
{
  check('открытая встаёт в очередь', openPanel([], N).length === 1);
  check('вторая открывается, не закрывая первую', openPanel([N], A).join() === 'notifications,assistant');
  check('повторное открытие не двоит', openPanel([N], N).length === 1);
  check('закрытие убирает только своё', closePanel([N, A], N).join() === 'assistant');
  check('нажатие по открытой закрывает', togglePanel([N, A], A).join() === 'notifications');
  check('нажатие по закрытой открывает', togglePanel([N], A).join() === 'notifications,assistant');
}

console.log('Кто где стоит');
{
  const one = dockPlan([N], 1600);
  check('одна панель занимает колонку целиком', one.split === 1 && !one.tabs, one);

  const two = dockPlan([N, A], 1600);
  check('открытая раньше стоит выше', two.order[0] === N, two.order);
  check('на широком экране делятся по высоте', !two.tabs, two);

  const other = dockPlan([A, N], 1600);
  check('порядок именно открытия, а не постоянный', other.order[0] === A, other.order);

  check('пустая колонка никого не показывает', dockPlan([], 1600).order.length === 0);
  check('и активной вкладки у неё нет', dockPlan([], 1600).active === null);
}

console.log('Узкий экран: вкладки вместо деления');
{
  const narrow = dockPlan([N, A], NARROW_W - 1);
  check('делить не пытаемся', narrow.tabs, narrow);
  check('показана последняя открытая — та, которую человек хотел видеть',
    narrow.active === A, narrow.active);
  check('одна панель на узком экране вкладками не становится',
    !dockPlan([N], 800).tabs);
  check('у вкладок есть человеческие названия',
    panelTitle(N) === 'Уведомления' && panelTitle(A) === 'Помощник');
}

console.log('Разделитель не даёт схлопнуть панель в ничто');
{
  const h = 800;
  // Спрашиваем в точках, а не в долях: доля 0.8 при высоте 800 даёт «159.999…»
  // из-за счёта дробей, и придираться к этому бессмысленно — на экране точки
  check('крайнее положение сверху ограничено', partHeights(h, 0.01).top >= MIN_PART, partHeights(h, 0.01));
  check('крайнее положение снизу ограничено', partHeights(h, 0.99).bottom >= MIN_PART, partHeights(h, 0.99));
  check('обычное положение не трогаем', Math.abs(clampSplit(0.5, h) - 0.5) < 0.001);
  check('чепуха вместо доли не роняет расчёт', clampSplit(NaN, h) > 0 && clampSplit(NaN, h) < 1);

  // Колонка ниже двух минимумов: делить нечего, отдаём поровну
  const tiny = clampSplit(0.1, 200);
  check('в низкой колонке делим поровну', Math.abs(tiny - 0.5) < 0.001, tiny);

  const parts = partHeights(h, 0.5);
  check('высоты складываются в колонку целиком', parts.top + parts.bottom === h, parts);
  check('верх и низ примерно поровну', Math.abs(parts.top - parts.bottom) <= 1, parts);
}

if (failed) {
  console.error(`\nПровалено проверок: ${failed}`);
  process.exit(1);
}
console.log('\nВсе проверки правой колонки пройдены');
