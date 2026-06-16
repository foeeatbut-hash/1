import * as XLSX from 'xlsx';

// ── Структурированный результат разбора расчёта вентиляционного оборудования ──
export interface SpecParam { key: string; value: string; unit: string; }
export interface SpecGroup { title: string; params: SpecParam[]; }
export interface ParsedBlock { name: string; title: string; equipType: string; groups: SpecGroup[]; }
export interface ParsedMonoblock { name: string; title: string; blocks: ParsedBlock[]; }
export interface ParsedUnit { name: string; title: string; groups: SpecGroup[]; monoblocks: ParsedMonoblock[]; }
export interface EquipParseResult { units: ParsedUnit[]; }

// Тип детали по её названию (для группировки и профилей видимости)
const TYPE_RULES: { type: string; kw: string[] }[] = [
  { type: 'КЛАПАН', kw: ['клапан'] },
  { type: 'ФИЛЬТР', kw: ['фильтр'] },
  { type: 'НАГРЕВАТЕЛЬ', kw: ['нагреват', 'нагрев', 'тэн', 'калорифер'] },
  { type: 'ОХЛАДИТЕЛЬ', kw: ['охладит', 'охлажд', 'фреон', 'испарит'] },
  { type: 'ВЕНТИЛЯТОР', kw: ['вентилятор', 'вск', 'радиальн'] },
  { type: 'УВЛАЖНИТЕЛЬ', kw: ['увлажнит'] },
  { type: 'РЕКУПЕРАТОР', kw: ['рекуператор', 'утилизат', 'теплоутил'] },
  { type: 'ШУМОГЛУШИТЕЛЬ', kw: ['шумоглуш', 'глушител'] },
  { type: 'КАМЕРА', kw: ['камера', 'промежуточн'] },
  { type: 'ВОЗДУХОПРИЁМНЫЙ', kw: ['воздухоприемн', 'воздухоприёмн', 'приемн', 'панель', 'заслонк'] },
  { type: 'ЗАВЕСА', kw: ['завеса'] },
  { type: 'СЕКЦИЯ', kw: ['секция'] },
];

export function detectEquipType(text: string): string {
  const t = (text || '').toLowerCase();
  for (const r of TYPE_RULES) {
    if (r.kw.some(k => t.includes(k))) return r.type;
  }
  return 'ПРОЧЕЕ';
}

const PARAM_HEADER_WORDS = new Set([
  'параметр', 'parameter', 'свойство', 'property', 'наименование параметра', 'наименование',
]);
const VALUE_HEADER_WORDS = new Set(['значение', 'value']);
const UNIT_HEADER_WORDS = new Set(['ед_изм', 'ед.изм.', 'ед. изм.', 'ед', 'unit', 'единица']);

function cellStr(c: any): string {
  if (c === null || c === undefined) return '';
  return String(c).trim();
}

// Превращает строки листа (массив массивов) в сгруппированные параметры.
// Однокле­точная строка = заголовок группы; строка с 2-3 ячейками = параметр.
export function extractGroupedSpecs(rows: any[][], skipTitleRow = true): SpecGroup[] {
  const groups: SpecGroup[] = [];
  let current: SpecGroup | null = null;
  const ensureDefault = () => {
    if (!current) { current = { title: 'Основные', params: [] }; groups.push(current); }
    return current;
  };

  for (let i = 0; i < rows.length; i++) {
    if (skipTitleRow && i === 0) continue; // первая строка — заголовок узла
    const row = rows[i] || [];
    const cells = row.map(cellStr);
    const nonEmpty = cells.filter(c => c !== '');
    if (nonEmpty.length === 0) continue;

    const first = cells[0] || nonEmpty[0];
    const firstLower = first.toLowerCase();

    // Строка-шапка таблицы "Параметр | Значение | ед_изм" — пропускаем
    if (PARAM_HEADER_WORDS.has(firstLower)) continue;

    if (nonEmpty.length === 1) {
      // Заголовок группы
      current = { title: first, params: [] };
      groups.push(current);
      continue;
    }

    // Параметр: ключ, значение, [единица]
    let value = cells[1] !== undefined && cells[1] !== '' ? cells[1] : (nonEmpty[1] || '');
    let unit = cells[2] || '';
    const unitLower = unit.toLowerCase();
    if (VALUE_HEADER_WORDS.has(unitLower) || UNIT_HEADER_WORDS.has(unitLower)) unit = '';
    if (!first) continue;
    ensureDefault().params.push({ key: first, value, unit });
  }

  // Убираем пустые группы
  return groups.filter(g => g.params.length > 0);
}

// Поиск листа по коду/описанию (как в исходном парсере, но компактно)
function findSheet(sheetNames: string[], code: string, desc: string): string | null {
  const norm = (s: string) => s.toLowerCase().trim();
  const c = norm(code);
  let hit = sheetNames.find(n => norm(n) === c);
  if (hit) return hit;
  // числовой префикс описания вида "2.1." → ищем лист "бл2.1"
  const m = (desc || '').match(/^(\d+(?:\.\d+)*)/);
  if (m) {
    const num = m[1];
    hit = sheetNames.find(n => norm(n) === `бл${num}` || norm(n) === num);
    if (hit) return hit;
  }
  return null;
}

const reUnit = /^[уy]\d+/i;
const reMono = /^(мн|mn|mb)\d+/i;
const reBlock = /^(бл|bl)\d+/i;
const reSupp = /^(шум|схема|диаг|вент|вспом|sound|scheme|diag)/i;
const reProject = /^(п|проект|project)$/i;

// Разбор книги Excel/расчёта → иерархия установок
export function parseEquipmentExcel(buffer: Buffer): EquipParseResult {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const sheetNames = wb.SheetNames;
  const result: EquipParseResult = { units: [] };
  if (sheetNames.length === 0) return result;

  const readRows = (name: string): any[][] => XLSX.utils.sheet_to_json<any[]>(wb.Sheets[name], { header: 1, blankrows: false });

  // Лист-оглавление: "0" / "index" / первый
  const indexName = sheetNames.find(n => n === '0' || n.toLowerCase().trim() === 'index') || sheetNames[0];
  const indexRows = readRows(indexName);

  // Является ли оглавление списком "код | описание"
  const looksLikeIndex = indexRows.some(r => {
    const code = cellStr((r || [])[0]);
    return reUnit.test(code) || reMono.test(code) || reBlock.test(code);
  });

  if (looksLikeIndex) {
    let unit: ParsedUnit | null = null;
    let mono: ParsedMonoblock | null = null;

    for (const r of indexRows) {
      const code = cellStr((r || [])[0]);
      const desc = cellStr((r || [])[1]);
      if (!code || reProject.test(code) || reSupp.test(code)) continue;

      if (reUnit.test(code)) {
        unit = { name: code, title: desc || code, groups: [], monoblocks: [] };
        result.units.push(unit);
        mono = null;
        const sh = findSheet(sheetNames, code, desc);
        if (sh) unit.groups = extractGroupedSpecs(readRows(sh));
      } else if (reMono.test(code)) {
        if (!unit) { unit = { name: 'у1', title: 'Установка', groups: [], monoblocks: [] }; result.units.push(unit); }
        mono = { name: code, title: desc || code, blocks: [] };
        unit.monoblocks.push(mono);
        const sh = findSheet(sheetNames, code, desc);
        if (sh) {
          const g = extractGroupedSpecs(readRows(sh));
          if (g.length) mono.blocks.push({ name: code + '_общие', title: 'Общие параметры моноблока', equipType: 'МОНОБЛОК', groups: g });
        }
      } else if (reBlock.test(code) || findSheet(sheetNames, code, desc)) {
        if (!unit) { unit = { name: 'у1', title: 'Установка', groups: [], monoblocks: [] }; result.units.push(unit); }
        if (!mono) { mono = { name: 'мн1', title: 'Моноблок', blocks: [] }; unit.monoblocks.push(mono); }
        const sh = findSheet(sheetNames, code, desc);
        const groups = sh ? extractGroupedSpecs(readRows(sh)) : [];
        mono.blocks.push({ name: code, title: desc || code, equipType: detectEquipType(desc || code), groups });
      }
    }
    if (result.units.length) return result;
  }

  // ── Фоллбэк для «своих» файлов без стандартного оглавления ──
  // Каждый содержательный лист трактуем как отдельный блок одной установки.
  const unit: ParsedUnit = { name: 'Импорт', title: 'Импортированное оборудование', groups: [], monoblocks: [] };
  const mono: ParsedMonoblock = { name: 'мн1', title: 'Оборудование', blocks: [] };
  unit.monoblocks.push(mono);
  for (const name of sheetNames) {
    if (name === indexName && looksLikeIndex) continue;
    const rows = readRows(name);
    if (!rows.length) continue;
    const title = cellStr((rows[0] || [])[0]) || name;
    const groups = extractGroupedSpecs(rows);
    if (groups.length === 0) continue;
    mono.blocks.push({ name, title, equipType: detectEquipType(title), groups });
  }
  if (mono.blocks.length) result.units.push(unit);
  return result;
}

// Разбор XML-расчёта (теги <system>/<monoblock>/<block>/<param>) → та же иерархия
export function parseEquipmentXML(xmlText: string): EquipParseResult {
  const result: EquipParseResult = { units: [] };
  const attr = (s: string, a: string) => (s.match(new RegExp(`${a}\\s*=\\s*"([^"]*)"`, 'i')) || [])[1] || '';

  const sysRe = /<(?:system|EquipmentSystem|установка|unit)\b([^>]*)>([\s\S]*?)<\/(?:system|EquipmentSystem|установка|unit)>/gi;
  let sm: RegExpExecArray | null;
  while ((sm = sysRe.exec(xmlText))) {
    const sysName = attr(sm[1], 'name') || attr(sm[1], 'код') || `у${result.units.length + 1}`;
    const sysTitle = attr(sm[1], 'title') || attr(sm[1], 'описание') || sysName;
    const unit: ParsedUnit = { name: sysName, title: sysTitle, groups: [], monoblocks: [] };
    result.units.push(unit);

    const mbRe = /<(?:monoblock|моноблок|mb)\b([^>]*)>([\s\S]*?)<\/(?:monoblock|моноблок|mb)>/gi;
    let mbm: RegExpExecArray | null;
    let foundMb = false;
    while ((mbm = mbRe.exec(sm[2]))) {
      foundMb = true;
      const mbName = attr(mbm[1], 'name') || `мн${unit.monoblocks.length + 1}`;
      const mono: ParsedMonoblock = { name: mbName, title: attr(mbm[1], 'title') || mbName, blocks: [] };
      unit.monoblocks.push(mono);
      mono.blocks.push(...parseXmlBlocks(mbm[2], attr));
    }
    if (!foundMb) {
      const mono: ParsedMonoblock = { name: 'мн1', title: 'Оборудование', blocks: [] };
      const blocks = parseXmlBlocks(sm[2], attr);
      if (blocks.length) { mono.blocks.push(...blocks); unit.monoblocks.push(mono); }
    }
  }
  return result;
}

function parseXmlBlocks(inner: string, attr: (s: string, a: string) => string): ParsedBlock[] {
  const blocks: ParsedBlock[] = [];
  const blRe = /<(?:block|блок|component|element)\b([^>]*)>([\s\S]*?)<\/(?:block|блок|component|element)>/gi;
  let bm: RegExpExecArray | null;
  while ((bm = blRe.exec(inner))) {
    const name = attr(bm[1], 'name') || attr(bm[1], 'код') || `бл${blocks.length + 1}`;
    const title = attr(bm[1], 'title') || attr(bm[1], 'описание') || name;
    // группы: <group title="..."><param name=".." unit="..">val</param></group>
    const groups: SpecGroup[] = [];
    const grRe = /<(?:group|группа|section)\b([^>]*)>([\s\S]*?)<\/(?:group|группа|section)>/gi;
    let gm: RegExpExecArray | null;
    let hasGroups = false;
    while ((gm = grRe.exec(bm[2]))) {
      hasGroups = true;
      groups.push({ title: attr(gm[1], 'title') || attr(gm[1], 'name') || 'Основные', params: parseXmlParams(gm[2], attr) });
    }
    if (!hasGroups) {
      const params = parseXmlParams(bm[2], attr);
      if (params.length) groups.push({ title: 'Основные', params });
    }
    blocks.push({ name, title, equipType: detectEquipType(title), groups: groups.filter(g => g.params.length) });
  }
  return blocks;
}

function parseXmlParams(inner: string, attr: (s: string, a: string) => string): SpecParam[] {
  const params: SpecParam[] = [];
  const pRe = /<(?:param|параметр|property)\b([^>]*)>([\s\S]*?)<\/(?:param|параметр|property)>/gi;
  let pm: RegExpExecArray | null;
  while ((pm = pRe.exec(inner))) {
    const key = attr(pm[1], 'name') || attr(pm[1], 'key') || attr(pm[1], 'параметр');
    const unit = attr(pm[1], 'unit') || attr(pm[1], 'ед');
    const value = pm[2].replace(/<[^>]+>/g, '').trim();
    if (key) params.push({ key, value, unit });
  }
  return params;
}
