import type { Express, Request, Response } from 'express';
import { getPrisma, resolveProjectId, sendError } from '../context.js';

// ── Конструктор: документы-таблицы, собираемые из данных проекта ──
// Дизайн: docs/constructor-design-v0.25*.md. Здесь MVP-слой:
// - CRUD документов (общие/личные, корзина, автосейв снапшота книги);
// - каталог полей проекта (стандартные поля тегов + динамические параметры
//   оборудования из specs с учётом overrides);
// - исполнитель запросов: сущность + колонки-пути + фильтры → строки.

// ── Разбор specs и overrides (та же логика, что на экране «Оборудование») ──
function normalizeSpecs(raw: any): { groups: { title: string; params: { key: string; value: string; unit?: string }[] }[] } {
  let parsed: any = raw;
  if (typeof raw === 'string') {
    try { parsed = JSON.parse(raw); } catch (_) { return { groups: [] }; }
  }
  if (parsed && Array.isArray(parsed.groups)) {
    return { groups: parsed.groups.map((g: any) => ({ title: g?.title || 'Параметры', params: Array.isArray(g?.params) ? g.params : [] })) };
  }
  if (Array.isArray(parsed)) {
    return { groups: parsed.map((g: any) => ({ title: g?.title || 'Параметры', params: Array.isArray(g?.params) ? g.params : [] })) };
  }
  if (parsed && typeof parsed === 'object') {
    const params = Object.entries(parsed).map(([k, v]: [string, any]) => ({ key: k, value: String(v ?? '') }));
    return { groups: params.length ? [{ title: 'Параметры', params }] : [] };
  }
  return { groups: [] };
}

function parseJsonSafe(raw: any): any {
  if (!raw) return null;
  if (typeof raw !== 'string') return raw;
  try { return JSON.parse(raw); } catch (_) { return null; }
}

// Значение параметра элемента: specs с наложенными ручными overrides ("группа|ключ")
function elementParamValue(el: any, group: string, key: string): string {
  const overrides = parseJsonSafe(el.overrides) || {};
  const ovKey = `${group}|${key}`;
  if (ovKey in overrides) return String(overrides[ovKey] ?? '');
  const specs = normalizeSpecs(el.specs);
  for (const g of specs.groups) {
    if (g.title !== group) continue;
    for (const p of (g.params || [])) {
      if (p.key === key) return String(p.value ?? '');
    }
  }
  return '';
}

// ── Срез проекта: теги + элементы с распарсенными specs ──
async function loadProjectSlice(projectId: string) {
  const prisma = getPrisma();
  const [tags, systems] = await Promise.all([
    prisma.tag.findMany({
      where: { projectId },
      include: { componentElements: { include: { monoblock: { include: { system: true } } } } },
      orderBy: { identifier: 'asc' },
    }),
    prisma.equipmentSystem.findMany({
      where: { projectId },
      include: { monoblocks: { include: { components: { include: { tags: true } } } } },
    }),
  ]);
  const elements: any[] = [];
  for (const sys of systems) {
    for (const mono of (sys.monoblocks || [])) {
      for (const el of (mono.components || [])) {
        elements.push({ ...el, _system: sys, _monoblock: mono });
      }
    }
  }
  return { tags, elements };
}

// ── Разрешение значения по пути поля ──
// Пути (часть II дизайна, MVP-подмножество):
//   простые поля своей сущности; param:Группа|Ключ; meta:ключ;
//   system.name / monoblock.name; tags (список тегов элемента)
function resolveValue(entity: 'tag' | 'element', row: any, path: string): string {
  if (path.startsWith('param:')) {
    const [group, key] = path.slice(6).split('|');
    if (entity === 'element') return elementParamValue(row, group, key);
    // тег → через связанные элементы: первое непустое значение
    for (const el of (row.componentElements || [])) {
      const v = elementParamValue(el, group, key);
      if (v !== '') return v;
    }
    return '';
  }
  if (path.startsWith('meta:')) {
    const meta = parseJsonSafe(row.metadata) || {};
    // точечный путь без выражений: meta:procurement.stage
    let cur: any = meta;
    for (const part of path.slice(5).split('.')) {
      if (cur == null || typeof cur !== 'object') return '';
      cur = cur[part];
    }
    return cur == null ? '' : (typeof cur === 'object' ? JSON.stringify(cur) : String(cur));
  }
  if (entity === 'element') {
    switch (path) {
      case 'name': return String(row.name ?? '');
      case 'itemCode': return String(row.itemCode ?? '');
      case 'equipType': return String(row.equipType ?? '');
      case 'status': return String(row.status ?? '');
      case 'system.name': return String(row._system?.name ?? '');
      case 'monoblock.name': return String(row._monoblock?.name ?? '');
      case 'tags': return (row.tags || []).map((t: any) => t.identifier).join('; ');
    }
    return '';
  }
  // entity === 'tag'
  switch (path) {
    case 'identifier': return String(row.identifier ?? '');
    case 'brand': return String(row.brand ?? '');
    case 'department': return String(row.department ?? '');
    case 'wbs': return String(row.wbs ?? '');
    case 'fluid': return String(row.fluid ?? '');
    case 'createdAt': return row.createdAt ? new Date(row.createdAt).toLocaleDateString('ru-RU') : '';
    case 'element.name': return String(row.componentElements?.[0]?.name ?? '');
    case 'element.itemCode': return String(row.componentElements?.[0]?.itemCode ?? '');
    case 'element.equipType': return String(row.componentElements?.[0]?.equipType ?? '');
    case 'system.name': return String(row.componentElements?.[0]?.monoblock?.system?.name ?? '');
    case 'monoblock.name': return String(row.componentElements?.[0]?.monoblock?.name ?? '');
  }
  return '';
}

// Число из строки в русской записи: «1 250,5 мм» → 1250.5 (для сортировки/фильтров)
function parseRuNumber(v: string): number | null {
  const s = String(v || '').replace(/[\s ]/g, '').replace(',', '.').match(/^-?\d+(\.\d+)?/);
  return s ? parseFloat(s[0]) : null;
}

function applyFilter(value: string, op: string, target: any): boolean {
  const v = String(value ?? '');
  switch (op) {
    case 'contains': return v.toLowerCase().includes(String(target ?? '').toLowerCase());
    case 'ncontains': return !v.toLowerCase().includes(String(target ?? '').toLowerCase());
    case 'eq': return v === String(target ?? '');
    case 'neq': return v !== String(target ?? '');
    case 'in': return Array.isArray(target) && target.map(String).includes(v);
    case 'empty': return v.trim() === '';
    case 'nempty': return v.trim() !== '';
    case 'gt': { const a = parseRuNumber(v), b = parseRuNumber(String(target)); return a != null && b != null && a > b; }
    case 'lt': { const a = parseRuNumber(v), b = parseRuNumber(String(target)); return a != null && b != null && a < b; }
    default: return true;
  }
}

// PostgreSQL-режим: таблица создаётся лениво при первом обращении к разделу
// (для SQLite её создаёт догоняющая миграция при старте сервера)
let pgEnsured = false;
async function ensureTableExists(): Promise<void> {
  if (pgEnsured) return;
  const prisma = getPrisma();
  try {
    await prisma.constructorDoc.count();
    pgEnsured = true;
  } catch (_) {
    try {
      await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "ConstructorDoc" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "projectId" TEXT NOT NULL,
        "name" TEXT NOT NULL DEFAULT 'Без названия',
        "kind" TEXT NOT NULL DEFAULT 'DOC',
        "scope" TEXT NOT NULL DEFAULT 'SHARED',
        "ownerId" TEXT,
        "named" BOOLEAN NOT NULL DEFAULT false,
        "description" TEXT NOT NULL DEFAULT '',
        "workbook" TEXT NOT NULL DEFAULT '',
        "bindings" TEXT NOT NULL DEFAULT '[]',
        "settings" TEXT NOT NULL DEFAULT '{}',
        "createdById" TEXT,
        "updatedById" TEXT,
        "deletedAt" TIMESTAMP(3),
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "ConstructorDoc_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      )`);
      await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "ConstructorDoc_projectId_kind_idx" ON "ConstructorDoc"("projectId", "kind")');
      pgEnsured = true;
    } catch (e) { /* нет прав на DDL — count упадёт и вернёт понятную ошибку */ }
  }
}

export function registerConstructorRoutes(app: Express): void {
  const authUserOf = (req: Request): any => (req as any).authUser || null;

  // Гарантия таблицы перед любым запросом раздела
  app.use('/api/constructor', async (_req, _res, next) => {
    await ensureTableExists();
    next();
  });

  // Видимость документа: общие — всем, личные — только владельцу
  const visibleWhere = (projectId: string, userId: string | null) => ({
    projectId,
    OR: [
      { scope: 'SHARED' },
      ...(userId ? [{ scope: 'PERSONAL', ownerId: userId }] : []),
    ],
  });

  // ── Список документов (Библиотека): активные + корзина ──
  app.get('/api/constructor/docs', async (req: Request, res: Response) => {
    try {
      const projectId = await resolveProjectId(String(req.query.projectId || ''));
      const me = authUserOf(req);
      const docs = await getPrisma().constructorDoc.findMany({
        where: visibleWhere(projectId, me?.id || null),
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true, name: true, kind: true, scope: true, ownerId: true, named: true,
          createdById: true, updatedById: true, deletedAt: true, createdAt: true, updatedAt: true,
        },
      });
      res.json({ docs });
    } catch (err: any) { sendError(res, err); }
  });

  // ── Создание: без вопросов, сразу рабочий документ (часть III §3.1) ──
  app.post('/api/constructor/docs', async (req: Request, res: Response) => {
    try {
      const me = authUserOf(req);
      const projectId = await resolveProjectId(String(req.body?.projectId || ''));
      const now = new Date();
      const autoName = `Без названия — ${now.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}`;
      const doc = await getPrisma().constructorDoc.create({
        data: {
          projectId,
          name: String(req.body?.name || autoName),
          named: !!req.body?.name,
          kind: req.body?.kind === 'TEMPLATE' ? 'TEMPLATE' : 'DOC',
          scope: 'SHARED', // по умолчанию все документы общие
          ownerId: me?.id || null,
          createdById: me?.id || null,
          updatedById: me?.id || null,
          workbook: String(req.body?.workbook || ''),
        },
      });
      res.json({ doc });
    } catch (err: any) { sendError(res, err); }
  });

  // ── Документ целиком (со снапшотом книги) ──
  app.get('/api/constructor/docs/:id', async (req: Request, res: Response) => {
    try {
      const me = authUserOf(req);
      const doc = await getPrisma().constructorDoc.findUnique({ where: { id: req.params.id } });
      if (!doc) return res.status(404).json({ error: 'Документ не найден' });
      if (doc.scope === 'PERSONAL' && doc.ownerId !== me?.id) {
        return res.status(403).json({ error: 'Личный документ другого пользователя' });
      }
      res.json({ doc });
    } catch (err: any) { sendError(res, err); }
  });

  // ── Автосейв и свойства (имя, scope, корзина) ──
  app.put('/api/constructor/docs/:id', async (req: Request, res: Response) => {
    try {
      const me = authUserOf(req);
      const prisma = getPrisma();
      const doc = await prisma.constructorDoc.findUnique({ where: { id: req.params.id } });
      if (!doc) return res.status(404).json({ error: 'Документ не найден' });
      if (doc.scope === 'PERSONAL' && doc.ownerId !== me?.id) {
        return res.status(403).json({ error: 'Личный документ другого пользователя' });
      }

      const data: any = { updatedById: me?.id || null };
      if (typeof req.body?.workbook === 'string') data.workbook = req.body.workbook;
      if (typeof req.body?.bindings === 'string') data.bindings = req.body.bindings;
      if (typeof req.body?.settings === 'string') data.settings = req.body.settings;
      if (typeof req.body?.name === 'string' && req.body.name.trim()) {
        data.name = req.body.name.trim();
        data.named = true;
      }
      // Личный/Общий переключает только автор (и админ) — часть III §3.2
      if (req.body?.scope === 'PERSONAL' || req.body?.scope === 'SHARED') {
        if (doc.createdById && doc.createdById !== me?.id && me?.role !== 'ADMIN') {
          return res.status(403).json({ error: 'Переключать «Личный/Общий» может только автор документа' });
        }
        data.scope = req.body.scope;
        data.ownerId = doc.ownerId || doc.createdById || me?.id || null;
      }
      if (req.body?.deleted === true) data.deletedAt = new Date();   // в корзину
      if (req.body?.deleted === false) data.deletedAt = null;        // восстановить

      const updated = await prisma.constructorDoc.update({ where: { id: doc.id }, data });
      res.json({ doc: updated });
    } catch (err: any) { sendError(res, err); }
  });

  // ── Окончательное удаление (из корзины) ──
  app.delete('/api/constructor/docs/:id', async (req: Request, res: Response) => {
    try {
      const me = authUserOf(req);
      const prisma = getPrisma();
      const doc = await prisma.constructorDoc.findUnique({ where: { id: req.params.id } });
      if (!doc) return res.status(404).json({ error: 'Документ не найден' });
      const isAuthor = !doc.createdById || doc.createdById === me?.id;
      if (!isAuthor && me?.role !== 'ADMIN' && me?.role !== 'MANAGER') {
        return res.status(403).json({ error: 'Удалять может автор или руководитель' });
      }
      await prisma.constructorDoc.delete({ where: { id: doc.id } });
      res.json({ success: true });
    } catch (err: any) { sendError(res, err); }
  });

  // ── Дублирование ──
  app.post('/api/constructor/docs/:id/duplicate', async (req: Request, res: Response) => {
    try {
      const me = authUserOf(req);
      const prisma = getPrisma();
      const doc = await prisma.constructorDoc.findUnique({ where: { id: req.params.id } });
      if (!doc) return res.status(404).json({ error: 'Документ не найден' });
      if (doc.scope === 'PERSONAL' && doc.ownerId !== me?.id) {
        return res.status(403).json({ error: 'Личный документ другого пользователя' });
      }
      const copy = await prisma.constructorDoc.create({
        data: {
          projectId: doc.projectId,
          name: `${doc.name} (копия)`,
          named: doc.named,
          kind: doc.kind,
          scope: doc.scope,
          ownerId: me?.id || null,
          createdById: me?.id || null,
          updatedById: me?.id || null,
          workbook: doc.workbook,
          bindings: doc.bindings,
          settings: doc.settings,
        },
      });
      res.json({ doc: copy });
    } catch (err: any) { sendError(res, err); }
  });

  // ── Каталог полей проекта (часть II §5): что вообще можно выбрать ──
  app.get('/api/constructor/catalog', async (req: Request, res: Response) => {
    try {
      const projectId = await resolveProjectId(String(req.query.projectId || ''));
      const { tags, elements } = await loadProjectSlice(projectId);

      // Дерево параметров «группа → ключ» с заполненностью и единицами
      const paramMap = new Map<string, { group: string; key: string; unit: string; count: number; sample: string }>();
      for (const el of elements) {
        const specs = normalizeSpecs(el.specs);
        for (const g of specs.groups) {
          for (const p of (g.params || [])) {
            if (!p.key) continue;
            const id = `${g.title}|${p.key}`;
            const rec = paramMap.get(id) || { group: g.title, key: p.key, unit: p.unit || '', count: 0, sample: '' };
            rec.count++;
            if (!rec.sample && p.value) rec.sample = String(p.value).slice(0, 40);
            if (!rec.unit && p.unit) rec.unit = p.unit;
            paramMap.set(id, rec);
          }
        }
      }

      // Ключи metadata тегов (по факту встречаемости, только верхний уровень)
      const metaMap = new Map<string, number>();
      for (const t of tags) {
        const meta = parseJsonSafe(t.metadata);
        if (meta && typeof meta === 'object') {
          for (const k of Object.keys(meta)) metaMap.set(k, (metaMap.get(k) || 0) + 1);
        }
      }

      res.json({
        counts: { tags: tags.length, elements: elements.length },
        tagFields: [
          { path: 'identifier', title: 'Тег (идентификатор)' },
          { path: 'brand', title: 'Марка' },
          { path: 'department', title: 'Отдел' },
          { path: 'wbs', title: 'WBS' },
          { path: 'fluid', title: 'Среда' },
          { path: 'createdAt', title: 'Дата создания' },
          { path: 'element.name', title: 'Элемент (наименование)' },
          { path: 'element.itemCode', title: 'Элемент (код)' },
          { path: 'element.equipType', title: 'Тип оборудования' },
          { path: 'system.name', title: 'Система' },
          { path: 'monoblock.name', title: 'Моноблок' },
        ],
        elementFields: [
          { path: 'name', title: 'Наименование' },
          { path: 'itemCode', title: 'Код позиции' },
          { path: 'equipType', title: 'Тип оборудования' },
          { path: 'system.name', title: 'Система' },
          { path: 'monoblock.name', title: 'Моноблок' },
          { path: 'tags', title: 'Теги' },
          { path: 'status', title: 'Статус' },
        ],
        params: Array.from(paramMap.values()).sort((a, b) =>
          a.group.localeCompare(b.group, 'ru') || a.key.localeCompare(b.key, 'ru')),
        metaKeys: Array.from(metaMap.entries()).map(([key, count]) => ({ path: `meta:${key}`, key, count })),
      });
    } catch (err: any) { sendError(res, err); }
  });

  // ── Свежесть данных: «отпечаток» состояния проекта по типам сущностей ──
  // Дёшево (без исполнения фильтров): блок сравнивает отпечаток на момент
  // своего обновления с текущим — расхождение = значок «данные изменились».
  // Ложноположительные срабатывания допустимы, ложноотрицательных нет.
  app.get('/api/constructor/fingerprint', async (req: Request, res: Response) => {
    try {
      const projectId = await resolveProjectId(String(req.query.projectId || ''));
      const prisma = getPrisma();
      const [tagCount, tagMax, elCount, elMax] = await Promise.all([
        prisma.tag.count({ where: { projectId } }),
        prisma.tag.aggregate({ where: { projectId }, _max: { createdAt: true, updatedAt: true } }),
        prisma.componentElement.count({ where: { monoblock: { system: { projectId } } } }),
        prisma.componentElement.aggregate({ where: { monoblock: { system: { projectId } } }, _max: { updatedAt: true } }),
      ]);
      res.json({
        tag: `${tagCount}:${tagMax._max.createdAt?.toISOString?.() || ''}:${tagMax._max.updatedAt?.toISOString?.() || ''}`,
        element: `${elCount}:${elMax._max.updatedAt?.toISOString?.() || ''}`,
      });
    } catch (err: any) { sendError(res, err); }
  });

  // ── Исполнитель запросов: сущность + колонки + фильтры → строки ──
  app.post('/api/constructor/query', async (req: Request, res: Response) => {
    try {
      const projectId = await resolveProjectId(String(req.body?.projectId || ''));
      const entity: 'tag' | 'element' = req.body?.entity === 'element' ? 'element' : 'tag';
      const columns: string[] = Array.isArray(req.body?.columns) ? req.body.columns.map(String) : [];
      const filters: { field: string; op: string; value?: any }[] = Array.isArray(req.body?.filters) ? req.body.filters : [];
      const sort: { field: string; dir: string } | null = req.body?.sort || null;
      const limit = Math.min(Number(req.body?.limit) || 50000, 50000);

      const slice = await loadProjectSlice(projectId);
      let rows: any[] = entity === 'tag' ? slice.tags : slice.elements;

      for (const f of filters) {
        rows = rows.filter(r => applyFilter(resolveValue(entity, r, f.field), f.op, f.value));
      }

      if (sort?.field) {
        const dir = sort.dir === 'desc' ? -1 : 1;
        rows = [...rows].sort((a, b) => {
          const va = resolveValue(entity, a, sort.field);
          const vb = resolveValue(entity, b, sort.field);
          const na = parseRuNumber(va), nb = parseRuNumber(vb);
          if (na != null && nb != null) return (na - nb) * dir;
          return va.localeCompare(vb, 'ru') * dir;
        });
      }

      const total = rows.length;
      const out = rows.slice(0, limit).map(r => ({
        key: `${entity}:${r.id}`,
        cells: columns.map(c => {
          const v = resolveValue(entity, r, c);
          // Числа отдаём числами — иначе в таблице не заработает СУММ()
          const n = parseRuNumber(v);
          return n != null && String(n) === v.replace(/[\s ]/g, '').replace(',', '.') ? n : v;
        }),
        route: entity === 'tag' ? `/registry?tag=${r.id}` : `/equipment?elementId=${r.id}`,
      }));

      res.json({ rows: out, total, truncated: total > limit });
    } catch (err: any) { sendError(res, err); }
  });
}
