/**
 * Проверка разбора захвата. Запуск: npx tsx scripts/test-capture.ts
 *
 * Проверяем то, что легко сломать незаметно: семейства образцов, коды с
 * цифры (ISA/KKS), структурную нормализацию, раскладку строки по полям,
 * определение колонок по содержимому и восемь классов конфликтов.
 */
import {
  recognize, buildShape, buildTableRows, fitsShape, shapeScore, findCodes,
  normCode, mixedScript, distribute, classifyColumns, CaptureItem,
} from '../src/capture/recognize';
import { buildVocab } from '../src/capture/vocab';
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
const VOCAB = buildVocab([{ department: 'ОВ', brand: 'ВЕЗА КЦКП-10', fluid: 'воздух', wbs: null }]);

console.log('Образец: семейства, а не один шаблон');
{
  const shape = buildShape(['AHU-2', 'FAN-07', '21-PV-001', '21-PV-002']);
  eq('семейств два', shape.families.length, 2);
  eq('оба вида кодов свои', [fitsShape('AHU-9', shape), fitsShape('21-PV-003', shape)], [true, true]);
  // Смесь семейств не должна порождать «широкий» шаблон, под который лезет что угодно
  eq('чужая форма не подошла', fitsShape('QQQQ-1-2-3', shape), false);
  eq('номер на разряд длиннее — всё ещё свой', fitsShape('AHU-12', shape), true);
  eq('пустой проект — семейств нет', buildShape([]).families.length, 0);
}

console.log('Коды, начинающиеся с цифры, и многосоставные');
{
  const rows = recognize([item('21-PV-001 21-PV-002 21-PV-003 10LAC20AA001')], []).rows;
  eq('код ISA взят целиком', rows[0].identifier, '21-PV-001');
  eq('код KKS найден', rows.some(r => r.identifier === '10LAC20AA001'), true);
  eq('всего кодов', rows.length, 4);
}

console.log('Нормализация сохраняет строение кода');
{
  eq('разделитель между буквой и цифрой не значим',
     [normCode('AHU-2'), normCode('AHU 2'), normCode('AHU2')], ['AHU2', 'AHU2', 'AHU2']);
  // Точка между цифрами — часть кода: «бл2.1» и «бл21» разные блоки
  eq('разделитель между цифрами значим', normCode('бл2.1') === normCode('бл21'), false);
  eq('русская А сводится к латинской A', normCode('АHU-2'), normCode('AHU-2'));
  eq('русская В и латинская V — разные', normCode('В-12') === normCode('V-12'), false);
  eq('смешанная раскладка ловится', mixedScript('АHU-2'), true);
}

console.log('Мусор виден и не считается кодом');
{
  const text = 'AHU-2 AHU-3 AHU-4\nстр. 4 из 12\nот 12.10.2023';
  const { codes, junk } = findCodes(text, buildShape(PROJECT));
  eq('коды найдены', codes.map(c => c.code), ['AHU-2', 'AHU-3', 'AHU-4']);
  eq('номер страницы в мусоре', junk.some(j => j.code.startsWith('стр')), true);
  eq('дата в мусоре', junk.some(j => j.code === '12.10.2023'), true);
}

console.log('Оценка опирается на окружение');
{
  // В пустом проекте образца нет: опора — самое частое семейство в захвате
  const rows = recognize([item('QQ-1 QQ-2 QQ-3 QQ-4')], []).rows;
  eq('перечень одинаковых кодов признан уверенно',
     rows.every(r => r.verdict === 'fits'), true);
  // Одиночка того же вида среди прозы уверенности не набирает
  const lone = recognize([item('Согласовано письмом ХХ-5 от отдела')], []).rows;
  eq('одиночка остаётся сомнительным', lone[0]?.verdict, 'doubt');
}

console.log('Строка «код + данные» раскладывается по полям');
{
  const r = recognize(
    [item('AHU-2  Приточная установка ВЕЗА КЦКП-10  ОВ\nFAN-07  Вентилятор канальный НЕД  ОВ')],
    PROJECT,
    [{ department: 'ОВ', brand: 'ВЕЗА КЦКП-10', fluid: null, wbs: null }],
  );
  eq('режим — строки', r.mode, 'lines');
  eq('строк по числу кодов', r.rows.length, 2);
  eq('модель не стала отдельным тегом', r.rows.some(x => x.identifier === 'КЦКП-10'), false);
  eq('известная марка отделена', r.rows[0].brand, 'ВЕЗА КЦКП-10');
  eq('наименование очищено', r.rows[0].name, 'Приточная установка');
  eq('отдел разложен', r.rows[0].department, 'ОВ');
  // Незнакомая марка узнаётся по виду: заглавные слова в хвосте
  eq('незнакомая марка отделена', r.rows[1].brand, 'НЕД');
}

console.log('Перечень остаётся перечнем');
{
  const r = recognize([item('AHU-2  AHU-3  P-101A\nFAN-07 FAN-08')], PROJECT);
  eq('режим — список', r.mode, 'list');
  eq('строк пять', r.rows.length, 5);
  eq('данных при кодах нет', r.rows.every(x => !x.name && !x.brand), true);
}

console.log('Общий признак строки достаётся всем её кодам');
{
  const r = recognize([item('ОВ: AHU-2, AHU-3\nВК: P-101A')], PROJECT);
  eq('отдел проставлен всем', r.rows.map(x => x.department), ['ОВ', 'ОВ', 'ВК']);
}

console.log('Раскладка остатка');
{
  eq('шифр СДР узнаётся', distribute('05.02.13', VOCAB).wbs, '05.02.13');
  eq('среда из словаря проекта', distribute('воздух', VOCAB).fluid, 'воздух');
  const d = distribute('Клапан огнезадерживающий\tКОМ-1\tОВ', VOCAB);
  eq('колонки строки разошлись по полям',
     [d.name, d.brand, d.department], ['Клапан огнезадерживающий', 'КОМ-1', 'ОВ']);
}

console.log('Таблица: шапка и определение колонок по содержимому');
{
  const tsv = 'Код тега\tМарка\nAHU-9\tВЕЗА КЦКП\nAHU-9\tповтор\nFAN-11\tНЕД';
  const r = recognize([item(tsv, 'table')], PROJECT);
  eq('режим — таблица', r.mode, 'table');
  eq('колонка марки распозналась', r.rows[0].brand, 'ВЕЗА КЦКП');
  eq('повтор схлопнут', [r.rows.length, r.collapsed], [2, 1]);

  // Шапки нет вовсе — колонки определяются по тому, что в них лежит
  const noHead = 'AHU-9\tОВ\nFAN-11\tОВ\nP-101B\tОВ';
  const r2 = recognize([item(noHead, 'table')], PROJECT);
  eq('код найден без шапки', r2.rows.map(x => x.identifier), ['AHU-9', 'FAN-11', 'P-101B']);
  eq('отдел найден без шапки', r2.rows[0].department, 'ОВ');

  // Колонка кода не первая — позиция не должна ничего решать
  const shifted = [['1', 'Приточная установка', 'AHU-9'], ['2', 'Вентилятор', 'FAN-11']];
  const m = classifyColumns(shifted, 0, buildShape(PROJECT), VOCAB);
  eq('код найден в третьей колонке', m[2], 'identifier');
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
    { key: 'e', identifier: 'АHU-2', verdict: 'fits' as const, spans: [] },   // русская А
    { key: 'f', identifier: 'ahu 2', verdict: 'fits' as const, spans: [] },
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
  eq('русская буква в коде', cls.e, 'layoutAlike');
  eq('привязываем к существующему', act.e, 'link');
  eq('регистр и разделители', cls.f, 'caseAlike');
  eq('не похож на теги проекта', cls.g, 'offShape');
  eq('сомнительный не отмечен', plan.find(p => p.key === 'g')!.on, false);
  eq('новый отмечен', plan.find(p => p.key === 'a')!.on, true);

  // Иерархический код не должен слипаться с плоским
  const hier = buildPlan(
    [{ key: 'h', identifier: 'бл2.1', verdict: 'fits', spans: [] }] as any,
    [{ id: '7', identifier: 'бл21' }], buildShape(['бл21', 'бл22']),
  );
  eq('бл2.1 не привязывается к бл21', hier[0].cls === 'caseAlike', false);

  const typo = buildPlan(
    [{ key: 'z', identifier: 'AUH-2', verdict: 'fits', spans: [] }] as any,
    [{ id: '9', identifier: 'AHU-2' }], shape,
  );
  eq('перестановка букв ловится', typo[0].cls, 'fuzzyAlike');

  const other = buildPlan(
    [{ key: 'y', identifier: 'AHU-21', verdict: 'fits', spans: [] }] as any,
    [{ id: '8', identifier: 'AHU-211' }], shape,
  );
  eq('разные номера не считаются похожими', other[0].cls, 'new');
}

console.log('Переразметка колонок вручную');
{
  const tsv = 'Позиция\tИзготовитель\nAHU-9\tВЕЗА\nFAN-11\tНЕД';
  const r = recognize([item(tsv, 'table')], PROJECT);
  eq('код угадался', r.rows[0].identifier, 'AHU-9');
  const remapped = buildTableRows(r.table!, r.shape, { 0: 'identifier', 1: 'brand' });
  eq('после переразметки марка на месте', remapped.rows[0].brand, 'ВЕЗА');
  eq('строк столько же', remapped.rows.length, 2);
}

console.log(`\n${ok} проверок пройдено, ${fail} провалено`);
process.exit(fail ? 1 : 0);
