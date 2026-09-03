/**
 * История разговоров с помощником.
 *
 * До сих пор разговор жил до перезагрузки страницы, и это выглядело мелочью,
 * пока не стало видно, чем помощник на самом деле полезен: у него спрашивают
 * «как мы это делали в прошлый раз». Ответ на такой вопрос ищут не в справке,
 * а в собственной переписке двухнедельной давности — а её не было.
 *
 * Отдельным складом, а не полями в assistantStore: тот отвечает за понимание
 * речи и ответы, и подмешивать туда работу с сетью значило бы связать две
 * несвязанные вещи в файле, который и так самый большой в папке.
 *
 * Разговор сохраняется сам, по ходу дела. Кнопки «сохранить» здесь быть не
 * может: человек закрывает окно помощника не задумываясь, и всё, что он не
 * нажал, для него просто пропало бы.
 *
 * ЛИЧНОЕ. Разговоры видит только их хозяин — администратор тоже нет. Это
 * обещание сказано человеку прямо в окне: иначе спрашивать будут с оглядкой,
 * а помощник, которому не задают вопросов, бесполезен.
 */
import { create } from 'zustand';
import { useAssistantStore } from './assistantStore';
import {
  titleOf, isEmptyTalk, searchText, previewOf, filterChats, type ChatSummary, type ChatLine,
} from '../lib/assistantChats';

/** Раз в сколько мс разговор уходит на сервер после последней реплики */
const SAVE_AFTER = 1200;
/** Через сколько мс после последней буквы спрашиваем сервер о поиске */
const FIND_AFTER = 250;

const newId = () => `chat_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

const linesOf = (): ChatLine[] =>
  useAssistantStore.getState().messages.map((m) => ({ role: m.role, text: String(m.text || '') }));

interface ChatsState {
  chats: ChatSummary[];
  /**
   * Что нашёл сервер по строке поиска, или null — поиска нет.
   *
   * Отдельно от списка: сервер ищет по всем репликам, клиент — по имени и
   * второй строке. Пока ответ идёт, человек видит хотя бы то, что нашлось у
   * него на руках, а не пустоту.
   */
  found: ChatSummary[] | null;
  /** Разговор, который идёт прямо сейчас */
  activeId: string;
  projectId: string;
  q: string;
  loading: boolean;
  /** Личное обещание нарушено не будет, но сказать о нём надо один раз */
  error: string;

  load: (projectId: string) => Promise<void>;
  setQuery: (q: string) => void;
  /** Отобранный список — для показа слева */
  visible: () => ChatSummary[];
  /** Разговор изменился: сохранить, но не на каждую букву */
  touch: () => void;
  saveNow: () => Promise<void>;
  open: (id: string) => Promise<void>;
  startNew: () => Promise<void>;
  remove: (id: string) => Promise<void>;
}

let timer: any = null;
let findTimer: any = null;

export const useAssistantChatsStore = create<ChatsState>((set, get) => ({
  chats: [],
  found: null,
  activeId: newId(),
  projectId: '',
  q: '',
  loading: false,
  error: '',

  load: async (projectId) => {
    set({ loading: true, projectId, error: '' });
    try {
      const r = await fetch(`/api/assistant/chats?projectId=${encodeURIComponent(projectId || '')}`);
      const d = await r.json();
      set({ chats: Array.isArray(d.chats) ? d.chats : [], found: null, loading: false });
    } catch (_) {
      // Список без сети не пуст, а неизвестен: молчание здесь читается как
      // «переписка пропала», и человек начинает спрашивать заново
      set({ loading: false, error: 'Не удалось прочитать историю разговоров' });
    }
  },

  /**
   * Поиск идёт в две руки. Сразу — по загруженному списку, чтобы буквы
   * отзывались без сети. Следом, с задержкой, — на сервере: нужное слово чаще
   * оказывается в середине разговора, а не в его названии, и найти его может
   * только тот, у кого лежат все реплики.
   */
  setQuery: (q) => {
    set({ q });
    clearTimeout(findTimer);
    if (!q.trim()) { set({ found: null }); return; }
    findTimer = setTimeout(async () => {
      const asked = get().q;
      try {
        const r = await fetch(`/api/assistant/chats?projectId=${encodeURIComponent(get().projectId)}`
          + `&q=${encodeURIComponent(asked.trim())}`);
        const d = await r.json();
        // Ответ на устаревший запрос выбрасываем: человек уже дописал слово,
        // и подставить ему находки предыдущей буквы — хуже, чем ничего
        if (get().q !== asked) return;
        set({ found: Array.isArray(d.chats) ? d.chats : [] });
      } catch (_) { /* без сети остаётся то, что нашлось на клиенте */ }
    }, FIND_AFTER);
  },

  visible: () => {
    const { chats, found, q } = get();
    const local = filterChats(chats, q);
    if (!found) return local;
    // Своё и серверное складываем: разговор, только что записанный и ещё не
    // попавший в поиск, не должен исчезать из списка на глазах
    const seen = new Set(found.map((c) => c.id));
    return [...found, ...local.filter((c) => !seen.has(c.id))];
  },

  touch: () => {
    clearTimeout(timer);
    timer = setTimeout(() => { void get().saveNow(); }, SAVE_AFTER);
  },

  saveNow: async () => {
    const lines = linesOf();
    // Открыл помощника, передумал, закрыл — записи в истории быть не должно
    if (isEmptyTalk(lines)) return;
    const id = get().activeId;
    const title = titleOf(lines);
    const preview = previewOf(lines);
    try {
      await fetch(`/api/assistant/chats/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          preview,
          projectId: get().projectId,
          messages: JSON.stringify(useAssistantStore.getState().messages),
          search: searchText(lines),
        }),
      });
      const at = new Date().toISOString();
      set((s) => ({
        chats: s.chats.some((c) => c.id === id)
          ? s.chats.map((c) => (c.id === id ? { ...c, title, preview, updatedAt: at } : c))
          : [{ id, title, preview, updatedAt: at }, ...s.chats],
      }));
    } catch (_) { /* без сети разговор остаётся на экране; уйдёт при следующей реплике */ }
  },

  open: async (id) => {
    if (id === get().activeId) return;
    await get().saveNow();                      // прежний разговор не бросаем
    try {
      const r = await fetch(`/api/assistant/chats/${id}`);
      if (!r.ok) throw new Error('нет разговора');
      const d = await r.json();
      const messages = JSON.parse(d.chat?.messages || '[]');
      if (!Array.isArray(messages) || !messages.length) throw new Error('пустой разговор');
      // Разговор возвращается целиком, вместе с карточками и кнопками ответов:
      // «показать в Менеджменте» через неделю должно работать так же
      useAssistantStore.setState({
        messages, attached: null, lastResult: null, lastTable: null, pendingInput: null,
      });
      set({ activeId: id });
    } catch (_) {
      set({ error: 'Не удалось открыть разговор' });
    }
  },

  startNew: async () => {
    await get().saveNow();
    useAssistantStore.getState().clearTalk();
    set({ activeId: newId() });
  },

  remove: async (id) => {
    try { await fetch(`/api/assistant/chats/${id}`, { method: 'DELETE' }); } catch (_) { /* уже нет */ }
    set((s) => ({ chats: s.chats.filter((c) => c.id !== id) }));
    // Удалили тот, что открыт, — начинаем чистый, иначе следующая реплика
    // воскресила бы «удалённый» разговор под тем же именем
    if (get().activeId === id) {
      useAssistantStore.getState().clearTalk();
      set({ activeId: newId() });
    }
  },
}));

/**
 * Сохранение по ходу разговора. Подписка одна на всю программу: помощник живёт
 * и панелью, и окном, а разговор у них общий — вешать сохранение на каждый из
 * них значило бы записывать одно и то же дважды.
 */
useAssistantStore.subscribe((state, prev) => {
  if (state.messages === prev.messages) return;
  useAssistantChatsStore.getState().touch();
});
