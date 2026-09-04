/**
 * Дерево тегов: у кого кто в родителях.
 *
 * Правило одно, и оно из работы, а не из кода. Есть приточная установка. У неё
 * компоненты — клапан, вентилятор, калорифер, — и родитель у всех у них один:
 * сама установка. У элементов клапана родитель — клапан, у элементов
 * калорифера — калорифер. Так и получается дерево: каждый тег знает ровно
 * одного родителя, а глубина берётся из состава оборудования, а не из порядка,
 * в котором теги завели.
 *
 * Хранится связь в metadata тега, и хранится ДВАЖДЫ: у родителя список
 * `connections` — это его дети, у ребёнка `parentId` — это его родитель. Один
 * и тот же факт с двух сторон. Так удобно рисовать (линии идут сверху вниз) и
 * так удобно подниматься вверх, но за это платят: две записи расходятся.
 *
 * Они и разошлись. Строка «Родительский тег» в карточке писала выбранного
 * родителя в СОБСТВЕННЫЙ список детей тега — и родитель становился ребёнком
 * своего же ребёнка, а настоящий родитель о ребёнке не знал вовсе. Дальше
 * дерево читалось как попало: 2 оказывался родителем 1, 3 — и родителем, и
 * ребёнком 2 одновременно. Строку из карточки убрали, а связь теперь заводится
 * в одном месте — здесь, обеими записями сразу.
 *
 * Без React и без сети: правила проверяются scripts/test-tag-tree.ts.
 */

/** Тег глазами дерева: остальные поля правилам связи не нужны */
export interface TreeNode {
  id: string;
  /** Дети: metadata.connections */
  connections?: string[];
  /** Родитель: metadata.parentId */
  parentId?: string | null;
}

/** Что записать в metadata одного тега */
export interface TreePatch {
  id: string;
  connections: string[];
  parentId?: string;
}

const kids = (n: TreeNode | undefined): string[] =>
  Array.isArray(n?.connections) ? n!.connections.filter(Boolean) : [];

/** Дети тега — те, что и правда есть в проекте */
export function childrenOf(nodes: TreeNode[], id: string): string[] {
  const live = new Set(nodes.map((n) => n.id));
  return kids(nodes.find((n) => n.id === id)).filter((c) => c !== id && live.has(c));
}

/**
 * Родитель тега.
 *
 * Спрашиваем СПИСКИ ДЕТЕЙ, а не поле `parentId`: список — то, по чему рисуются
 * линии, а поле лишь его отражение. Когда они спорят, прав список.
 */
export function parentOf(nodes: TreeNode[], id: string): string | null {
  for (const n of nodes) if (n.id !== id && kids(n).includes(id)) return n.id;
  return null;
}

/** Тег и все, кто под ним: сам тег входит в набор */
export function descendantsOf(nodes: TreeNode[], id: string): Set<string> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const out = new Set<string>([id]);
  const stack = [id];
  while (stack.length) {
    for (const c of kids(byId.get(stack.pop()!))) {
      if (!out.has(c) && byId.has(c)) { out.add(c); stack.push(c); }
    }
  }
  return out;
}

/** Путь от корня до тега: «Приточная установка → Клапан → Привод» */
export function pathTo(nodes: TreeNode[], id: string): string[] {
  const path: string[] = [];
  let cur: string | null = id;
  const seen = new Set<string>();
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    path.unshift(cur);
    cur = parentOf(nodes, cur);
  }
  return path;
}

/** Почему связь невозможна — или пусто, если возможна */
export function whyNotLink(nodes: TreeNode[], parentId: string, childId: string): string {
  if (!parentId || !childId) return 'Не выбран тег.';
  if (parentId === childId) return 'Тег не может быть родителем самому себе.';
  const byId = new Map(nodes.map((n) => [n.id, n]));
  if (!byId.has(parentId) || !byId.has(childId)) return 'Такого тега в проекте нет.';
  // Свой же потомок в родителях — это кольцо: дерево перестаёт кончаться, а
  // обход по нему зацикливается
  if (descendantsOf(nodes, childId).has(parentId)) return 'Так получится кольцо: этот тег уже стоит ниже по дереву.';
  return '';
}

/**
 * Связать родителя и ребёнка — обеими записями сразу.
 *
 * Возвращает правки, которые нужно сохранить: у прежнего родителя ребёнок
 * убирается из списка, у нового появляется, а у самого ребёнка выправляется
 * `parentId`. Раньше это делалось в трёх местах по-разному, и в одном из них —
 * наоборот.
 */
export function linkChild(nodes: TreeNode[], parentId: string, childId: string): TreePatch[] {
  if (whyNotLink(nodes, parentId, childId)) return [];
  const patches: TreePatch[] = [];
  for (const n of nodes) {
    const had = kids(n).includes(childId);
    if (n.id === parentId) {
      if (!had) patches.push({ id: n.id, connections: [...kids(n), childId], parentId: n.parentId ?? undefined });
    } else if (had) {
      // Прежний родитель. Двух родителей у тега быть не может: линия к нему
      // одна, и «висит на двух установках сразу» в спецификацию не переносится
      patches.push({ id: n.id, connections: kids(n).filter((c) => c !== childId), parentId: n.parentId ?? undefined });
    }
  }
  const child = nodes.find((n) => n.id === childId);
  if (child && child.parentId !== parentId) {
    // Родитель в собственных детях — след старой поломки: убираем заодно
    patches.push({ id: childId, connections: kids(child).filter((c) => c !== parentId), parentId });
  }
  return patches;
}

/** Разорвать связь: и список родителя, и отметку у ребёнка */
export function unlinkChild(nodes: TreeNode[], parentId: string, childId: string): TreePatch[] {
  const patches: TreePatch[] = [];
  const parent = nodes.find((n) => n.id === parentId);
  if (parent && kids(parent).includes(childId)) {
    patches.push({ id: parentId, connections: kids(parent).filter((c) => c !== childId), parentId: parent.parentId ?? undefined });
  }
  const child = nodes.find((n) => n.id === childId);
  if (child && child.parentId === parentId) {
    patches.push({ id: childId, connections: kids(child), parentId: undefined });
  }
  return patches;
}

/**
 * Выправить уже испорченное дерево.
 *
 * Чинит ровно то, что успела наделать прежняя карточка, и ничего сверх этого:
 *
 *  — тег держит своего родителя среди собственных детей (связь смотрит в обе
 *    стороны сразу, и обход ходит по кругу);
 *  — о связи знает только ребёнок: он называет родителя, а родитель о нём не
 *    слышал. Такую связь восстанавливаем, а не разрываем — иначе выправление
 *    сделало бы дерево плоским и потеряло состав установки;
 *  — тег числится ребёнком сразу у нескольких: остаётся тот, кого называет
 *    сам ребёнок, иначе первый по списку;
 *  — тег — собственный ребёнок;
 *  — в детях числится тег, которого в проекте больше нет;
 *  — `parentId` спорит со списками детей: прав список, по нему рисуются линии.
 *
 * Возвращает только те теги, которые действительно надо переписать: пустой
 * ответ означает «дерево в порядке» и ни одной лишней записи в базу.
 */
export function repairTagTree(nodes: TreeNode[]): TreePatch[] {
  const live = new Set(nodes.map((n) => n.id));
  const byId = new Map(nodes.map((n) => [n.id, n]));

  // 1. Чистим списки детей: без себя, без исчезнувших, без повторов и без
  //    того, кого сам ребёнок называет своим родителем
  const children = new Map<string, string[]>();
  for (const n of nodes) {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const c of kids(n)) {
      if (c === n.id || !live.has(c) || seen.has(c)) continue;
      if (byId.get(n.id)?.parentId === c) continue;  // это родитель, а не ребёнок
      seen.add(c);
      out.push(c);
    }
    children.set(n.id, out);
  }

  // 2. Связь, о которой знает только ребёнок, — восстанавливаем.
  //
  //    Прежняя карточка записывала родителя ТОЛЬКО у ребёнка (и заодно клала
  //    его в собственные дети ребёнка). После чистки от этой записи не остаётся
  //    ничего, и без этого шага выправление превращалось бы в разрыв: дерево
  //    становилось плоским, а состав установки терялся целиком.
  const listed = new Set<string>();
  for (const list of children.values()) for (const c of list) listed.add(c);
  for (const n of nodes) {
    const said = n.parentId;
    if (!said || said === n.id || !live.has(said) || listed.has(n.id)) continue;
    children.set(said, [...(children.get(said) || []), n.id]);
    listed.add(n.id);
  }

  // 3. Один родитель на тег: лишних вычёркиваем
  const claims = new Map<string, string[]>();
  for (const [pid, list] of children) {
    for (const c of list) claims.set(c, [...(claims.get(c) || []), pid]);
  }
  for (const [childId, parents] of claims) {
    if (parents.length < 2) continue;
    const said = byId.get(childId)?.parentId;
    const keep = said && parents.includes(said) ? said : parents[0];
    for (const p of parents) {
      if (p === keep) continue;
      children.set(p, (children.get(p) || []).filter((c) => c !== childId));
    }
  }

  // 4. Кольца: тег, оказавшийся собственным предком, отцепляется от родителя.
  //    Оставить кольцо нельзя — обход дерева по нему не кончается
  const parentNow = (id: string): string | null => {
    for (const [pid, list] of children) if (list.includes(id)) return pid;
    return null;
  };
  for (const n of nodes) {
    const seen = new Set<string>([n.id]);
    let cur = parentNow(n.id);
    while (cur) {
      if (seen.has(cur)) {
        const p = parentNow(n.id);
        if (p) children.set(p, (children.get(p) || []).filter((c) => c !== n.id));
        break;
      }
      seen.add(cur);
      cur = parentNow(cur);
    }
  }

  // 5. Собираем правки: пишем только то, что изменилось
  const patches: TreePatch[] = [];
  for (const n of nodes) {
    const next = children.get(n.id) || [];
    const nextParent = parentNow(n.id) || undefined;
    const sameKids = next.length === kids(n).length && next.every((c, i) => c === kids(n)[i]);
    const sameParent = (n.parentId || undefined) === nextParent;
    if (sameKids && sameParent) continue;
    patches.push({ id: n.id, connections: next, parentId: nextParent });
  }
  return patches;
}
