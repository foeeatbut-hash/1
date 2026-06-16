import { EquipParseResult, SpecGroup } from './equipmentParser.js';

// Плоская карта параметров: ключ "группа||параметр" -> { value, unit }
export function flattenGroups(groups: SpecGroup[]): Record<string, { value: string; unit: string }> {
  const map: Record<string, { value: string; unit: string }> = {};
  for (const g of groups || []) {
    for (const p of g.params || []) {
      map[`${g.title}||${p.key}`] = { value: String(p.value ?? ''), unit: String(p.unit ?? '') };
    }
  }
  return map;
}

export interface ParamConflict { group: string; key: string; oldValue: string; newValue: string; unit: string; }

function diffSpecs(oldGroups: SpecGroup[], newGroups: SpecGroup[]): ParamConflict[] {
  const oldMap = flattenGroups(oldGroups);
  const newMap = flattenGroups(newGroups);
  const conflicts: ParamConflict[] = [];
  for (const k of Object.keys(newMap)) {
    const [group, key] = k.split('||');
    const ov = oldMap[k];
    if (!ov) {
      conflicts.push({ group, key, oldValue: '', newValue: newMap[k].value, unit: newMap[k].unit });
    } else if (String(ov.value) !== String(newMap[k].value)) {
      conflicts.push({ group, key, oldValue: ov.value, newValue: newMap[k].value, unit: newMap[k].unit });
    }
  }
  return conflicts;
}

export interface ImportSummary { conflictsCount: number; newBlocks: number; updatedBlocks: number; systems: number; }

/**
 * Записывает разобранный расчёт в БД: установки → моноблоки → блоки.
 * specs хранятся сгруппированно. При повторном импорте сверяет по параметрам.
 * conflictMode='immediate' — сразу применяет новые значения; 'wait' — оставляет
 * старые и помечает конфликты для ручного решения (✓/✏️).
 */
export async function importEquipmentToDB(
  prisma: any,
  projectId: string,
  category: string,
  fileName: string,
  result: EquipParseResult,
  conflictMode: 'immediate' | 'wait',
): Promise<ImportSummary> {
  const summary: ImportSummary = { conflictsCount: 0, newBlocks: 0, updatedBlocks: 0, systems: 0 };

  for (const unitData of result.units) {
    summary.systems++;
    let system = await prisma.equipmentSystem.findFirst({
      where: { projectId, name: unitData.name, category },
    });
    if (!system) {
      system = await prisma.equipmentSystem.create({
        data: { projectId, name: unitData.name, category, fileName },
      });
    }

    // Параметры самой установки храним отдельным служебным блоком "__unit__"
    const unitBlocks = [
      { name: '__unit__', title: unitData.title, equipType: 'УСТАНОВКА', groups: unitData.groups },
      ...unitData.monoblocks.flatMap(mb =>
        mb.blocks.map(b => ({ ...b, __mb: mb }))
      ),
    ];

    // Создаём моноблоки заранее
    const mbMap: Record<string, any> = {};
    for (const mb of unitData.monoblocks) {
      let monoblock = await prisma.monoblock.findFirst({ where: { systemId: system.id, name: mb.name } });
      if (!monoblock) monoblock = await prisma.monoblock.create({ data: { systemId: system.id, name: mb.name } });
      mbMap[mb.name] = monoblock;
    }
    // Служебный моноблок для параметров установки
    let unitMb = await prisma.monoblock.findFirst({ where: { systemId: system.id, name: '__unit__' } });
    if (!unitMb) unitMb = await prisma.monoblock.create({ data: { systemId: system.id, name: '__unit__' } });

    for (const blk of unitBlocks as any[]) {
      const monoblock = blk.__mb ? mbMap[blk.__mb.name] : unitMb;
      const newGroups = blk.groups || [];
      const serialized = JSON.stringify({ groups: newGroups });

      let component = await prisma.componentElement.findFirst({
        where: { monoblockId: monoblock.id, itemCode: blk.name },
        include: { tags: true },
      });

      if (!component) {
        await prisma.componentElement.create({
          data: {
            monoblockId: monoblock.id,
            itemCode: blk.name,
            name: blk.title || blk.name,
            equipType: blk.equipType || 'ПРОЧЕЕ',
            specs: serialized,
            version: 1,
            status: 'OK',
          },
        });
        summary.newBlocks++;
        continue;
      }

      const oldParsed = component.specs ? JSON.parse(component.specs) : { groups: [] };
      const oldGroups = oldParsed.groups || [];
      const conflicts = diffSpecs(oldGroups, newGroups);

      if (conflicts.length === 0) {
        // Нет изменений — освежим название/тип на всякий случай
        await prisma.componentElement.update({
          where: { id: component.id },
          data: { name: blk.title || component.name, equipType: blk.equipType || component.equipType },
        });
        continue;
      }

      summary.updatedBlocks++;
      summary.conflictsCount += conflicts.length;

      // История версий
      await prisma.equipmentHistory.create({
        data: {
          elementId: component.id,
          version: component.version,
          oldSpecs: component.specs,
          newSpecs: serialized,
          changeType: 'UPDATE',
        },
      });

      if (conflictMode === 'immediate') {
        await prisma.componentElement.update({
          where: { id: component.id },
          data: {
            specs: serialized,
            name: blk.title || component.name,
            equipType: blk.equipType || component.equipType,
            version: component.version + 1,
            hasConflict: false,
            status: 'OK',
            paramConflicts: null,
          },
        });
      } else {
        // 'wait' — оставляем старые значения, помечаем конфликты для решения
        await prisma.componentElement.update({
          where: { id: component.id },
          data: {
            equipType: blk.equipType || component.equipType,
            hasConflict: true,
            status: 'CONFLICT',
            conflictType: 'SPEC_CHANGE',
            paramConflicts: JSON.stringify(conflicts),
          },
        });
      }
    }
  }

  return summary;
}
