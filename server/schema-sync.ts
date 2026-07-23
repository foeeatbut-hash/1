// Автоматическая миграция общей базы (PostgreSQL / MariaDB) под схему программы.
//
// Зачем: локальная база (SQLite) при каждом старте догоняет схему в
// ensureSchemaColumns(). Для общей базы этого не было — новая колонка/таблица в
// новой версии программы не появлялась сама, и базу пришлось бы править вручную.
//
// Этот модуль на каждом старте в совместном режиме приводит живую базу к схеме
// программы: добавляет недостающие таблицы и колонки. ТОЛЬКО ДОБАВЛЯЕТ — ничего
// не удаляет и не меняет типы, поэтому данные в безопасности. Источник истины —
// файл prisma/schema.<движок>.prisma, который едет внутри обновления программы.

type Dialect = 'postgresql' | 'mysql';

interface Column {
  name: string;
  sqlType: string;
  nullable: boolean;
  isId: boolean;
  unique: boolean;
  defaultSql: string | null; // готовый фрагмент DEFAULT ... или null
}

interface Model {
  name: string;
  columns: Column[];
}

const SCALARS = new Set(['String', 'Int', 'Boolean', 'DateTime', 'Float', 'BigInt', 'Decimal', 'Json']);

function quoteId(dialect: Dialect, id: string): string {
  return dialect === 'mysql' ? `\`${id}\`` : `"${id}"`;
}

function quoteStr(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

// Тип колонки в SQL для конкретного движка
function sqlType(dialect: Dialect, base: string, dbAttr: string | null): string {
  if (dbAttr) {
    const m = dbAttr.match(/^(\w+)(\([^)]*\))?$/);
    const t = (m?.[1] || '').toLowerCase();
    const arg = m?.[2] || '';
    if (t === 'text') return 'TEXT';
    if (t === 'longtext') return dialect === 'mysql' ? 'LONGTEXT' : 'TEXT';
    if (t === 'mediumtext') return dialect === 'mysql' ? 'MEDIUMTEXT' : 'TEXT';
    if (t === 'varchar') return `VARCHAR${arg || '(191)'}`;
    if (t === 'char') return `CHAR${arg || '(1)'}`;
  }
  switch (base) {
    case 'String': return dialect === 'mysql' ? 'VARCHAR(191)' : 'TEXT';
    case 'Int': return 'INTEGER';
    case 'Boolean': return dialect === 'mysql' ? 'TINYINT(1)' : 'BOOLEAN';
    case 'DateTime': return dialect === 'mysql' ? 'DATETIME(3)' : 'TIMESTAMP(3)';
    case 'Float': return dialect === 'mysql' ? 'DOUBLE' : 'DOUBLE PRECISION';
    case 'BigInt': return 'BIGINT';
    case 'Decimal': return 'DECIMAL(65,30)';
    case 'Json': return dialect === 'mysql' ? 'JSON' : 'JSONB';
    default: return dialect === 'mysql' ? 'VARCHAR(191)' : 'TEXT';
  }
}

// DEFAULT из @default(...) Prisma; null = функция-генератор (id) → без SQL-дефолта
function defaultSql(dialect: Dialect, base: string, raw: string | null): string | null {
  if (raw == null) return null;
  const v = raw.trim();
  if (/^(uuid|cuid|autoincrement|dbgenerated)\s*\(/.test(v)) return null;
  if (/^now\s*\(/.test(v)) return dialect === 'mysql' ? 'CURRENT_TIMESTAMP(3)' : 'CURRENT_TIMESTAMP(3)';
  if (v === 'true') return dialect === 'mysql' ? '1' : 'true';
  if (v === 'false') return dialect === 'mysql' ? '0' : 'false';
  if (/^-?\d+(\.\d+)?$/.test(v)) return v;
  const str = v.match(/^"([\s\S]*)"$/);
  if (str) return quoteStr(str[1]);
  return null;
}

// Синтетический дефолт для NOT NULL колонки без @default — чтобы ADD COLUMN не
// падал на таблице с существующими строками
function fallbackDefault(dialect: Dialect, base: string): string {
  switch (base) {
    case 'Int': case 'Float': case 'BigInt': case 'Decimal': return '0';
    case 'Boolean': return dialect === 'mysql' ? '0' : 'false';
    case 'DateTime': return 'CURRENT_TIMESTAMP(3)';
    default: return quoteStr('');
  }
}

// Разбор schema.prisma → модели с колонками (связи и списки пропускаются)
export function parsePrismaSchema(dialect: Dialect, text: string): Model[] {
  const models: Model[] = [];
  const modelRe = /model\s+(\w+)\s*\{([\s\S]*?)\n\}/g;
  let mm: RegExpExecArray | null;
  while ((mm = modelRe.exec(text))) {
    const name = mm[1];
    const body = mm[2];
    const columns: Column[] = [];
    for (const lineRaw of body.split('\n')) {
      const line = lineRaw.replace(/\/\/.*$/, '').trim();
      if (!line || line.startsWith('@@')) continue;
      const fm = line.match(/^(\w+)\s+(\w+)(\?|\[\])?(.*)$/);
      if (!fm) continue;
      const [, fname, base, suffix, attrsRaw] = fm;
      if (suffix === '[]') continue;            // список — это связь
      if (!SCALARS.has(base)) continue;         // тип-модель — это связь
      const attrs = attrsRaw || '';
      const nullable = suffix === '?';
      const isId = /@id\b/.test(attrs);
      const unique = /@unique\b/.test(attrs);
      const dbAttr = (attrs.match(/@db\.(\w+(?:\([^)]*\))?)/) || [])[1] || null;
      const defRaw = (attrs.match(/@default\(([\s\S]*?)\)\s*(?:@|$)/) || [])[1]
        ?? (attrs.match(/@default\(([\s\S]*)\)/) || [])[1] ?? null;
      columns.push({
        name: fname,
        sqlType: sqlType(dialect, base, dbAttr),
        nullable,
        isId,
        unique,
        defaultSql: defaultSql(dialect, base, defRaw),
      });
      // запоминаем базовый тип для fallback-дефолта
      (columns[columns.length - 1] as any)._base = base;
    }
    if (columns.length) models.push({ name, columns });
  }
  return models;
}

function columnDdl(dialect: Dialect, c: Column): string {
  const base = (c as any)._base as string;
  let def = c.defaultSql;
  if (!c.nullable && !c.isId && def == null) def = fallbackDefault(dialect, base);
  const parts = [quoteId(dialect, c.name), c.sqlType];
  if (!c.nullable) parts.push('NOT NULL');
  if (def != null) parts.push(`DEFAULT ${def}`);
  return parts.join(' ');
}

async function existingTables(prisma: any, dialect: Dialect): Promise<Set<string>> {
  const where = dialect === 'mysql'
    ? "table_schema = DATABASE()"
    : "table_schema = current_schema()";
  const rows: any[] = await prisma.$queryRawUnsafe(
    `SELECT table_name AS t FROM information_schema.tables WHERE ${where}`
  );
  return new Set(rows.map(r => String(r.t ?? r.T)));
}

async function existingColumns(prisma: any, dialect: Dialect, table: string): Promise<Set<string>> {
  const where = dialect === 'mysql'
    ? "table_schema = DATABASE()"
    : "table_schema = current_schema()";
  const rows: any[] = await prisma.$queryRawUnsafe(
    `SELECT column_name AS c FROM information_schema.columns WHERE ${where} AND table_name = ${quoteStr(table)}`
  );
  return new Set(rows.map(r => String(r.c ?? r.C)));
}

// Главная точка: привести общую базу к схеме программы (аддитивно).
// Возвращает список выполненных изменений (для лога).
export async function ensureRemoteSchema(
  prisma: any,
  dialect: Dialect,
  schemaText: string,
  log: (msg: string) => void
): Promise<string[]> {
  const applied: string[] = [];
  let models: Model[];
  try {
    models = parsePrismaSchema(dialect, schemaText);
  } catch (e: any) {
    log(`[Schema Sync] Не удалось разобрать схему: ${e.message}`);
    return applied;
  }
  if (!models.length) {
    log('[Schema Sync] В схеме не найдено моделей — пропуск.');
    return applied;
  }

  let tables: Set<string>;
  try {
    tables = await existingTables(prisma, dialect);
  } catch (e: any) {
    log(`[Schema Sync] Не удалось прочитать список таблиц: ${e.message}`);
    return applied;
  }

  for (const model of models) {
    try {
      if (!tables.has(model.name)) {
        // Новой таблицы нет — создаём с колонками и первичным ключом
        const defs = model.columns.map(c => {
          let d = columnDdl(dialect, c);
          if (c.unique && !c.isId) d += ' UNIQUE';
          return d;
        });
        const idCol = model.columns.find(c => c.isId);
        if (idCol) defs.push(`PRIMARY KEY (${quoteId(dialect, idCol.name)})`);
        const engine = dialect === 'mysql' ? ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci' : '';
        const ddl = `CREATE TABLE IF NOT EXISTS ${quoteId(dialect, model.name)} (${defs.join(', ')})${engine}`;
        await prisma.$executeRawUnsafe(ddl);
        applied.push(`создана таблица ${model.name}`);
        continue;
      }
      // Таблица есть — добавляем недостающие колонки
      const cols = await existingColumns(prisma, dialect, model.name);
      for (const c of model.columns) {
        if (cols.has(c.name)) continue;
        const ddl = `ALTER TABLE ${quoteId(dialect, model.name)} ADD COLUMN ${columnDdl(dialect, c)}`;
        try {
          await prisma.$executeRawUnsafe(ddl);
          applied.push(`${model.name}.${c.name}`);
        } catch (e: any) {
          log(`[Schema Sync] Пропуск ${model.name}.${c.name}: ${e.message}`);
        }
      }
    } catch (e: any) {
      log(`[Schema Sync] Ошибка при обработке ${model.name}: ${e.message}`);
    }
  }

  if (applied.length) log(`[Schema Sync] Общая база приведена к схеме: ${applied.join(', ')}`);
  else log('[Schema Sync] Общая база уже соответствует схеме — изменений нет.');
  return applied;
}
