// Тесты распознавания запросов ИИ-чата: npx tsx scripts/test-assistant.ts
import { resolveQuery, suggestKksLinks } from '../src/store/assistantStore';

let ok = 0, fail = 0; const fails: string[] = [];
const check = (n: string, c: boolean, d?: string) => { if (c) ok++; else { fail++; fails.push(`✗ ${n}${d ? ' — ' + d : ''}`); } };

const DATA: any = {
  projectId: 'p1',
  projects: [{ id: 'p1', name: 'ДГП-2', status: 'active' }],
  tags: [
    { id: 't1', identifier: '3700-K02-HV-209', brand: 'ВР-80', department: 'ОВиК', fluid: 'Воздух', mainName: 'Вентилятор вытяжной', actuality: 'critical', stageId: 'added', stageLabel: 'Добавлен', supplier: '' },
    { id: 't2', identifier: '3700-K02-HV-209', brand: 'ВР-80', department: 'ОВиК', fluid: 'Воздух', mainName: 'Вентилятор вытяжной (дубль)', actuality: 'actual', stageId: 'ordered', stageLabel: 'Заказан', supplier: 'ВЕЗА' },
    { id: 't3', identifier: '3700-C01-AHU-001', brand: 'ВЕРОСА-670', department: 'ОВиК', fluid: 'Воздух', mainName: 'Приточная установка', actuality: 'actual', stageId: 'purchased', stageLabel: 'Куплен', supplier: 'ВЕЗА' },
    { id: 't4', identifier: '3700-V03-KL-011', brand: 'КЛОП-1', department: 'ОВиК', fluid: 'Воздух', mainName: 'Клапан огнезадерживающий', actuality: 'warning', stageId: 'added', stageLabel: 'Добавлен', supplier: '' },
    { id: 't5', identifier: '3700-V03-KL-012', brand: 'КЛОП-1', department: 'ОВиК', fluid: 'Воздух', mainName: '', actuality: 'actual', stageId: 'ordered', stageLabel: 'Заказан', supplier: 'ВЕЗА', connCount: 1 },
  ],
  components: [
    { id: 'c1', name: 'Двигатель вентилятора', itemCode: 'BLM-1', systemName: '3700-C01-AHU-001', category: 'AHU', monoblockName: 'M1', status: 'ok', hasConflict: false, tags: ['3700-C01-AHU-001'] },
  ],
  stages: [{ id: 'added', label: 'Добавлен' }, { id: 'ordered', label: 'Заказан' }, { id: 'approved', label: 'Утверждён' }, { id: 'purchased', label: 'Куплен' }],
  duplicates: [{ code: '3700-K02-HV-209', count: 2, ids: ['t1', 't2'] }],
  notes: [{ id: 'n1', title: 'Подбор калорифера для П1', updatedAt: '' }, { id: 'n2', title: 'Замечания по монтажу', updatedAt: '' }],
  recentLogs: [{ description: 'Обновлены спецификации вентилятора', userName: 'Раупов Х.Х.', targetRoute: '/equipment', createdAt: '' }],
  counts: { tags: 4, components: 1, systems: 1, users: 3, notes: 2, folders: 1, files: 5, projects: 1, duplicates: 1, critical: 1, warning: 1 },
};

const R = (text: string, last: any = null) => resolveQuery(text, false, last, DATA);
const hasAction = (m: any, kind: string) => (m.actions || []).some((a: any) => a.kind === kind);

(async () => {
  // Прямой код тега → карточка + действия
  {
    const { message, result } = await R('где 3700-K02-HV-209');
    check('код: карточка позиции', message.text.includes('3700-K02-HV-209'));
    check('код: кнопка «на холсте»', hasAction(message, 'focus-tag'));
    check('код: кнопка «найти дубли»', hasAction(message, 'find-duplicates'), JSON.stringify(message.actions));
    check('код: сохранён контекст', result?.kind === 'tags');
  }

  // Дубли
  {
    const { message } = await R('покажи дубли');
    check('дубли: найдено', message.text.includes('дублей: 1') || message.text.includes('Нашёл дублей'));
    check('дубли: таблица', !!message.table);
    check('дубли: кнопка «найти на холсте»', hasAction(message, 'find-duplicates'));
  }
  { const { message } = await R('сколько повторов'); check('дубли синоним «повторов»', !!message.table, message.text); }

  // Проблемы / критичные
  {
    const { message } = await R('что требует внимания');
    check('проблемы: список', !!message.table && message.text.includes('внимания'), message.text);
    check('проблемы: критичный+проверить (2)', (message.table?.rows.length || 0) === 2);
  }
  { const { message } = await R('какие косяки'); check('проблемы синоним «косяки»', !!message.table, message.text); }

  // Закупки
  {
    const { message } = await R('что не заказано');
    check('закупки: не заказано (2 в added)', (message.table?.rows.length || 0) === 2, String(message.table?.rows.length));
    check('закупки: кнопка Менеджмент', hasAction(message, 'open-section'));
  }
  { const { message } = await R('что куплено'); check('закупки: куплено (1)', (message.table?.rows.length || 0) === 1, String(message.table?.rows.length)); }
  { const { message } = await R('что в просрочке'); check('закупки синоним «просрочка»', !!message.table, message.text); }

  // Сводка
  {
    const { message } = await R('сводка по проекту');
    check('сводка: показатели', message.text.includes('Тегов: 4') && message.text.includes('внимания'));
  }
  { const { message } = await R('готовность проекта'); check('сводка синоним «готовность»', message.text.includes('Тегов'), message.text); }

  // Поиск заметок
  {
    const { message } = await R('найди заметку про калорифер');
    check('заметки: найдено', message.text.includes('калорифер') || message.text.includes('Нашёл заметок'), message.text);
  }

  // История
  {
    const { message } = await R('что изменилось');
    check('история: последние изменения', message.text.includes('спецификации') || message.text.includes('изменения'), message.text);
  }

  // Поиск тегов по склонению/синониму
  {
    const { message } = await R('покажи вентиляторы');
    check('поиск: вентиляторы (склонение)', !!message.table && (message.table?.rows.length || 0) >= 2, String(message.table?.rows.length));
  }
  {
    const { message } = await R('покажи установки');
    check('поиск: установки', !!message.table, message.text);
  }

  // Навигационные команды
  {
    const { message } = await R('открой менеджмент');
    check('навигация: открой менеджмент', hasAction(message, 'open-section') && message.actions![0].route === '/management');
  }
  {
    const { message } = await R('создай заметку про клапаны');
    check('команда: создать заметку', hasAction(message, 'create-note'));
    check('команда: заголовок заметки', message.actions![0].noteTitle?.includes('клапан'), message.actions![0].noteTitle);
  }

  // Follow-up контекст
  {
    const { message } = await R('а сколько их?', { kind: 'tags', ids: ['t1', 't2', 't3'], label: 'вентиляторы' });
    check('контекст: сколько их → 3', message.text.includes('3'), message.text);
  }
  {
    const { message } = await R('выгрузи', { kind: 'tags', ids: ['t1'], label: 'вентиляторы' });
    check('контекст: выгрузи → кнопки экспорта', hasAction(message, 'export-excel'));
  }

  // Опечатки
  {
    const { message } = await R('пакажи дубли');
    check('опечатка «пакажи» всё равно дубли', !!message.table, message.text);
  }

  // Честное «не знаю»
  {
    const { message } = await R('абырвалг зюзюка мырк пщ');
    check('фоллбэк: три темы', (message.actions?.length || 0) >= 3, JSON.stringify(message.actions?.map((a:any)=>a.label)));
  }

  // ── WOW: массовая смена этапа (превью) ─────────────────────────────────────
  {
    const { message } = await R('переведи клапаны в заказан');
    check('bulk: превью смены этапа', hasAction(message, 'bulk-stage'), message.text);
    const plan = (message.actions || []).find((a: any) => a.kind === 'bulk-stage')?.stagePlan;
    check('bulk: план на клапан (t4)', !!plan && plan.tagIds.includes('t4') && plan.stageId === 'ordered', JSON.stringify(plan));
  }
  {
    const { message } = await R('пометь всё куплено');
    check('bulk: всё в куплено', hasAction(message, 'bulk-stage'), message.text);
  }
  {
    const { message } = await R('как перевести тег в заказан'); // это вопрос, не команда
    check('bulk: «как перевести» → НЕ команда', !hasAction(message, 'bulk-stage'));
  }

  // ── WOW: аудит проекта ─────────────────────────────────────────────────────
  {
    const { message } = await R('аудит проекта');
    check('аудит: свод проблем', message.text.includes('Аудит') && message.text.includes('Дубли'), message.text);
    check('аудит: кнопка плана', hasAction(message, 'ask'));
  }

  // ── WOW: что доделать → чек-лист ───────────────────────────────────────────
  {
    const { message } = await R('что мне доделать');
    check('чек-лист: собран план', message.text.includes('план') || message.text.includes('задач'), message.text);
    check('чек-лист: кнопка в блокнот', hasAction(message, 'checklist-note'));
  }

  // ── WOW: аналитика ─────────────────────────────────────────────────────────
  {
    const { message } = await R('у кого нет поставщика');
    check('аналитика: без поставщика (t1,t4)', (message.table?.rows.length || 0) === 2, String(message.table?.rows.length));
  }
  {
    const { message } = await R('теги без наименования');
    check('аналитика: без наименования', !!message.table, message.text);
  }

  // ── WOW: автосвязывание по KKS ─────────────────────────────────────────────
  {
    const kksTags: any = [
      { id: 'a', identifier: '3700-C01-AHU-001', metadata: '{}' },
      { id: 'b', identifier: '3700-C01-AHU-001-FAN', metadata: '{}' },
      { id: 'c', identifier: '3700-C01-AHU-001-FAN-MTR', metadata: '{}' },
      { id: 'd', identifier: 'X-99', metadata: '{}' },
    ];
    const pairs = suggestKksLinks(kksTags);
    const has = (child: string, parent: string) => pairs.some(p => p.childId === child && p.parentId === parent);
    check('kks: FAN→AHU', has('b', 'a'), JSON.stringify(pairs));
    check('kks: MTR→FAN (ближайший родитель)', has('c', 'b'), JSON.stringify(pairs));
    check('kks: одиночка без родителя', !pairs.some(p => p.childId === 'd'));
  }
  {
    const { message } = await R('свяжи похожие', null);
    // на DATA (без KKS-иерархии) связей нет → сообщение об отсутствии
    check('kks: команда обрабатывается', message.text.length > 0);
  }

  console.log(`\nАссистент: пройдено ${ok}, провалено ${fail}`);
  if (fails.length) { console.log(fails.join('\n')); process.exit(1); }
})();
