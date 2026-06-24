// Единый модуль прав доступа «по функциям» с таймером.
// Используется и на фронте (показать/скрыть/заблокировать кнопки),
// и логически согласован с серверной проверкой в server.ts.

export interface PermEntry { enabled: boolean; until: string | null }
export type PermMap = Record<string, PermEntry>;

// Каталог выдаваемых функций. Админ-функции сюда НЕ входят —
// выданными правами нельзя «дорасти» до администратора.
export const FEATURES: { id: string; label: string; desc: string }[] = [
  { id: 'project.create',      label: 'Создание проектов',                    desc: 'Создавать новые проекты' },
  { id: 'project.manage',      label: 'Редактирование и удаление проектов',   desc: 'Изменять и удалять существующие проекты' },
  { id: 'equipment.import',    label: 'Загрузка данных в «Оборудование»',     desc: 'Импортировать данные из файлов в раздел оборудования' },
  { id: 'tags.manage',         label: 'Управление тегами и реестром',         desc: 'Создавать и редактировать теги проекта' },
  { id: 'dictionaries.manage', label: 'Управление справочниками',             desc: 'Редактировать справочники' },
  { id: 'files.delete',        label: 'Удаление файлов и папок',              desc: 'Удалять файлы и папки в проводнике' },
];

export interface PermUser {
  role?: string;
  isActive?: boolean;
  validUntil?: string | Date | null;
  permissions?: string | PermMap | null;
}

export function parsePermissions(raw: string | PermMap | null | undefined): PermMap {
  if (!raw) return {};
  if (typeof raw === 'object') return raw as PermMap;
  try {
    const obj = JSON.parse(raw);
    return obj && typeof obj === 'object' ? obj : {};
  } catch {
    return {};
  }
}

const expired = (until: string | null | undefined): boolean =>
  !!until && new Date(until).getTime() < Date.now();

// Запись права для отображения статуса в UI (без учёта роли ADMIN).
export function permEntry(user: PermUser | null | undefined, feature: string): PermEntry {
  const map = parsePermissions(user?.permissions);
  const e = map[feature];
  return { enabled: !!e?.enabled, until: e?.until ?? null };
}

// Главная проверка доступа. Админ — всегда всё.
export function can(user: PermUser | null | undefined, feature: string): boolean {
  if (!user) return false;
  if (user.role === 'ADMIN') return true;            // админ всегда главнее
  if (user.isActive === false) return false;          // профиль отключён
  if (expired(typeof user.validUntil === 'string' ? user.validUntil
      : user.validUntil instanceof Date ? user.validUntil.toISOString() : null)) return false; // профиль просрочен
  const e = parsePermissions(user.permissions)[feature];
  if (!e || !e.enabled) return false;                 // право не выдано
  if (expired(e.until)) return false;                 // право истекло по времени
  return true;
}
