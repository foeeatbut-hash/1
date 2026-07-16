import type { Express, Request, Response } from 'express';
import * as XLSX from 'xlsx';
import { getPrisma, resolveProjectId, sendError, notifyUser } from '../context.js';

// ── ВДР (Vendor Document Register) — реестр документации поставщика ──
// Дизайн: docs/vdr-docflow-design.md. Реестр первичен: строки живут без
// документов; документ Конструктора привязывается к строке (item.docId) и
// получает её реквизиты (номер, наименование, ревизия) в settings.docMeta.
// Статусы: DRAFT → READY (уведомление менеджеру) → REMARKS (уведомление
// исполнителю, файл замечаний из Проводника) → ACCEPTED.

// PostgreSQL: таблицы создаются лениво (для SQLite — миграция в server.ts)
let pgEnsured = false;
async function ensureTables(): Promise<void> {
  if (pgEnsured) return;
  const prisma = getPrisma();
  try {
    await prisma.docRegister.count();
    pgEnsured = true;
  } catch (_) {
    try {
      await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "DocRegister" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "projectId" TEXT NOT NULL,
        "name" TEXT NOT NULL DEFAULT 'ВДР',
        "vendor" TEXT NOT NULL DEFAULT '',
        "contractor" TEXT NOT NULL DEFAULT '',
        "owner" TEXT NOT NULL DEFAULT '',
        "poNumber" TEXT NOT NULL DEFAULT '',
        "managerId" TEXT,
        "createdById" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`);
      await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "DocRegisterItem" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "registerId" TEXT NOT NULL,
        "projectId" TEXT NOT NULL,
        "contractorNo" TEXT NOT NULL DEFAULT '',
        "ownerNo" TEXT NOT NULL DEFAULT '',
        "vendorNo" TEXT NOT NULL DEFAULT '',
        "titleEn" TEXT NOT NULL DEFAULT '',
        "titleRu" TEXT NOT NULL DEFAULT '',
        "vdrCode" TEXT NOT NULL DEFAULT '',
        "revision" TEXT NOT NULL DEFAULT 'A',
        "issueDate" TIMESTAMP(3),
        "reasonForIssue" TEXT NOT NULL DEFAULT '',
        "language" TEXT NOT NULL DEFAULT '',
        "equipmentTags" TEXT NOT NULL DEFAULT '[]',
        "status" TEXT NOT NULL DEFAULT 'DRAFT',
        "docId" TEXT,
        "fileNodeId" TEXT,
        "assigneeId" TEXT,
        "remarks" TEXT NOT NULL DEFAULT '',
        "meta" TEXT NOT NULL DEFAULT '{}',
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "DocRegisterItem_registerId_fkey" FOREIGN KEY ("registerId") REFERENCES "DocRegister" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      )`);
      pgEnsured = true;
    } catch (e) { /* нет прав на DDL — count вернёт понятную ошибку */ }
  }
}

// ── Разбор Excel-ВДР: эвристическое сопоставление колонок по заголовкам ──
const HEADER_MAP: { field: string; match: RegExp }[] = [
  { field: 'vendor', match: /^vendor$|поставщик/i },
  { field: 'poNumber', match: /purchase\s*order|№?\s*заказ|PO\b/i },
  { field: 'contractorNo', match: /contractor.*(doc|№|no)|номер.*подрядчик/i },
  { field: 'ownerNo', match: /owner.*(doc|№|no)|номер.*заказчик/i },
  { field: 'vendorNo', match: /vendor.*(doc|№|no)|номер.*поставщик/i },
  { field: 'titleEn', match: /english.*title|title.*english|наименование.*англ/i },
  { field: 'titleRu', match: /russian.*title|title.*russian|наименование|название/i },
  { field: 'vdrCode', match: /doc.*type|vdr|тип.*документ|код/i },
  { field: 'revision', match: /^rev|ревизия/i },
  { field: 'issueDate', match: /date|дата/i },
  { field: 'reasonForIssue', match: /reason|причина/i },
  { field: 'language', match: /language|язык/i },
];

function mapHeaders(headerRow: any[]): Record<number, string> {
  const map: Record<number, string> = {};
  const used = new Set<string>();
  headerRow.forEach((h, idx) => {
    const text = String(h ?? '').trim();
    if (!text) return;
    for (const { field, match } of HEADER_MAP) {
      if (!used.has(field) && match.test(text)) { map[idx] = field; used.add(field); break; }
    }
  });
  return map;
}

function parseDateCell(v: any): Date | null {
  if (v == null || v === '') return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if (typeof v === 'number') { // серийная дата Excel
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return isNaN(d.getTime()) ? null : d;
  }
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (m) {
    const yyyy = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    const d = new Date(yyyy, Number(m[2]) - 1, Number(m[1]));
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

// Повышение ревизии: A→B…Z; цифры 0→1→2. Утверждение (буква→0) — отдельным флагом.
export function nextRevision(rev: string, certify = false): string {
  const r = String(rev || '').trim().toUpperCase();
  if (certify) return '0';
  if (/^\d+$/.test(r)) return String(Number(r) + 1);
  if (/^[A-Z]$/.test(r)) return r === 'Z' ? '0' : String.fromCharCode(r.charCodeAt(0) + 1);
  return r ? r + '+' : 'A';
}

const STATUSES = ['DRAFT', 'READY', 'REMARKS', 'ACCEPTED'];

export function registerVdrRoutes(app: Express): void {
  const authUserOf = (req: Request): any => (req as any).authUser || null;

  app.use('/api/vdr', async (_req, _res, next) => { await ensureTables(); next(); });

  // ── Реестры проекта (со счётчиками по статусам) ──
  app.get('/api/vdr/registers', async (req: Request, res: Response) => {
    try {
      const projectId = await resolveProjectId(String(req.query.projectId || ''));
      const prisma = getPrisma();
      const registers = await prisma.docRegister.findMany({
        where: { projectId }, orderBy: { createdAt: 'asc' },
      });
      const items = await prisma.docRegisterItem.groupBy({
        by: ['registerId', 'status'], where: { projectId }, _count: { _all: true },
      }).catch(() => []);
      const counts: Record<string, Record<string, number>> = {};
      for (const g of items) {
        (counts[g.registerId] ||= {})[g.status] = g._count._all;
      }
      res.json({ registers: registers.map((r: any) => ({ ...r, counts: counts[r.id] || {} })) });
    } catch (err: any) { sendError(res, err); }
  });

  app.post('/api/vdr/registers', async (req: Request, res: Response) => {
    try {
      const me = authUserOf(req);
      const projectId = await resolveProjectId(String(req.body?.projectId || ''));
      const register = await getPrisma().docRegister.create({
        data: {
          projectId,
          name: String(req.body?.name || 'ВДР').trim() || 'ВДР',
          vendor: String(req.body?.vendor || ''),
          contractor: String(req.body?.contractor || ''),
          owner: String(req.body?.owner || ''),
          poNumber: String(req.body?.poNumber || ''),
          managerId: req.body?.managerId || null,
          createdById: me?.id || null,
        },
      });
      res.json({ register });
    } catch (err: any) { sendError(res, err); }
  });

  app.put('/api/vdr/registers/:id', async (req: Request, res: Response) => {
    try {
      const data: any = {};
      for (const k of ['name', 'vendor', 'contractor', 'owner', 'poNumber'] as const) {
        if (typeof req.body?.[k] === 'string') data[k] = req.body[k];
      }
      if ('managerId' in (req.body || {})) data.managerId = req.body.managerId || null;
      const register = await getPrisma().docRegister.update({ where: { id: req.params.id }, data });
      res.json({ register });
    } catch (err: any) { sendError(res, err); }
  });

  app.delete('/api/vdr/registers/:id', async (req: Request, res: Response) => {
    try {
      const me = authUserOf(req);
      if (me && me.role !== 'ADMIN' && me.role !== 'MANAGER') {
        return res.status(403).json({ error: 'Удалять реестр может администратор или руководитель' });
      }
      await getPrisma().docRegister.delete({ where: { id: req.params.id } });
      res.json({ success: true });
    } catch (err: any) { sendError(res, err); }
  });

  // ── Строки реестра ──
  app.get('/api/vdr/items', async (req: Request, res: Response) => {
    try {
      const registerId = String(req.query.registerId || '');
      if (!registerId) return res.json({ items: [] });
      const items = await getPrisma().docRegisterItem.findMany({
        where: { registerId }, orderBy: [{ vdrCode: 'asc' }, { contractorNo: 'asc' }],
      });
      res.json({ items });
    } catch (err: any) { sendError(res, err); }
  });

  app.post('/api/vdr/items', async (req: Request, res: Response) => {
    try {
      const prisma = getPrisma();
      const register = await prisma.docRegister.findUnique({ where: { id: String(req.body?.registerId || '') } });
      if (!register) return res.status(404).json({ error: 'Реестр не найден' });
      const item = await prisma.docRegisterItem.create({
        data: {
          registerId: register.id,
          projectId: register.projectId,
          contractorNo: String(req.body?.contractorNo || ''),
          ownerNo: String(req.body?.ownerNo || ''),
          vendorNo: String(req.body?.vendorNo || ''),
          titleEn: String(req.body?.titleEn || ''),
          titleRu: String(req.body?.titleRu || ''),
          vdrCode: String(req.body?.vdrCode || ''),
          revision: String(req.body?.revision || 'A'),
          language: String(req.body?.language || ''),
          assigneeId: req.body?.assigneeId || null,
        },
      });
      res.json({ item });
    } catch (err: any) { sendError(res, err); }
  });

  // Правка строки + документооборот статусов:
  //  READY   → уведомление менеджеру реестра «документ готов»
  //  REMARKS → уведомление исполнителю «замечания» (+ файл из Проводника)
  app.put('/api/vdr/items/:id', async (req: Request, res: Response) => {
    try {
      const me = authUserOf(req);
      const prisma = getPrisma();
      const item = await prisma.docRegisterItem.findUnique({ where: { id: req.params.id } });
      if (!item) return res.status(404).json({ error: 'Строка реестра не найдена' });

      const data: any = {};
      for (const k of ['contractorNo', 'ownerNo', 'vendorNo', 'titleEn', 'titleRu', 'vdrCode', 'revision', 'reasonForIssue', 'language', 'remarks'] as const) {
        if (typeof req.body?.[k] === 'string') data[k] = req.body[k];
      }
      if ('assigneeId' in (req.body || {})) data.assigneeId = req.body.assigneeId || null;
      if ('docId' in (req.body || {})) data.docId = req.body.docId || null;
      if ('fileNodeId' in (req.body || {})) data.fileNodeId = req.body.fileNodeId || null;
      if (typeof req.body?.equipmentTags === 'string') data.equipmentTags = req.body.equipmentTags;
      if (req.body?.issueDate !== undefined) data.issueDate = req.body.issueDate ? new Date(req.body.issueDate) : null;

      const newStatus = String(req.body?.status || '');
      if (newStatus && STATUSES.includes(newStatus) && newStatus !== item.status) {
        data.status = newStatus;
      }

      const updated = await prisma.docRegisterItem.update({ where: { id: item.id }, data });

      // Уведомления документооборота (после успешной записи)
      if (data.status) {
        const register = await prisma.docRegister.findUnique({ where: { id: item.registerId } });
        const docName = updated.contractorNo || updated.titleRu || updated.titleEn || 'документ';
        const route = `/management?vdr=${item.registerId}&item=${item.id}`;
        if (data.status === 'READY' && register?.managerId) {
          await notifyUser(register.managerId, 'ДОКУМЕНТЫ', `Документ готов: ${docName}`,
            `${updated.titleRu || updated.titleEn || ''} · рев. ${updated.revision}${me?.name ? ` · ${me.name}` : ''}`, route);
        }
        if (data.status === 'REMARKS' && updated.assigneeId) {
          await notifyUser(updated.assigneeId, 'ДОКУМЕНТЫ', `Замечания: ${docName}`,
            updated.remarks || 'Заказчик вернул замечания', updated.fileNodeId ? `/explorer?file=${updated.fileNodeId}` : route);
        }
        if (data.status === 'ACCEPTED' && updated.assigneeId) {
          await notifyUser(updated.assigneeId, 'ДОКУМЕНТЫ', `Принят заказчиком: ${docName}`, `Ревизия ${updated.revision}`, route);
        }
      }
      res.json({ item: updated });
    } catch (err: any) { sendError(res, err); }
  });

  app.delete('/api/vdr/items/:id', async (req: Request, res: Response) => {
    try {
      const me = authUserOf(req);
      if (me && me.role !== 'ADMIN' && me.role !== 'MANAGER') {
        return res.status(403).json({ error: 'Удалять строки реестра может администратор или руководитель' });
      }
      await getPrisma().docRegisterItem.delete({ where: { id: req.params.id } });
      res.json({ success: true });
    } catch (err: any) { sendError(res, err); }
  });

  // Повышение ревизии одной кнопкой: A→B…; certify=true → первое утверждение (→0)
  app.post('/api/vdr/items/:id/revision-up', async (req: Request, res: Response) => {
    try {
      const prisma = getPrisma();
      const item = await prisma.docRegisterItem.findUnique({ where: { id: req.params.id } });
      if (!item) return res.status(404).json({ error: 'Строка реестра не найдена' });
      const certify = !!req.body?.certify;
      const revision = nextRevision(item.revision, certify);
      // История ревизий — в meta.revisions (для листа «Accounting for revisions»)
      let meta: any = {}; try { meta = JSON.parse(item.meta || '{}'); } catch (_) {}
      (meta.revisions ||= []).push({ rev: item.revision, date: item.issueDate, reason: item.reasonForIssue });
      const updated = await prisma.docRegisterItem.update({
        where: { id: item.id },
        data: {
          revision,
          issueDate: new Date(),
          reasonForIssue: certify ? 'CEF' : (/^\d+$/.test(revision) ? 'CEF' : 'IFR'),
          status: 'DRAFT', // новая ревизия = снова в работе
          meta: JSON.stringify(meta),
        },
      });
      // Документ, привязанный к строке, получает новую ревизию в реквизиты титула
      if (item.docId) {
        try {
          const doc = await prisma.constructorDoc.findUnique({ where: { id: item.docId } });
          if (doc) {
            let settings: any = {}; try { settings = JSON.parse(doc.settings || '{}'); } catch (_) {}
            settings.docMeta = { ...settings.docMeta, revision };
            await prisma.constructorDoc.update({ where: { id: doc.id }, data: { settings: JSON.stringify(settings) } });
          }
        } catch (_) {}
      }
      res.json({ item: updated });
    } catch (err: any) { sendError(res, err); }
  });

  // ── Формирование документа по строке ВДР ──
  // Создаёт документ Конструктора (Ворд) с реквизитами строки: имя = номер +
  // название, docMeta = {code, revision, title} → титул заполняется сам.
  app.post('/api/vdr/items/:id/create-doc', async (req: Request, res: Response) => {
    try {
      const me = authUserOf(req);
      const prisma = getPrisma();
      const item = await prisma.docRegisterItem.findUnique({ where: { id: req.params.id } });
      if (!item) return res.status(404).json({ error: 'Строка реестра не найдена' });
      if (item.docId) {
        const existing = await prisma.constructorDoc.findUnique({ where: { id: item.docId } });
        if (existing && !existing.deletedAt) return res.json({ doc: existing, existed: true });
      }
      const title = item.titleRu || item.titleEn || '';
      const name = [item.contractorNo, title].filter(Boolean).join(' — ') || 'Документ по ВДР';
      const doc = await prisma.constructorDoc.create({
        data: {
          projectId: item.projectId,
          name,
          named: true,
          kind: String(req.body?.kind) === 'DOC' ? 'DOC' : 'TEXT',
          scope: 'SHARED',
          ownerId: me?.id || null,
          createdById: me?.id || null,
          updatedById: me?.id || null,
          workbook: '',
          settings: JSON.stringify({
            docMeta: { code: item.contractorNo || item.ownerNo, revision: item.revision, title },
            vdrItemId: item.id,
          }),
        },
      });
      await prisma.docRegisterItem.update({ where: { id: item.id }, data: { docId: doc.id, assigneeId: item.assigneeId || me?.id || null } });
      res.json({ doc });
    } catch (err: any) { sendError(res, err); }
  });

  // ── Импорт готового Excel-ВДР ──
  // Ищет лист с заголовками реестра, сопоставляет колонки эвристикой,
  // upsert по contractorNo (переимпорт обновляет, не плодит дубли).
  app.post('/api/vdr/import', async (req: Request, res: Response) => {
    try {
      const me = authUserOf(req);
      const prisma = getPrisma();
      const projectId = await resolveProjectId(String(req.body?.projectId || ''));
      let b64 = String(req.body?.content || '');
      if (b64.includes(',')) b64 = b64.split(',')[1];
      if (!b64) return res.status(400).json({ error: 'Файл не передан' });
      const wb = XLSX.read(Buffer.from(b64, 'base64'), { type: 'buffer', cellDates: true });

      // Лист реестра: по названию или первый, где нашлись ключевые колонки
      let best: { sheet: string; headerIdx: number; map: Record<number, string>; rows: any[][] } | null = null;
      for (const sn of wb.SheetNames) {
        const aoa = XLSX.utils.sheet_to_json<any[]>(wb.Sheets[sn], { header: 1, blankrows: false, defval: '' }) as any[][];
        for (let i = 0; i < Math.min(aoa.length, 12); i++) {
          const map = mapHeaders(aoa[i] || []);
          const fields = Object.values(map);
          if (fields.includes('contractorNo') || (fields.includes('titleRu') && fields.includes('revision'))) {
            const score = fields.length + (/register|вдр/i.test(sn) ? 3 : 0);
            if (!best || score > (Object.values(best.map).length + (/register|вдр/i.test(best.sheet) ? 3 : 0))) {
              best = { sheet: sn, headerIdx: i, map, rows: aoa.slice(i + 1) };
            }
            break;
          }
        }
      }
      if (!best) return res.status(400).json({ error: 'Не нашёл лист реестра: нет колонок с номером документа/названием/ревизией' });

      // Реестр: существующий (registerId) или новый с именем файла
      let register: any = null;
      if (req.body?.registerId) {
        register = await prisma.docRegister.findUnique({ where: { id: String(req.body.registerId) } });
      }
      if (!register) {
        register = await prisma.docRegister.create({
          data: {
            projectId,
            name: String(req.body?.name || req.body?.fileName || 'ВДР (импорт)').replace(/\.[^.]+$/, ''),
            createdById: me?.id || null,
          },
        });
      }

      const existing = await prisma.docRegisterItem.findMany({ where: { registerId: register.id } });
      const byNo = new Map(existing.filter((x: any) => x.contractorNo).map((x: any) => [x.contractorNo, x]));

      let created = 0, updated = 0, skipped = 0;
      const regHeader: any = {};
      for (const row of best.rows) {
        const rec: any = {};
        for (const [idxStr, field] of Object.entries(best.map)) {
          const v = row[Number(idxStr)];
          if (field === 'issueDate') rec.issueDate = parseDateCell(v);
          else rec[field] = String(v ?? '').trim();
        }
        // Пустые строки и повторы шапки пропускаем
        const hasKey = rec.contractorNo || rec.titleRu || rec.titleEn;
        if (!hasKey) { skipped++; continue; }
        if (/contractor|owner|title/i.test(rec.contractorNo || '')) { skipped++; continue; }
        if (rec.vendor && !regHeader.vendor) regHeader.vendor = rec.vendor;
        if (rec.poNumber && !regHeader.poNumber) regHeader.poNumber = rec.poNumber;
        const itemData = {
          contractorNo: rec.contractorNo || '',
          ownerNo: rec.ownerNo || '',
          vendorNo: rec.vendorNo || '',
          titleEn: rec.titleEn || '',
          titleRu: rec.titleRu || '',
          vdrCode: rec.vdrCode || '',
          revision: rec.revision || 'A',
          issueDate: rec.issueDate || null,
          reasonForIssue: rec.reasonForIssue || '',
          language: rec.language || '',
        };
        const prev = rec.contractorNo ? byNo.get(rec.contractorNo) : null;
        if (prev) {
          await prisma.docRegisterItem.update({ where: { id: prev.id }, data: itemData });
          updated++;
        } else {
          await prisma.docRegisterItem.create({ data: { ...itemData, registerId: register.id, projectId } });
          created++;
        }
      }
      // Реквизиты реестра из колонок (vendor/PO), если ещё пустые
      if (regHeader.vendor || regHeader.poNumber) {
        await prisma.docRegister.update({
          where: { id: register.id },
          data: {
            ...(register.vendor ? {} : { vendor: regHeader.vendor || '' }),
            ...(register.poNumber ? {} : { poNumber: regHeader.poNumber || '' }),
          },
        });
      }
      res.json({ register, created, updated, skipped, sheet: best.sheet });
    } catch (err: any) { sendError(res, err); }
  });
}
