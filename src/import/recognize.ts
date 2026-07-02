// Распознавание документа: работает с промежуточной моделью (types.ts)
// и не знает, из какого формата пришли блоки. Чистые функции — тестируются в Node.

import {
  DocBlock, DocTable, ExtractedDoc, DraftResult, DraftItem, DraftField, DocType, Confidence,
} from './types';
import {
  FIELDS, FieldDef, matchLabel, detectEquip, findSystem, normalizeCode, looksLikeCode,
  splitValueUnit, unitFromLabel, validateValue, GARBAGE_MARKERS, PAGE_MARKER_RE,
} from './dictionary';

let idSeq = 0;
const nextId = () => `draft-${++idSeq}`;

// ── Классификация абзаца ─────────────────────────────────────────────────────

type ParaClass = 'prose' | 'kvline' | 'heading' | 'garbage' | 'empty';

export function classifyParagraph(text: string): ParaClass {
  const t = (text || '').trim();
  if (!t) return 'empty';
  const low = t.toLowerCase();
  if (PAGE_MARKER_RE.test(low)) return 'garbage';
  if (GARBAGE_MARKERS.some(g => low.startsWith(g) || (t.length < 60 && low.includes(g)))) return 'garbage';
  // «Ключ: значение» или «Ключ — значение» в короткой строке
  if (t.length <= 90 && /^[^:—-]{2,45}[:—]\s*\S/.test(t) && !/[.!?].*[.!?]/.test(t)) {
    const key = t.split(/[:—]/)[0];
    if (matchLabel(key)) return 'kvline';
  }
  // Короткая строка с типом оборудования и без глагольной прозы — заголовок секции
  if (t.length <= 70 && detectEquip(t) && !/[.!?]$/.test(t)) return 'heading';
  return 'prose';
}

// ── Классификация таблицы ────────────────────────────────────────────────────

export type TableShape = 'attribute' | 'entity' | 'matrix' | 'layout';

export function classifyTable(rows: string[][]): TableShape {
  const nonEmptyRows = rows.filter(r => r.some(c => (c || '').trim()));
  if (nonEmptyRows.length === 0) return 'layout';
  const colCount = Math.max(...nonEmptyRows.map(r => r.length));
  if (colCount < 2) return 'layout';

  // Совпадения словаря в первой колонке
  let col0Matches = 0;
  for (const r of nonEmptyRows) {
    if (matchLabel(r[0] || '')) col0Matches++;
  }

  // Совпадения словаря в первой непустой строке (потенциальная шапка)
  const header = nonEmptyRows[0];
  let headerMatches = 0;
  for (const c of header) if (matchLabel(c || '')) headerMatches++;

  const col0Ratio = col0Matches / nonEmptyRows.length;
  const dataRows = nonEmptyRows.length - 1;

  // Матрица: параметры в строках, типоразмеры в колонках (шапка — коды, не подписи)
  if (col0Ratio >= 0.4 && colCount >= 3 && headerMatches <= 1) {
    const headerCodes = header.slice(1).filter(c => looksLikeCode(c || '') || /\d/.test(c || '')).length;
    if (headerCodes >= 2) return 'matrix';
  }

  if (headerMatches >= 2 && dataRows >= 2 && col0Ratio < 0.4) return 'entity';
  if (col0Ratio >= 0.35) return 'attribute';
  if (headerMatches >= 2 && dataRows >= 1) return 'entity';
  return 'layout';
}

// ── Извлечение пар из разных форм ────────────────────────────────────────────

interface RawPair {
  label: string;
  value: string;
  unit: string;
  source: DraftField['source'];
}

/** Атрибутная таблица: подпись в колонке 0 (или 0+1), значение правее */
function pairsFromAttributeTable(rows: string[][]): RawPair[] {
  const out: RawPair[] = [];
  for (const r of rows) {
    const label = (r[0] || '').trim();
    if (!label) continue;
    // Первое непустое значение правее подписи
    let value = '';
    let valueIdx = -1;
    for (let i = 1; i < r.length; i++) {
      if ((r[i] || '').trim()) { value = r[i].trim(); valueIdx = i; break; }
    }
    if (!value) continue;
    // Ячейка сразу за значением может быть единицей («5000 | м3/ч»)
    let unit = unitFromLabel(label) || splitValueUnit(value).unit;
    if (!unit && valueIdx >= 0 && valueIdx + 1 < r.length) {
      const next = (r[valueIdx + 1] || '').trim();
      if (next && next.length <= 12 && !/\d/.test(next)) unit = splitValueUnit('0 ' + next).unit || next;
    }
    out.push({ label, value, unit, source: 'table' });
  }
  return out;
}

/** Сущностная таблица: шапка → позиции по строкам */
function itemsFromEntityTable(rows: string[][]): DraftItem[] {
  const nonEmpty = rows.filter(r => r.some(c => (c || '').trim()));
  if (nonEmpty.length < 2) return [];
  const header = nonEmpty[0];
  const cols = header.map(h => ({ raw: (h || '').trim(), match: matchLabel(h || '') }));
  const items: DraftItem[] = [];
  for (const r of nonEmpty.slice(1)) {
    // Строки-разделители/итоги пропускаем
    const joined = r.join(' ').toLowerCase();
    if (/итого|всего|примечани/.test(joined)) continue;
    const pairs: RawPair[] = [];
    for (let i = 0; i < cols.length; i++) {
      const v = (r[i] || '').trim();
      if (!v || !cols[i].raw) continue;
      pairs.push({ label: cols[i].raw, value: v, unit: unitFromLabel(cols[i].raw) || splitValueUnit(v).unit, source: 'table' });
    }
    if (pairs.length === 0) continue;
    const item = buildItem(pairs, '');
    if (item.name || item.brand || item.title !== 'Позиция') items.push(item);
  }
  return items;
}

/** Матричная таблица: выбор колонки типоразмера */
function pairsFromMatrixTable(rows: string[][], brandHint?: string): { pairs: RawPair[]; headers: string[]; chosen: number } {
  const nonEmpty = rows.filter(r => r.some(c => (c || '').trim()));
  const header = nonEmpty[0] || [];
  const headers = header.slice(1).map(h => (h || '').trim());
  let chosen = -1;
  if (brandHint) {
    const hint = normalizeCode(brandHint).value.toLowerCase().replace(/\s/g, '');
    chosen = headers.findIndex(h => {
      const hn = normalizeCode(h).value.toLowerCase().replace(/\s/g, '');
      return hn && (hn === hint || hint.includes(hn) || hn.includes(hint));
    });
  }
  if (chosen < 0 && headers.length === 1) chosen = 0;
  const pairs: RawPair[] = [];
  if (chosen >= 0) {
    for (const r of nonEmpty.slice(1)) {
      const label = (r[0] || '').trim();
      const value = (r[chosen + 1] || '').trim();
      if (label && value) pairs.push({ label, value, unit: unitFromLabel(label) || splitValueUnit(value).unit, source: 'table' });
    }
  }
  return { pairs, headers, chosen };
}

/** Проза: типы, марки, системы, «мощность составляет 3 кВт» */
function minePairsFromProse(text: string): RawPair[] {
  const out: RawPair[] = [];
  const sentences = text.split(/[.;!?]\s+|\n/);
  for (const s of sentences) {
    const low = ' ' + s.toLowerCase().replace(/ё/g, 'е') + ' ';
    for (const f of FIELDS) {
      if (f.kind !== 'number') continue;
      for (const syn of f.synonyms) {
        const idx = low.indexOf(' ' + syn);
        if (idx < 0) continue;
        // число с единицей в ближайших ~50 символах после синонима
        const tail = s.slice(Math.min(idx + syn.length, s.length), Math.min(idx + syn.length + 55, s.length));
        const m = tail.match(/(-?\d[\d\s.,]*)\s*(тыс\.?\s*)?([a-zа-я°/³3()]+[\w/³()]*)?/i);
        if (m && m[1]) {
          const valueRaw = ((m[2] || '') + m[1]).trim();
          const unit = splitValueUnit((m[1] || '') + ' ' + (m[3] || '')).unit;
          out.push({ label: f.label, value: valueRaw.replace(/\s+$/, ''), unit, source: 'prose' });
          break;
        }
      }
    }
  }
  return out;
}

// ── Сборка позиции из пар ────────────────────────────────────────────────────

function confidenceFor(f: FieldDef | null, verdict: 'ok' | 'suspicious' | 'reject', source: RawPair['source'], isOcr: boolean): Confidence {
  if (verdict === 'suspicious') return 'low';
  if (isOcr) return 'mid'; // OCR никогда не даёт high сам по себе
  if (!f) return 'mid';
  if (source === 'prose') return 'mid';
  return 'high';
}

function buildItem(pairs: RawPair[], contextTitle: string, isOcr = false): DraftItem {
  const item: DraftItem = {
    id: nextId(),
    title: contextTitle || 'Позиция',
    name: '',
    equipType: '',
    fields: [],
  };
  for (const p of pairs) {
    const m = matchLabel(p.label);
    const f = m?.field || null;
    let value = p.value;
    let unit = p.unit;

    if (f) {
      // Значение может содержать единицу («5000 м3/ч», «600 °C») — расщепляем всегда,
      // чтобы в поле осталось чистое число, а единица ушла в unit
      if (f.kind === 'number' || f.kind === 'dims') {
        const su = splitValueUnit(value);
        if (su.unit) { value = su.value; if (!unit) unit = su.unit; }
      }
      const verdict = validateValue(f, value, unit);
      if (verdict === 'reject') {
        // Не наше значение под якорем — кладём как сырой параметр, чтобы не потерять
        item.fields.push({ label: p.label, value: p.value, unit: p.unit, group: 'Прочее', confidence: 'low', source: p.source });
        continue;
      }
      const conf = confidenceFor(f, verdict, p.source, isOcr);
      switch (f.target) {
        case 'name':
          if (!item.title || item.title === 'Позиция') item.title = value;
          break;
        case 'brand': {
          const norm = normalizeCode(value);
          item.brand = norm.value;
          break;
        }
        case 'system':
          item.system = normalizeCode(value).value;
          break;
        case 'qty':
          item.qty = value;
          break;
        case 'spec':
          item.fields.push({ fieldId: f.id, label: f.label, value, unit: unit || (f.units ? '' : ''), group: f.group, confidence: conf, source: p.source });
          break;
      }
      if (f.target !== 'spec') {
        // Свойства позиции тоже показываем в списке полей предпросмотра
        item.fields.push({ fieldId: f.id, label: f.label, value: f.target === 'brand' ? (item.brand || value) : value, unit: '', group: 'Общие', confidence: conf, source: p.source });
      }
    } else {
      // Подпись не сопоставлена — сырой параметр (серый в предпросмотре)
      if (p.value.length <= 120) {
        item.fields.push({ label: p.label, value: p.value, unit: p.unit, group: 'Прочее', confidence: 'low', source: p.source });
      }
    }
  }

  // Тип оборудования и система из названия/марки
  const searchText = `${item.title} ${item.brand || ''}`;
  const eq = detectEquip(searchText);
  if (eq) item.equipType = eq.id;
  if (!item.system) {
    const sys = findSystem(item.title);
    if (sys) item.system = sys;
  }
  if (!item.name) item.name = item.brand || '';
  return item;
}

/** Дополняет пустые свойства позиции найденным в прозе (пониженная уверенность) */
function enrichFromProse(item: DraftItem, proseTexts: string[]) {
  const all = proseTexts.join('\n');
  if (!item.equipType) {
    const eq = detectEquip(all);
    if (eq) item.equipType = eq.id;
  }
  if ((!item.title || item.title === 'Позиция')) {
    const eq = detectEquip(all);
    if (eq) {
      // Пробуем взять фразу вокруг найденного слова как название
      const low = all.toLowerCase().replace(/ё/g, 'е');
      const word = eq.words.find(w => low.includes(w));
      if (word) {
        const idx = low.indexOf(word);
        const frag = all.slice(idx, Math.min(idx + 70, all.length)).split(/[.,;\n]/)[0].trim();
        item.title = frag.length >= word.length ? frag : eq.label;
      } else item.title = eq.label;
    }
  }
  if (!item.brand) {
    // Код с цифрой и разделителем в прозе — кандидат в марку
    const codes = (all.match(/[A-Za-zА-Яа-я]{1,12}[\-./][A-Za-zА-Яа-я0-9,\-./]{2,25}/g) || [])
      .filter(c => /\d/.test(c) && looksLikeCode(c));
    if (codes.length) {
      const norm = normalizeCode(codes[0]);
      item.brand = norm.value;
      item.fields.push({ fieldId: 'brand', label: 'Марка', value: norm.value, unit: '', group: 'Общие', confidence: 'mid', source: 'prose' });
      if (!item.name) item.name = norm.value;
    }
  }
  if (!item.system) {
    const sys = findSystem(all);
    if (sys) {
      item.system = sys;
      item.fields.push({ fieldId: 'system', label: 'Система', value: sys, unit: '', group: 'Общие', confidence: 'mid', source: 'prose' });
    }
  }
}

// ── Главная функция ──────────────────────────────────────────────────────────

export function recognize(doc: ExtractedDoc): DraftResult {
  const warnings = [...doc.warnings];
  const isOcr = doc.source === 'pdf-ocr';

  // 1. Классификация блоков
  const tables: { rows: string[][]; shape: TableShape }[] = [];
  const kvPairs: RawPair[] = [];
  const proseTexts: string[] = [];
  const headings: { text: string; blockIndex: number }[] = [];
  const orderedData: { blockIndex: number; kind: 'table' | 'pairs'; tableIdx?: number; pairs?: RawPair[] }[] = [];
  let dataBlocks = 0;

  doc.blocks.forEach((b, bi) => {
    if (b.kind === 'kv') {
      kvPairs.push({ label: b.key, value: b.value, unit: splitValueUnit(b.value).unit, source: 'kv' });
      orderedData.push({ blockIndex: bi, kind: 'pairs', pairs: [kvPairs[kvPairs.length - 1]] });
      dataBlocks++;
      return;
    }
    if (b.kind === 'table') {
      const shape = classifyTable(b.rows);
      if (shape === 'layout') {
        // Оформительская таблица: содержимое читаем как абзацы (внутри бывают данные)
        for (const r of b.rows) {
          const line = r.filter(c => (c || '').trim()).join(' ').trim();
          if (!line) continue;
          const cls = classifyParagraph(line);
          if (cls === 'kvline') {
            const [k, ...rest] = line.split(/[:—]/);
            const v = rest.join(':').trim();
            const su = splitValueUnit(v);
            const pr: RawPair = { label: k.trim(), value: v, unit: unitFromLabel(k) || su.unit, source: 'table' };
            kvPairs.push(pr);
            orderedData.push({ blockIndex: bi, kind: 'pairs', pairs: [pr] });
            dataBlocks++;
          } else if (cls === 'heading') headings.push({ text: line, blockIndex: bi });
          else if (cls === 'prose') proseTexts.push(line);
        }
        return;
      }
      tables.push({ rows: b.rows, shape });
      orderedData.push({ blockIndex: bi, kind: 'table', tableIdx: tables.length - 1 });
      dataBlocks++;
      return;
    }
    // Абзац
    const cls = classifyParagraph(b.text);
    if (cls === 'kvline') {
      const [k, ...rest] = b.text.split(/[:—]/);
      const v = rest.join(':').trim();
      const su = splitValueUnit(v);
      const pr: RawPair = { label: k.trim(), value: v, unit: unitFromLabel(k) || su.unit, source: 'table' };
      kvPairs.push(pr);
      orderedData.push({ blockIndex: bi, kind: 'pairs', pairs: [pr] });
      dataBlocks++;
    } else if (cls === 'heading') {
      headings.push({ text: b.text.trim(), blockIndex: bi });
    } else if (cls === 'prose') {
      proseTexts.push(b.text);
    }
  });

  // 2. Определение типа документа
  const entityTables = tables.filter(t => t.shape === 'entity');
  const attributeTables = tables.filter(t => t.shape === 'attribute');
  const matrixTables = tables.filter(t => t.shape === 'matrix');

  let docType: DocType = 'unknown';
  const items: DraftItem[] = [];

  // Опросный лист: много подчёркиваний/пустых значений
  const underscoreHeavy = doc.blocks.filter(b => b.kind === 'para' && /_{3,}/.test((b as any).text)).length >= 3;

  if (entityTables.length > 0 && entityTables.some(t => t.rows.length >= 3)) {
    // Ведомость: строки = позиции
    docType = 'list';
    for (const t of entityTables) items.push(...itemsFromEntityTable(t.rows));
    // Атрибутные таблицы рядом с ведомостью — общие свойства (система и т.п.) для всех позиций
    if (attributeTables.length) {
      const common = pairsFromAttributeTable(attributeTables.flatMap(t => t.rows));
      const sysPair = common.find(p => matchLabel(p.label)?.field.id === 'system');
      if (sysPair) items.forEach(it => { if (!it.system) it.system = normalizeCode(sysPair.value).value; });
    }
  } else if (headings.length >= 2) {
    // Многосекционный бланк: секции между заголовками
    docType = 'multi';
    const sectionOf = (bi: number) => {
      let cur = -1;
      for (let h = 0; h < headings.length; h++) if (headings[h].blockIndex <= bi) cur = h;
      return cur;
    };
    const sectionPairs: RawPair[][] = headings.map(() => []);
    const preamblePairs: RawPair[] = [];
    for (const od of orderedData) {
      const sec = sectionOf(od.blockIndex);
      const bucket = sec >= 0 ? sectionPairs[sec] : preamblePairs;
      if (od.kind === 'pairs' && od.pairs) bucket.push(...od.pairs);
      else if (od.kind === 'table' && od.tableIdx !== undefined) {
        const t = tables[od.tableIdx];
        if (t.shape === 'attribute') bucket.push(...pairsFromAttributeTable(t.rows));
        else if (t.shape === 'matrix') {
          const mx = pairsFromMatrixTable(t.rows);
          bucket.push(...mx.pairs);
        }
      }
    }
    headings.forEach((h, i) => {
      const item = buildItem(sectionPairs[i], h.text, isOcr);
      // Данные из преамбулы (система, общие поля) — первому/всем без своих значений
      if (preamblePairs.length) {
        const pre = buildItem(preamblePairs, '', isOcr);
        if (!item.system && pre.system) item.system = pre.system;
      }
      items.push(item);
    });
  } else {
    // Карточка одного изделия (или опросный лист)
    docType = underscoreHeavy ? 'questionnaire' : 'card';
    const pairs: RawPair[] = [...kvPairs];
    for (const t of attributeTables) pairs.push(...pairsFromAttributeTable(t.rows));

    // Матрица: марка из уже найденных пар помогает выбрать колонку
    let matrixHeaders: string[] | undefined;
    if (matrixTables.length) {
      const brandPair = pairs.find(p => matchLabel(p.label)?.field.id === 'brand');
      for (const t of matrixTables) {
        const mx = pairsFromMatrixTable(t.rows, brandPair?.value);
        if (mx.chosen >= 0) pairs.push(...mx.pairs);
        else if (mx.headers.length) {
          matrixHeaders = mx.headers;
          warnings.push('В таблице несколько типоразмеров — выберите нужную колонку.');
        }
      }
    }

    // Опросный лист: пустые значения (подчёркивания) выбрасываем
    const cleaned = docType === 'questionnaire'
      ? pairs.filter(p => p.value.replace(/[_\s.]/g, '').length > 0)
      : pairs;

    // Проза добавляет числовые параметры, которых нет в таблицах
    const prosePairs = minePairsFromProse(proseTexts.join('\n'));
    const have = new Set(cleaned.map(p => matchLabel(p.label)?.field.id).filter(Boolean));
    for (const pp of prosePairs) {
      const fid = matchLabel(pp.label)?.field.id;
      if (fid && !have.has(fid)) { cleaned.push(pp); have.add(fid); }
    }

    const item = buildItem(cleaned, '', isOcr);
    if (matrixHeaders) item.matrixHeaders = matrixHeaders;
    items.push(item);
  }

  // 3. Дочитывание прозы для всех позиций без названия/марки/системы.
  // Для карточки/опросника заголовки тоже участвуют («Опросный лист на воздушную завесу» —
  // это тип оборудования); в многосекционном бланке заголовки уже стали названиями секций.
  const enrichTexts = docType === 'multi' ? proseTexts : [...headings.map(h => h.text), ...proseTexts];
  for (const it of items) enrichFromProse(it, enrichTexts);

  // 4. Финальные штрихи
  for (const it of items) {
    if (!it.title || it.title === 'Позиция') {
      it.title = it.brand ? `Оборудование ${it.brand}` : 'Нераспознанная позиция';
    }
    if (!it.name) it.name = it.brand || it.title.slice(0, 30);
  }

  const filtered = items.filter(it =>
    it.fields.length > 0 || it.brand || (it.matrixHeaders && it.matrixHeaders.length > 0) || it.title !== 'Нераспознанная позиция');
  if (filtered.length === 0) {
    warnings.push('Не удалось найти параметры оборудования. Проверьте, что в документе есть подписи полей (наименование, марка, расход…) со значениями.');
  }
  if (isOcr) {
    warnings.push('Документ распознан со скана (OCR) — проверьте жёлтые значения перед импортом.');
  }

  return {
    docType: filtered.length ? docType : 'unknown',
    items: filtered,
    warnings,
    stats: { dataBlocks, totalBlocks: doc.blocks.length },
  };
}

// ── Черновик → payload для сервера ───────────────────────────────────────────

import { CommitUnit, CommitSpecGroup } from './types';

export function draftToUnits(items: DraftItem[], docTitle: string): CommitUnit[] {
  const groupsOf = (it: DraftItem): CommitSpecGroup[] => {
    const map: Record<string, CommitSpecGroup> = {};
    for (const f of it.fields) {
      if (f.fieldId && ['name', 'brand', 'system', 'qty'].includes(f.fieldId)) continue;
      const g = f.group || 'Характеристики';
      if (!map[g]) map[g] = { title: g, params: [] };
      map[g].params.push({ key: f.label, value: f.value, unit: f.unit || '' });
    }
    // Свойства позиции — в группу «Общие», чтобы не потерялись в дереве
    const gen = map['Общие'] || (map['Общие'] = { title: 'Общие', params: [] });
    const addOnce = (key: string, value?: string) => {
      if (value && !gen.params.some(p => p.key === key)) gen.params.push({ key, value, unit: '' });
    };
    addOnce('Марка', it.brand);
    addOnce('Система', it.system);
    addOnce('Количество', it.qty);
    return Object.values(map).filter(g => g.params.length);
  };

  // Составное изделие: первая позиция — установка, остальные — её секции
  const ahuIdx = items.findIndex(i => i.equipType === 'ahu');
  if (items.length > 1 && ahuIdx >= 0) {
    const head = items[ahuIdx];
    const rest = items.filter((_, i) => i !== ahuIdx);
    return [{
      name: head.system || head.brand || head.name || docTitle,
      title: head.title,
      groups: groupsOf(head),
      monoblocks: [{
        name: 'M1',
        title: 'Секции установки',
        blocks: rest.map(it => ({
          name: it.name || it.title,
          title: it.title,
          equipType: it.equipType || 'component',
          groups: groupsOf(it),
        })),
      }],
    }];
  }

  // Обычный случай: документ → установка, позиции → блоки
  return [{
    name: items[0]?.system || docTitle,
    title: docTitle,
    groups: [],
    monoblocks: [{
      name: 'M1',
      title: docTitle,
      blocks: items.map(it => ({
        name: it.name || it.title,
        title: it.title,
        equipType: it.equipType || 'component',
        groups: groupsOf(it),
      })),
    }],
  }];
}
