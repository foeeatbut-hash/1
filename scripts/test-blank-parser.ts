// Тесты парсера бланков (Фаза 1 «Импорт бланков 2.0», docs/blank-import-design.md).
// Синтетические книги воспроизводят реальные проблемные случаи; запуск:
//   npx tsx scripts/test-blank-parser.ts
import * as XLSX from 'xlsx';
import { parseEquipmentExcel, parseEquipmentXML } from '../server/equipmentParser.js';

let failed = 0;
function check(name: string, cond: boolean, detail?: any) {
  if (cond) console.log(`  ✓ ${name}`);
  else { failed++; console.error(`  ✗ ${name}`, detail !== undefined ? JSON.stringify(detail) : ''); }
}

function bookOf(sheets: Record<string, { rows: any[][]; merges?: XLSX.Range[] }>): Buffer {
  const wb = XLSX.utils.book_new();
  for (const [name, def] of Object.entries(sheets)) {
    const ws = XLSX.utils.aoa_to_sheet(def.rows, { cellDates: false });
    if (def.merges) ws['!merges'] = def.merges;
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  return XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });
}

const flatParams = (r: ReturnType<typeof parseEquipmentExcel>) => {
  const out: { block: string; group: string; key: string; value: string; unit: string }[] = [];
  for (const u of r.units) for (const m of u.monoblocks) for (const b of m.blocks)
    for (const g of b.groups) for (const p of g.params)
      out.push({ block: b.name, group: g.title, key: p.key, value: p.value, unit: p.unit });
  return out;
};

// ── 1. Классический формат (регресс старого поведения) ──
{
  console.log('1. Классический бланк: оглавление у/мн/бл, группы одноячеечными строками');
  const buf = bookOf({
    '0': { rows: [['п', 'Проект'], ['у1', 'Приточная установка'], ['мн1', 'Моноблок 1'], ['бл1', 'Клапан воздушный']] },
    'бл1': { rows: [
      ['Клапан воздушный'],
      ['Габариты'],
      ['Высота', 1250, 'мм'],
      ['Ширина', 800, 'мм'],
      ['Электрика'],
      ['Напряжение', 230, 'В'],
    ] },
  });
  const r = parseEquipmentExcel(buf);
  const p = flatParams(r);
  check('иерархия у1→мн1→бл1', r.units[0]?.name === 'у1' && r.units[0]?.monoblocks[0]?.blocks[0]?.name === 'бл1');
  check('группы Габариты/Электрика', p.some(x => x.group === 'Габариты') && p.some(x => x.group === 'Электрика'));
  check('Высота=1250 мм', p.some(x => x.key === 'Высота' && x.value === '1250' && x.unit === 'мм'), p);
  check('тип КЛАПАН', r.units[0]?.monoblocks[0]?.blocks[0]?.equipType === 'КЛАПАН');
}

// ── 2. Даты: серийные числа Excel должны стать отображаемым текстом ──
{
  console.log('2. Даты Excel (серийные числа → отображаемое значение)');
  const rows = [['Блок'], ['Общие'], ['Дата расчёта', new Date(Date.UTC(2023, 9, 12)), '']];
  const buf = bookOf({ '0': { rows: [['у1', 'У'], ['бл1', 'Блок']] }, 'бл1': { rows } });
  const p = flatParams(parseEquipmentExcel(buf));
  const dateParam = p.find(x => x.key === 'Дата расчёта');
  check('дата не серийное число', !!dateParam && !/^45\d{3}/.test(dateParam.value), dateParam);
  check('дата похожа на дату', !!dateParam && /\d{1,2}[./]\d{1,2}[./]\d{2}/.test(dateParam.value), dateParam);
}

// ── 3. Merged-ячейки: заголовок группы на 3 колонки ──
{
  console.log('3. Объединённые ячейки: заголовок группы через merged');
  const buf = bookOf({
    '0': { rows: [['у1', 'У'], ['бл1', 'Фильтр']] },
    'бл1': {
      rows: [
        ['Фильтр', '', ''],
        ['Аэродинамика', '', ''],
        ['Сопротивление', 120, 'Па'],
      ],
      merges: [{ s: { r: 1, c: 0 }, e: { r: 1, c: 2 } }],
    },
  });
  const p = flatParams(parseEquipmentExcel(buf));
  check('merged-строка стала группой', p.some(x => x.group === 'Аэродинамика' && x.key === 'Сопротивление'), p);
}

// ── 4. Чужая раскладка колонок: «№ | Параметр | Ед. изм. | Значение» ──
{
  console.log('4. Автоколонки: № | Параметр | Ед. изм. | Значение (единицы ПЕРЕД значением)');
  const buf = bookOf({
    '0': { rows: [['у1', 'У'], ['бл1', 'Вентилятор радиальный']] },
    'бл1': { rows: [
      ['Вентилятор радиальный'],
      ['№', 'Наименование показателя', 'Ед. изм.', 'Величина'],
      [1, 'Расход воздуха', 'м3/ч', 5000],
      [2, 'Полное давление', 'Па', 450],
      [3, 'Марка двигателя', '', 'АИР80'],
    ] },
  });
  const p = flatParams(parseEquipmentExcel(buf));
  check('шапка таблицы не стала параметром', !p.some(x => x.key.includes('Наименование')), p.map(x => x.key));
  check('Расход: 5000, ед канонизирована м³/ч', p.some(x => x.key === 'Расход воздуха' && x.value === '5000' && x.unit === 'м³/ч'), p);
  check('колонка № не съела ключи', p.some(x => x.key === 'Полное давление' && x.value === '450'), p);
  check('текстовое значение (марка) на месте', p.some(x => x.key === 'Марка двигателя' && x.value === 'АИР80'), p);
}

// ── 5. Две колонки значений: приток/вытяжка ──
{
  console.log('5. Двойные значения: Параметр | Приток | Вытяжка | Ед.');
  const buf = bookOf({
    '0': { rows: [['у1', 'У'], ['бл1', 'Вентилятор']] },
    'бл1': { rows: [
      ['Вентилятор'],
      ['Параметр', 'Приток', 'Вытяжка', 'Ед. изм.'],
      ['Расход воздуха', 5000, 4500, 'м3/ч'],
      ['Давление', 450, 380, 'Па'],
    ] },
  });
  const p = flatParams(parseEquipmentExcel(buf));
  check('приток отдельным параметром', p.some(x => x.key === 'Расход воздуха (Приток)' && x.value === '5000'), p);
  check('вытяжка отдельным параметром', p.some(x => x.key === 'Расход воздуха (Вытяжка)' && x.value === '4500'), p);
  check('единица у обоих канонизирована', p.filter(x => x.key.startsWith('Расход')).every(x => x.unit === 'м³/ч'), p);
}

// ── 6. Поиск листа с «хвостом» в имени ──
{
  console.log('6. Лист «бл 2.1 (клапан)» находится по коду бл2.1');
  const buf = bookOf({
    '0': { rows: [['у1', 'У'], ['бл2.1', 'Клапан']] },
    'бл 2.1 (клапан)': { rows: [['Клапан'], ['Общие'], ['Высота', 500, 'мм']] },
  });
  const p = flatParams(parseEquipmentExcel(buf));
  check('параметры найдены', p.some(x => x.key === 'Высота' && x.value === '500'), p);
}

// ── 7. XML: CDATA и namespace, которые ломали регулярки ──
{
  console.log('7. XML: CDATA, namespace-префиксы, вложенность');
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<calc:root xmlns:calc="urn:calc">
  <calc:system name="у1" title="Приточная">
    <calc:monoblock name="мн1">
      <calc:block name="бл1" title="Вентилятор">
        <calc:group title="Основные">
          <calc:param name="Расход" unit="м3/ч"><![CDATA[5 000]]></calc:param>
          <calc:param name="Марка" unit=""><![CDATA[ВР-80 <спец>]]></calc:param>
        </calc:group>
      </calc:block>
    </calc:monoblock>
  </calc:system>
</calc:root>`;
  const r = parseEquipmentXML(xml);
  const p = flatParams(r);
  check('система/блок распознаны', r.units[0]?.name === 'у1' && p.length > 0, r.units);
  check('CDATA значение целиком', p.some(x => x.key === 'Расход' && x.value === '5 000'), p);
  check('угловые скобки в CDATA не потерялись', p.some(x => x.key === 'Марка' && x.value.includes('<спец>')), p);
}

// ── 8. Ломаные входы: диагностика вместо падения ──
{
  console.log('8. Ломаные входы');
  const empty = parseEquipmentExcel(bookOf({ Лист1: { rows: [] } }));
  check('пустая книга → пустой результат', empty.units.length === 0);
  const junkXml = parseEquipmentXML('это вообще не xml <<<>>');
  check('мусорный XML → пустой результат без исключения', junkXml.units.length === 0);
}

// ── 9. Шапка при ВСЕГО двух строках данных (регресс детекта шапки) ──
{
  console.log('9. Короткая таблица: шапка + 2 строки (детект не должен зависеть от числа строк)');
  const buf = bookOf({
    '0': { rows: [['у1', 'У'], ['бл1', 'Вентилятор']] },
    'бл1': { rows: [
      ['Вентилятор'],
      ['№', 'Наименование показателя', 'Ед. изм.', 'Величина'],
      [1, 'Расход воздуха', 'м3/ч', 5000],
      [2, 'Высота', 'мм', 1200],
    ] },
  });
  const p = flatParams(parseEquipmentExcel(buf));
  check('ровно 2 параметра (шапка не просочилась)', p.length === 2, p.map(x => x.key));
  check('ключ = Расход воздуха, значение 5000', p.some(x => x.key === 'Расход воздуха' && x.value === '5000'), p);
  check('ключ = Высота, значение 1200', p.some(x => x.key === 'Высота' && x.value === '1200'), p);
}

console.log(failed === 0 ? '\nВСЕ ТЕСТЫ ПРОЙДЕНЫ' : `\nПРОВАЛОВ: ${failed}`);
process.exit(failed === 0 ? 0 : 1);
