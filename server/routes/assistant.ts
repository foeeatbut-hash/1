import type { Express, Request, Response } from 'express';
import { getPrisma } from '../context.js';

/**
 * Сводка проекта для встроенного помощника: одним запросом теги, плоский
 * список оборудования, этапы закупки, дубли, заметки и последние изменения.
 *
 * Вынесено из server.ts как есть: помощник — самостоятельная подсистема, и
 * держать её сборку данных посреди общих маршрутов значило растить файл,
 * который и так самый большой в программе.
 */
export function registerAssistantRoutes(app: Express): void {
  // Агрегатор данных для встроенного локального ассистента: одним запросом
  // отдаёт теги, плоский список оборудования и счётчики по активному проекту
  app.get('/api/assistant/data', async (req: Request, res: Response) => {
    try {
      let projectId = String(req.query.projectId || '');
      if (!projectId || projectId === 'null' || projectId === 'undefined' || projectId === 'default') {
        const firstProject = await getPrisma().project.findFirst();
        projectId = firstProject ? firstProject.id : '';
      }

      const [projects, tags, systems, usersCount, notesCount, foldersCount, filesCount] = await Promise.all([
        getPrisma().project.findMany({ select: { id: true, name: true, status: true } }),
        projectId ? getPrisma().tag.findMany({ where: { projectId } }) : Promise.resolve([]),
        projectId ? getPrisma().equipmentSystem.findMany({
          where: { projectId },
          include: { monoblocks: { include: { components: { include: { tags: true } } } } }
        }) : Promise.resolve([]),
        getPrisma().user.count(),
        getPrisma().userNote.count({ where: { OR: [{ ownerId: (req as any).authUser?.id || '' }, { ownerId: null }] } }),
        projectId ? getPrisma().folder.count({ where: { projectId } }) : Promise.resolve(0),
        projectId ? getPrisma().fileNode.count({ where: { folder: { projectId } } }) : Promise.resolve(0),
      ]);

      // Плоские характеристики компонента из JSON specs (для ответов «какой расход у …»)
      const flattenSpecs = (raw: string | null): { key: string; value: string; unit: string; group: string }[] => {
        if (!raw) return [];
        try {
          const parsed = JSON.parse(raw);
          const groups = Array.isArray(parsed?.groups) ? parsed.groups : [];
          const out: { key: string; value: string; unit: string; group: string }[] = [];
          for (const g of groups) {
            for (const p of (g?.params || [])) {
              if (p?.key && p?.value !== undefined) {
                out.push({ key: String(p.key), value: String(p.value ?? ''), unit: String(p.unit ?? ''), group: String(g.title || '') });
              }
              if (out.length >= 120) return out;
            }
          }
          return out;
        } catch { return []; }
      };

      // Плоский список компонентов оборудования с привязанными тегами
      const components: any[] = [];
      for (const sys of systems as any[]) {
        for (const mono of (sys.monoblocks || [])) {
          for (const comp of (mono.components || [])) {
            components.push({
              id: comp.id,
              name: comp.name,
              itemCode: comp.itemCode,
              systemName: sys.name,
              category: sys.category,
              monoblockName: mono.name,
              status: comp.status,
              hasConflict: comp.hasConflict,
              tags: (comp.tags || []).map((t: any) => t.identifier),
              specs: flattenSpecs(comp.specs),
            });
          }
        }
      }

      // Настроенные этапы закупки (для ответов «на каком этапе…»)
      let stages: { id: string; label: string }[] = [
        { id: 'added', label: 'Добавлен' }, { id: 'ordered', label: 'Заказан' },
        { id: 'approved', label: 'Утверждён' }, { id: 'purchased', label: 'Куплен' },
      ];
      try {
        const stSetting = await getPrisma().appSetting.findFirst({ where: { key: 'procurement_stages', userId: null } });
        if (stSetting?.value) {
          const parsed = JSON.parse(stSetting.value);
          if (Array.isArray(parsed) && parsed.length) stages = parsed.map((s: any) => ({ id: s.id, label: s.label }));
        }
      } catch (_) {}
      const stageIds = stages.map(s => s.id);

      // Разбор metadata тега: актуальность (по descriptions) и этап закупки (procurement)
      const parseTagMeta = (t: any) => { try { return t.metadata ? JSON.parse(t.metadata) : {}; } catch { return {}; } };
      const actualityOf = (meta: any): string => {
        const d = Array.isArray(meta?.descriptions) ? meta.descriptions : [];
        if (d.length === 0) return 'draft';
        if (d.some((x: any) => x.status === 'critical')) return 'critical';
        if (d.some((x: any) => x.status === 'warning')) return 'warning';
        if (d.some((x: any) => x.status === 'info')) return 'info';
        if (d.some((x: any) => x.status === 'actual')) return 'actual';
        return 'draft';
      };

      const enrichedTags = (tags as any[]).map((t: any) => {
        const meta = parseTagMeta(t);
        const proc = meta.procurement || {};
        let stageIdx = proc.stage ? stageIds.indexOf(proc.stage) : 0;
        if (stageIdx < 0) stageIdx = 0;
        // Дата, с которой позиция стоит на текущем этапе: по ней помощник
        // отвечает на «что зависло» — это главный вопрос по закупкам.
        const curStageId = stages[stageIdx]?.id;
        const stageRec = curStageId ? (proc.stageLog || {})[curStageId] : null;
        return {
          id: t.id, identifier: t.identifier, brand: t.brand,
          department: t.department, wbs: t.wbs, fluid: t.fluid,
          mainName: meta.mainName || '',
          actuality: actualityOf(meta),
          stageId: stages[stageIdx]?.id || 'added',
          stageLabel: stages[stageIdx]?.label || 'Добавлен',
          stageSince: stageRec?.at || t.createdAt || null,
          stageIsFinal: stageIdx >= stages.length - 1,
          supplier: proc.supplier || '', qty: proc.qty || '',
        };
      });

      // Дубликаты кодов тегов
      const codeCounts: Record<string, string[]> = {};
      for (const t of enrichedTags) {
        const code = (t.identifier || '').trim();
        if (code) (codeCounts[code] = codeCounts[code] || []).push(t.id);
      }
      const duplicates = Object.entries(codeCounts)
        .filter(([, ids]) => ids.length > 1)
        .map(([code, ids]) => ({ code, count: ids.length, ids }));

      const criticalCount = enrichedTags.filter(t => t.actuality === 'critical').length;
      const warningCount = enrichedTags.filter(t => t.actuality === 'warning').length;

      // Заметки (только заголовки) и последние изменения (логи)
      const [notesList, recentLogs] = await Promise.all([
        // Только свои заметки и старые общие: помощник не должен показывать
        // заголовки чужих личных записей.
        getPrisma().userNote.findMany({
          where: { OR: [{ ownerId: (req as any).authUser?.id || '' }, { ownerId: null }] },
          select: { id: true, title: true, updatedAt: true }, orderBy: { updatedAt: 'desc' }, take: 40,
        }),
        getPrisma().systemChangeLog.findMany({ orderBy: { createdAt: 'desc' }, take: 20 }),
      ]);

      res.json({
        projectId,
        projects,
        tags: enrichedTags,
        components,
        stages,
        duplicates,
        notes: (notesList as any[]).map((n: any) => ({ id: n.id, title: n.title, updatedAt: n.updatedAt })),
        recentLogs: (recentLogs as any[]).map((l: any) => ({ description: l.description, userName: l.userName, targetRoute: l.targetRoute, createdAt: l.createdAt })),
        counts: {
          tags: enrichedTags.length,
          components: components.length,
          systems: (systems as any[]).length,
          users: usersCount,
          notes: notesCount,
          folders: foldersCount,
          files: filesCount,
          projects: (projects as any[]).length,
          duplicates: duplicates.length,
          critical: criticalCount,
          warning: warningCount,
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

}
