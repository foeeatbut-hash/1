/**
 * Переименование тега разговором: «переименуй AHU-1» → «на какой код?» → ответ.
 *
 * Отдельно от хранилища, потому что это законченный разговор со своими
 * правилами, и каждое из них однажды кто-нибудь упростит «до очевидного»:
 *
 *  • неверный код не выбрасывает человека из диалога, а просит ещё раз;
 *  • совпадение старого и нового кода — не ошибка, а «ничего не делаем»;
 *  • про новый дубль предупреждаем, но не запрещаем: иногда так и нужно.
 *
 * Модуль возвращает решение, а не рисует ответ, и всё, что ходит к серверу,
 * получает снаружи: правила проверяются без сети (scripts/test-rename-dialog.ts).
 */

export interface RenameAsk {
  tagId: string;
  oldCode: string;
}

export interface RenameApi {
  /** Проверка кода: те же правила, что и при создании тега */
  validate: (code: string) => { ok: boolean; code: string; error?: string };
  /** Сколько тегов уже носят этот код (кроме переименовываемого) */
  countSame: (code: string, exceptId: string) => Promise<number>;
  rename: (tagId: string, code: string) => Promise<void>;
}

export type RenameOutcome =
  /** Код не годится: остаёмся в диалоге и просим ещё раз */
  | { kind: 'retry'; text: string }
  /** Делать нечего: код тот же */
  | { kind: 'same'; text: string }
  | { kind: 'done'; text: string; tagId: string; newCode: string }
  | { kind: 'failed'; text: string };

/**
 * Применить ответ человека.
 *
 * Дубли считаем ДО переименования: после него в базе уже два одинаковых кода,
 * и на вопрос «стало ли их больше» ответить будет нечем. Сам подсчёт не
 * обязателен — если он не удался, переименованию это не мешает, а
 * предупреждение просто не появится.
 */
export async function applyRename(pending: RenameAsk, answer: string, api: RenameApi): Promise<RenameOutcome> {
  const v = api.validate(answer);
  if (!v.ok) {
    return {
      kind: 'retry',
      text: `${v.error}. Введите новый код для тега «${pending.oldCode}» ещё раз или напишите «отмена».`,
    };
  }
  if (v.code === pending.oldCode) {
    return { kind: 'same', text: 'Новый код совпадает со старым — оставил без изменений.' };
  }

  let collision = 0;
  try { collision = await api.countSame(v.code, pending.tagId); } catch (_) { collision = 0; }

  try {
    await api.rename(pending.tagId, v.code);
  } catch (err: any) {
    return { kind: 'failed', text: `Не удалось переименовать: ${err?.message || err}` };
  }

  const warn = collision > 0
    ? `\n⚠ Такой код уже есть у ${collision} тег(ов) — теперь это новый дубль. Можно переименовать и его.`
    : '';
  return {
    kind: 'done',
    tagId: pending.tagId,
    newCode: v.code,
    text: `✅ Переименовал: «${pending.oldCode}» → «${v.code}». Связи и комментарии сохранены.${warn}`,
  };
}
