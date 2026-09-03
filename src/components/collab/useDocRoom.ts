/**
 * Комната документа: одна на оба редактора.
 *
 * Ведомость и текстовый документ ведут себя в совместной работе одинаково —
 * входят в комнату, получают список участников, рассылают и принимают операции
 * движка. Пока это было написано дважды, оно и расходилось дважды: у таблиц
 * появилось выделение коллег, у текста — нет; правило про обрыв связи
 * пришлось бы вписывать в оба места и в одном из них ошибиться.
 *
 * Здесь только связь. Что делать с чужой операцией, что считать своей
 * несохранённой правкой и как перечитать документ — знает редактор, и он
 * передаёт это работами. Решение же, ЧТО делать после возвращения связи,
 * принимает src/lib/collab.ts, где оно проверяется скриптом.
 *
 * Комната открывается, когда движок готов принимать операции. Раньше нельзя:
 * чужая правка, пришедшая в незагруженный документ, потерялась бы молча — а
 * попытка накопить её и применить потом положила бы вставку строки дважды.
 */
import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { ENV_CONFIG, getAuthToken } from '../../config/env';
import {
  normalizePeers, withSelection, coauthors, holdSave, afterReconnect, linkNote,
  type Peer, type Link, type Drop,
} from '../../lib/collab';

export interface DocRoom {
  /** Кто ещё в документе — для аватаров в шапке и рамок выделения */
  peers: Peer[];
  /** Строка о связи для шапки; пустая — со связью всё хорошо */
  note: string;
  /**
   * Остановлено ли автосохранение. Ссылка, а не состояние: её читает
   * сохранение из таймера, которому перерисовка не полагается.
   */
  hold: { current: boolean };
  /** Сказать в комнату: выделение, операция движка */
  send: (event: string, payload: unknown) => void;
}

export function useDocRoom({
  docId, ready, applyOp, isDirty, onResync, onResolve, onNote, onPeerSaved,
}: {
  docId: string;
  /** Движок открыл документ: до этого в комнату не входим */
  ready: boolean;
  applyOp: (op: { id: string; params: unknown }) => void;
  /** Есть ли у меня правка, которой ещё нет на сервере */
  isDirty: () => boolean;
  /** Перечитать документ с сервера — терять при этом нечего */
  onResync: () => void;
  /** Записать своё и дать серверу объявить столкновение */
  onResolve: () => void;
  onNote: (text: string) => void;
  /** Коллега записал документ: подвинуть время, с которым окно его читало */
  onPeerSaved: (at: string) => void;
}): DocRoom {
  const [peers, setPeers] = useState<Peer[]>([]);
  const [link, setLink] = useState<Link>('live');
  const [dropPeers, setDropPeers] = useState(0);
  const hold = useRef(false);
  const dropRef = useRef<Drop | null>(null);
  const sockRef = useRef<Socket | null>(null);
  // Слушатели живут дольше отрисовки: и участники, и работы редактора берутся
  // из ссылок, иначе обработчик обрыва увидит список недельной свежести
  const peersRef = useRef<Peer[]>([]);
  peersRef.current = peers;
  const fns = useRef({ applyOp, isDirty, onResync, onResolve, onNote, onPeerSaved });
  fns.current = { applyOp, isDirty, onResync, onResolve, onNote, onPeerSaved };

  useEffect(() => {
    if (!docId || !ready) return undefined;
    const sock = io(ENV_CONFIG.socketUrl, {
      auth: { token: getAuthToken() },
      transports: ['websocket', 'polling'],
      reconnectionDelay: 800,
      reconnectionDelayMax: 4000,
    });
    sockRef.current = sock;

    /**
     * Обрыв запоминается вместе с обстановкой: сколько людей было в документе
     * в ту секунду. После обрыва список пуст, и по нему уже не понять, была ли
     * опасность записать свою книгу поверх чужой работы.
     *
     * Повторный обрыв ничего не переписывает: первым узнаёт о нём браузер
     * (событие offline), сокет — минутой позже, когда не дождётся ответа. Взять
     * позднее время значило бы забыть, сколько мы на самом деле молчали.
     */
    const lost = () => {
      if (!dropRef.current) {
        dropRef.current = { at: Date.now(), peers: coauthors(peersRef.current) };
      }
      hold.current = holdSave('lost', dropRef.current.peers);
      setDropPeers(dropRef.current.peers);
      setPeers([]);
      setLink('lost');
    };

    const back = () => {
      const drop = dropRef.current;
      dropRef.current = null;
      hold.current = false;
      setLink('live');
      setDropPeers(0);
      if (!drop) return;                       // первый вход, а не возвращение
      const what = afterReconnect(fns.current.isDirty(), drop);
      if (what === 'resync') {
        fns.current.onNote('Связь вернулась — перечитываю документ');
        fns.current.onResync();
      } else if (what === 'resolve') {
        fns.current.onResolve();
      }
    };

    sock.on('connect', () => { sock.emit('constructor:join', { docId }); back(); });
    sock.on('disconnect', lost);

    /**
     * Сеть пропала — это видно браузеру сразу, а сокету только когда он не
     * дождётся ответа: до тех пор человек печатает, считая, что коллеги это
     * видят. Поэтому слушаем и окно тоже.
     *
     * Возвращение сети сокет обычно замечает сам и присылает connect. Но если
     * соединение всё это время формально держалось, connect не придёт — тогда
     * возвращение объявляем здесь, иначе автосохранение осталось бы
     * остановленным навсегда.
     */
    const onOffline = () => lost();
    const onOnline = () => { if (sock.connected) back(); };
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);

    sock.on('constructor:presence', ({ peers: roster }: any) => {
      setPeers(normalizePeers(roster, sock.id || ''));
    });
    sock.on('constructor:selection', ({ socketId, selection }: any) => {
      setPeers((prev) => withSelection(prev, socketId, selection));
    });
    sock.on('constructor:op', ({ op }: any) => {
      if (op?.id) fns.current.applyOp(op);
    });
    /**
     * Коллега записал документ. Моё окно от жизни не отстало — оно получило
     * его правку операциями и показывает ровно то же, — поэтому время чтения
     * двигается вперёд. Иначе сверка времени приняла бы живого участника за
     * отставшее окно и отказала бы ему в сохранении.
     */
    sock.on('constructor:saved', ({ at }: any) => {
      if (typeof at === 'string' && at) fns.current.onPeerSaved(at);
    });

    return () => {
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
      try {
        sock.emit('constructor:leave', { docId });
        sock.disconnect();
      } catch (_) { /* сокет уже мёртв — уходить всё равно надо */ }
      sockRef.current = null;
      hold.current = false;
      dropRef.current = null;
      setPeers([]);
      setLink('live');
      setDropPeers(0);
    };
  }, [docId, ready]);

  const send = (event: string, payload: unknown) => {
    try { sockRef.current?.emit(event, payload); } catch (_) { /* нет связи — молчим */ }
  };

  return { peers, note: linkNote(link, dropPeers), hold, send };
}
