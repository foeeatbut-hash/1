/**
 * Вызов помощника прямо из переписки: «@помощник, посчитай…».
 *
 * Отдельно от экрана Мессенджера по двум причинам. Экран и без того самый
 * большой в программе; и, что важнее, здесь живёт правило приватности, которое
 * должно быть видно целиком, а не разбросано по обработчику отправки.
 *
 * Помощник получает ТОЛЬКО заданный ему вопрос. В группе люди пишут о
 * зарплатах, отпусках и заказчиках — отдавать переписку из-за одного вопроса
 * нельзя даже своему помощнику, который наружу не ходит (правила и проверка —
 * src/lib/mention.ts, scripts/test-mention.ts).
 */
import { useAssistantStore } from '../../store/assistantStore';
import { parseMention, isEmptyAsk, answerPrefix } from '../../lib/mention';

export interface AssistantCallDeps {
  /** Кто спрашивает: от него же уйдёт ответ — своей учётной записи у помощника нет */
  me: { id: string; name?: string } | null | undefined;
  projectId: string | null;
  /** Отправка сообщения в тот же разговор */
  say: (userId: string, text: string, projectId: string | null) => Promise<unknown>;
  toast: (text: string, kind: 'info' | 'error') => void;
}

export function useAssistantCall(deps: AssistantCallDeps) {
  /**
   * Разобрать отправленное сообщение и, если оно адресовано помощнику,
   * задать вопрос и вернуть ответ в тот же разговор.
   *
   * Ответ подписан («Ответ для …»): отдельной учётной записи у помощника нет,
   * сообщение уходит от того, кто спросил, и пометка — единственный способ
   * отличить ответ помощника от слов человека.
   */
  return async function maybeAsk(text: string, isEditing = false): Promise<boolean> {
    const call = parseMention(text);
    if (!call.toAssistant || isEditing) return false;
    if (isEmptyAsk(call)) {
      deps.toast('После «@помощник» напишите вопрос', 'info');
      return false;
    }
    const me = deps.me;
    if (!me) return false;

    const store = useAssistantStore.getState();
    const before = store.messages.length;
    try {
      await store.ask(call.text);
      const after = useAssistantStore.getState().messages;
      const answer = [...after.slice(before)].reverse().find((m: any) => m.role === 'assistant');
      const said = String(answer?.text || '').trim();
      if (!said) return false;
      await deps.say(me.id, `${answerPrefix(me.name || 'вас')}\n${said}`, deps.projectId);
      return true;
    } catch (err: any) {
      deps.toast('Помощник не ответил: ' + (err?.message || err), 'error');
      return false;
    }
  };
}
