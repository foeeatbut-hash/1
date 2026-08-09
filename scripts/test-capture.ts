/**
 * Проверка разбора захвата. Запуск: npx tsx scripts/test-capture.ts
 *
 * Проверяем то, что легко сломать незаметно: образец кода, схлопывание
 * повторов, отсев номеров страниц и восемь классов конфликтов.
 */
import { recognize, buildShape, shapeRegex, normCode, mixedScript, CaptureItem } from '../src/capture/recognize';
import { buildPlan, ExistingTag } from '../src/capture/plan';

let ok = 0, fail = 0;
const eq = (name: string, got: any, want: any) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) { ok++; return; }
  fail++;
  console.log(`  ✗ ${name}\n      получено: ${a}\n      ожидалось: ${b}`);
};

const item = (text: string, kind: CaptureItem['kind'] = 'text', html = ''): CaptureItem =>
  ({ kind, text, html, image: '', truncated: 0, at: Date.now() });

const PROJECT = ['AHU-2', 'AHU-3', 'P-101A', 'FAN-07', 'V-12', 'V-13', 'CP-9'];

console.log('Образец кода');
{
  const shape = buildShape(PROJECT);
  const re = shapeRegex(shape);
  eq('свой код подходит', re.test('AHU-5'), true);
  eq('код с буквенным хвостом подходит', re.test('P-202B'), true);
  eq('«стр. 4» не подходит под образец', re.test('стр. 4'), false);
  eq('образец построен на семи тегах', shape.fromCount, 7);
  eq('пустой проект — общий образец', buildShape([]).fromCount, 0);
}

console.log('Сплошной текст');
{
  const raw = 'Перечень позиций:\nAHU-2  AHU-3  P-101A  P-101B  P-101C\n'
    + 'FAN-07  FAN-08  FAN-07  V-12  V-13\nCP-1\nстр. 4';
  const rec = recognize([item(raw)], PROJECT);
  eq('нашлось десять уникальных кодов', rec.rows.length, 10);
  eq('повтор FAN-07 схлопнут', rec.collapsed, 1);
  eq('у FAN-07 два фрагмента в исходнике', rec.rows.find(r => r.identifier === 'FAN-07')!.spans.length, 2);
  eq('«стр. 4» отброшено', rec.junk.map(j => j.code), ['стр. 4']);
  eq('режим — список', rec.mode, 'list');

  // Границы фрагментов обязаны указывать на сам код, иначе подсветка врёт
  const row = rec.rows.find(r => r.identifier === 'P-101A')!;
  eq('фрагмент указывает на код', raw.slice(row.spans[0].start, row.spans[0].end), 'P-101A');
}

console.log('Код с пробелом внутри не рвётся');
{
  const rec = recognize([item('У-1 приток\nУ-2 вытяжка')], ['У-1', 'У-2', 'У-3']);
  eq('коды взяты целиком', rec.rows.map(r => r.identifier), ['У-1', 'У-2']);
}

console.log('Таблица из буфера');
{
  const html = '<table><tr><th>Код тега</th><th>Марка</th></tr>'
    + '<tr><td>AHU-9</td><td>ВЕЗА КЦКП</td></tr>'
    + '<tr><td>AHU-9</td><td>повтор</td></tr>'
    + '<tr><td>FAN-11</td><td>НЕД</td></tr></table>';
  // DOMParser в узле нет — проверяем ветку с табуляциями, она равносильна
  const tsv = 'Код тега\tМарка\nAHU-9\tВЕЗА КЦКП\nAHU-9\tповтор\nFAN-11\tНЕД';
  const rec = recognize([item(tsv, 'table')], PROJECT);
  eq('режим — таблица', rec.mode, 'table');
  eq('колонка марки распозналась', rec.rows[0].brand, 'ВЕЗА КЦКП');
  eq('строк без повтора', rec.rows.length, 2);
  eq('повтор в таблице схлопнут', rec.collapsed, 1);
  void html;
}

console.log('Раскладка и нормализация');
{
  // Опасны именно неотличимые на глаз буквы: русская А и латинская A.
  // Русская «В» похожа на латинскую «B», а не на «V» — это разные случаи
  eq('русская А сводится к латинской A', normCode('АHU-2'), normCode('AHU-2'));
  eq('русская В сводится к латинской B', normCode('ВOP-1'), normCode('BOP-1'));
  eq('русская В и латинская V — разные', normCode('В-12') === normCode('V-12'), false);
  eq('регистр и дефисы не мешают', normCode('ahu 2'), normCode('AHU-2'));
  eq('смешанная раскладка ловится', mixedScript('АHU-2'), true);
  eq('чистая латиница не ловится', mixedScript('AHU-2'), false);
}

console.log('Классы конфликтов');
{
  const existing: ExistingTag[] = [
    { id: '1', identifier: 'AHU-2', brand: 'ВЕЗА КЦКП' },
    { id: '2', identifier: 'V-13', brand: null },
    { id: '3', identifier: 'V-12', brand: 'Belimo' },
    { id: '4', identifier: 'FAN-07', brand: 'НЕД' },
  ];
  const shape = buildShape(existing.map(e => e.identifier));
  const rows = [
    { key: 'a', identifier: 'AHU-9', verdict: 'fits' as const, spans: [] },
    { key: 'b', identifier: 'AHU-2', brand: 'Systemair', verdict: 'fits' as const, spans: [] },
    { key: 'c', identifier: 'V-13', brand: 'Belimo', verdict: 'fits' as const, spans: [] },
    { key: 'd', identifier: 'FAN-07', verdict: 'fits' as const, spans: [] },
    { key: 'e', identifier: 'АHU-2', verdict: 'fits' as const, spans: [] },      // русская А, неотличима на глаз
    { key: 'f', identifier: 'ahu 2', verdict: 'fits' as const, spans: [] },      // регистр и пробел
    { key: 'g', identifier: 'ЩИТОК-777777', verdict: 'doubt' as const, spans: [] },
  ];
  const plan = buildPlan(rows as any, existing, shape);
  const cls = Object.fromEntries(plan.map(p => [p.key, p.cls]));
  const act = Object.fromEntries(plan.map(p => [p.key, p.action]));

  eq('новый код', cls.a, 'new');
  eq('расхождение полей', cls.b, 'exactDiff');
  eq('расхождение не перетирает чужое', act.b, 'skip');
  eq('есть чем дополнить', cls.c, 'exactFill');
  eq('дополняем только пустые', act.c, 'fill');
  eq('дубль без нового', cls.d, 'exactSame');
  eq('дубль без нового пропускаем', act.d, 'skip');
  eq('русская буква в коде', cls.e, 'layoutAlike');
  eq('привязываем к существующему', act.e, 'link');
  eq('регистр и разделители', cls.f, 'caseAlike');
  eq('не похож на теги проекта', cls.g, 'offShape');
  eq('сомнительный не отмечен', plan.find(p => p.key === 'g')!.on, false);
  eq('дубль без нового тоже не отмечен', plan.find(p => p.key === 'd')!.on, false);
  eq('новый отмечен', plan.find(p => p.key === 'a')!.on, true);

  // Опечатка в буквах при том же номере — это промах пальцами
  const typo = buildPlan(
    [{ key: 'z', identifier: 'AUH-2', verdict: 'fits', spans: [] }] as any,
    [{ id: '9', identifier: 'AHU-2' }], shape,
  );
  eq('перестановка букв ловится', typo[0].cls, 'fuzzyAlike');

  // А вот разные номера — разные аппараты, и связывать их нельзя
  const other = buildPlan(
    [{ key: 'y', identifier: 'AHU-21', verdict: 'fits', spans: [] }] as any,
    [{ id: '8', identifier: 'AHU-211' }], shape,
  );
  eq('разные номера не считаются похожими', other[0].cls, 'new');
  eq('и создаются как новый тег', other[0].action, 'create');
}

console.log(`\n${ok} проверок пройдено, ${fail} провалено`);
process.exit(fail ? 1 : 0);
