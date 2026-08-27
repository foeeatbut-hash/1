/**
 * Чем открывается файл.
 *
 * Раньше это решение было записано дважды — на столе и в Проводнике, — и они
 * успели разойтись: чертёж, открытый из Проводника, попадал в редактор пометок,
 * а тот же чертёж со стола — в предпросмотр сбоку. Один и тот же файл вёл себя
 * по-разному в зависимости от того, откуда на него нажали.
 *
 * Здесь только счёт, без React и без DOM: по файлу — список программ, которые
 * его откроют, первая из них подразумевается по двойному нажатию. Список
 * короткий и настоящий: программу, которой у нас нет, в него дописывать нельзя
 * — «Открыть с помощью» должен открывать, а не обещать.
 */

/** Что известно о файле тем, кто спрашивает: столу и Проводнику */
export interface FileLike {
  id: string;
  name?: string;
  /** Тип из базы: CONSTRUCTOR, PDF, FILE */
  type?: string | null;
  /** Документ Конструктора: ссылка на сам документ, а не на файл */
  refId?: string | null;
  /** Папка Проводника, в которой файл лежит */
  folderId?: string | null;
}

export interface FileApp {
  id: string;
  /** Как называется в меню: «Открыть в Чертеже» */
  name: string;
  /** Раздел-программа: по нему находится значок и заголовок окна */
  path: string;
  /** Адрес, которым программа открывает именно этот файл */
  href: (f: FileLike) => string;
}

const q = (v: string) => encodeURIComponent(v);

export const FILE_APPS: Record<string, FileApp> = {
  // Ключ не «constructor»: у любого объекта в JavaScript уже есть поле с таким
  // именем, и обращение к нему возвращает не программу, а функцию-конструктор
  docs: {
    id: 'docs', name: 'Конструктор', path: '/constructor',
    href: (f) => `/constructor?doc=${q(f.refId || f.id)}`,
  },
  pdf: {
    id: 'pdf', name: 'Чертёж', path: '/pdf',
    href: (f) => `/pdf?file=${q(f.id)}`,
  },
  // Предпросмотр Проводника — тоже способ открыть: для картинки, бланка и
  // всего, для чего своего редактора нет, он и есть единственный
  explorer: {
    id: 'explorer', name: 'Проводник', path: '/explorer',
    href: (f) => (f.folderId
      ? `/explorer?file=${q(f.id)}&folder=${q(f.folderId)}`
      : `/explorer?file=${q(f.id)}`),
  },
};

/** Чертёж узнаём и по типу из базы, и по имени: старые записи типа не имеют */
export const isPdf = (f: FileLike): boolean =>
  f.type === 'PDF' || /\.pdf$/i.test(f.name || '');

/** Документ Конструктора — это ссылка на документ, а не файл на диске */
export const isConstructorDoc = (f: FileLike): boolean =>
  !!f.refId || f.type === 'CONSTRUCTOR';

/**
 * Чем можно открыть этот файл. Первая программа — по двойному нажатию,
 * остальные предлагаются в «Открыть с помощью».
 */
export function appsFor(f: FileLike): FileApp[] {
  if (isConstructorDoc(f)) return [FILE_APPS.docs];
  if (isPdf(f)) return [FILE_APPS.pdf, FILE_APPS.explorer];
  return [FILE_APPS.explorer];
}

/** Адрес, по которому файл открывается сам собой — двойным нажатием */
export function openHref(f: FileLike): string {
  return appsFor(f)[0].href(f);
}

/** Есть ли из чего выбирать: без выбора пункт «Открыть с помощью» не нужен */
export const hasChoice = (f: FileLike): boolean => appsFor(f).length > 1;
