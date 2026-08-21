/**
 * Опознавательные знаки дерева Проводника.
 *
 * В дереве вперемешку лежат настоящие папки (у них идентификатор из базы) и
 * несколько «папок», которых в базе нет: корневые разделы «Общий» и «Личный»,
 * корзина, умные подборки. Отличить одно от другого можно только по виду
 * идентификатора, и правила этого разбора нужны и самому Проводнику, и
 * рисующим строки компонентам. Держим их в одном месте, чтобы «sec:» не
 * приходилось узнавать по строковому литералу в трёх файлах.
 */

/** Общий раздел: видно всем сотрудникам. */
export const SEC_SHARED = 'sec:shared';

/**
 * Корзина Проводника. Удалённое хранится до явной очистки: в системе
 * документов случайно удалённый чертёж не должен пропадать безвозвратно.
 */
export const TRASH_ID = 'trash:root';

/**
 * Умные подборки: не папки, а срезы по всем файлам. Отвечают на вопросы,
 * которые в инженерном архиве возникают постоянно: «что я трогал последним»,
 * «что забыли привязать к оборудованию», «где дубли».
 */
export const SMART_RECENT = 'smart:recent';
export const SMART_UNTAGGED = 'smart:untagged';
export const SMART_DUPES = 'smart:dupes';
export const SMART_IDS = [SMART_RECENT, SMART_UNTAGGED, SMART_DUPES];

export const isSmartId = (id: string | null | undefined): boolean => !!id && SMART_IDS.includes(id);

/** Личный раздел сотрудника: видит только он сам (и Главный Администратор). */
export const personalSecId = (uid: string) => `sec:personal:${uid}`;

export const isSectionId = (id: string | null | undefined): boolean => !!id && id.startsWith('sec:');

export const parseSection = (id: string): { scope: 'SHARED' | 'PERSONAL'; ownerId: string | null } =>
  id === SEC_SHARED
    ? { scope: 'SHARED', ownerId: null }
    : { scope: 'PERSONAL', ownerId: id.slice('sec:personal:'.length) || null };
