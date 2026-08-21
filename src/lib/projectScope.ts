/**
 * Проектные и общие данные.
 *
 * В программе два вида данных, и раньше это нигде не было сказано вслух.
 *
 *  • Проектные — теги, оборудование, справочник значений, менеджмент, книги
 *    Конструктора. Они принадлежат одному проекту. Переключили проект наверху
 *    слева — в этих разделах сменилось всё.
 *
 *  • Общие — блокнот, чат, почта, проводник, сотрудники, руководство, журнал.
 *    Они живут поверх проектов и от переключения не меняются. В них видно всё,
 *    в том числе названия документов и тегов из других проектов.
 *
 * Отсюда правило, ради которого написан этот файл: в общем разделе можно
 * увидеть вещь из чужого проекта, но открыть её, не переключившись, нельзя —
 * иначе рядом с ней окажутся данные не того проекта. Поэтому вместо молчаливого
 * отказа или молчаливого переключения программа спрашивает: показывает справа
 * снизу уведомление «это из проекта такого-то, переключить?» — и переключает
 * вместе с открытием, если человек согласился.
 *
 * Молчаливое переключение здесь было бы хуже отказа: человек нажал на строку в
 * почте, а у него сменился проект и уехали данные в трёх соседних панелях.
 */
import { useEffect, useState } from 'react';
import { useStore } from '../store/store';
import { useToastStore } from '../store/toastStore';
import { dataService } from '../services/dataService';

export type Project = { id: string; name: string };

/* ─────────────────────────── имена проектов ─────────────────────────── */

/**
 * Имя проекта нужно в подписи к каждой строке общего раздела — в почте,
 * в проводнике, в блокноте. Запрашивать его на каждую строку нельзя: список
 * писем это сотня запросов. Держим общий список в памяти и подтягиваем его
 * один раз, а дальше — не чаще раза в пять минут.
 */
const FRESH_MS = 5 * 60 * 1000;

let cache: Project[] = [];
let loadedAt = 0;
let inflight: Promise<Project[]> | null = null;
const watchers = new Set<(list: Project[]) => void>();

/** Список проектов из памяти — без ожидания. Пуст, пока не загрузился. */
export function knownProjects(): Project[] {
  return cache;
}

/** Загрузить список проектов, если он ещё не загружен или устарел. */
export function loadProjects(force = false): Promise<Project[]> {
  const fresh = !force && cache.length > 0 && Date.now() - loadedAt < FRESH_MS;
  if (fresh) return Promise.resolve(cache);
  if (inflight) return inflight;

  inflight = dataService.getProjects()
    .then((list: any[]) => {
      cache = (list || []).map((p) => ({ id: String(p.id), name: String(p.name || '') }));
      loadedAt = Date.now();
      watchers.forEach((fn) => { try { fn(cache); } catch (_) { /* один слушатель не должен ронять остальных */ } });
      return cache;
    })
    .catch(() => cache)
    .finally(() => { inflight = null; });

  return inflight;
}

/** Подписка на список проектов: вызывается сразу и при каждом обновлении. */
export function watchProjects(fn: (list: Project[]) => void): () => void {
  watchers.add(fn);
  if (cache.length) fn(cache);
  loadProjects();
  return () => { watchers.delete(fn); };
}

/**
 * Имя проекта по идентификатору. Пока список не загружен — пусто, и подпись
 * в списке просто не показывается. Пустая подпись лучше, чем «undefined»
 * или мигающий идентификатор.
 */
export function projectName(id: string | null | undefined): string {
  if (!id) return '';
  const p = cache.find((x) => x.id === id);
  return p ? p.name : '';
}

/* ─────────────────────────── ворота проекта ─────────────────────────── */

/** Проект, открытый сейчас. */
export function activeProjectId(): string | null {
  return useStore.getState().activeProject?.id || null;
}

/** Данные этого проекта? Вещь без проекта (общая) — всегда да. */
export function isCurrentProject(projectId: string | null | undefined): boolean {
  if (!projectId) return true;
  return projectId === activeProjectId();
}

/**
 * Переключиться на проект по идентификатору. Возвращает false, если проекта с
 * таким идентификатором нет (например, его удалили, а ссылка на него осталась
 * в старом письме).
 */
export function switchToProject(projectId: string): boolean {
  const p = cache.find((x) => x.id === projectId);
  if (!p) return false;
  useStore.getState().setActiveProject(p as any);
  return true;
}

interface GuardOptions {
  /** Что открывают: «Документ «Смета.xlsx»», «Тег 20-PT-001». Ставится в начало фразы. */
  what: string;
  /** Проект-владелец. Пусто или совпадает с текущим — открываем сразу. */
  projectId: string | null | undefined;
  /** Само открытие. Вызывается сразу либо после согласия на переключение. */
  open: () => void;
  /**
   * Пауза перед открытием после переключения. Разделы перечитывают данные на
   * смену проекта, и открывать документ в ту же миллисекунду — значит открыть
   * его поверх ещё не обновившегося списка.
   */
  delayMs?: number;
}

/**
 * Открыть с оглядкой на проект.
 *
 * Возвращает true, если открыли прямо сейчас, и false, если вместо открытия
 * показали вопрос о переключении. Возвращаемое значение нужно вызывающему
 * редко — в основном чтобы не запускать рядом свою анимацию открытия.
 */
export function openInProject({ what, projectId, open, delayMs = 350 }: GuardOptions): boolean {
  if (isCurrentProject(projectId)) { open(); return true; }

  const id = String(projectId);
  const name = projectName(id);
  const toast = useToastStore.getState().addToast;

  // Имени нет — список проектов ещё не пришёл либо проект удалён. Дотягиваем
  // список и переспрашиваем один раз: без имени вопрос «переключить на что?»
  // остаётся без ответа.
  if (!name) {
    loadProjects(true).then(() => {
      const later = projectName(id);
      if (!later) {
        toast(`${what} из другого проекта, а сам проект больше не найден.`, 'error', undefined, 'project-scope');
        return;
      }
      askSwitch(what, id, later, open, delayMs);
    });
    return false;
  }

  askSwitch(what, id, name, open, delayMs);
  return false;
}

function askSwitch(what: string, id: string, name: string, open: () => void, delayMs: number) {
  useToastStore.getState().addToast(
    `${what} из проекта «${name}». Переключиться и открыть?`,
    'info',
    () => {
      if (!switchToProject(id)) return;
      window.setTimeout(open, delayMs);
    },
    'project-scope',
  );
}

/**
 * Короткая подпись владельца для строки списка: пусто, если вещь принадлежит
 * открытому проекту (лишний шум) или не принадлежит никакому.
 */
export function foreignProjectLabel(projectId: string | null | undefined): string {
  if (isCurrentProject(projectId)) return '';
  return projectName(String(projectId));
}

/**
 * Список проектов для отрисовки подписей. Хук, а не просто вызов
 * knownProjects(): без подписки экран нарисовался бы до загрузки списка и
 * остался бы без подписей навсегда.
 */
export function useProjectNames(): (id: string | null | undefined) => string {
  const [list, setList] = useState<Project[]>(knownProjects);
  useEffect(() => watchProjects(setList), []);
  return (id) => {
    if (!id) return '';
    const p = list.find((x) => x.id === id);
    return p ? p.name : '';
  };
}
