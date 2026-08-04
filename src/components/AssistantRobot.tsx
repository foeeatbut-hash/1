import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAssistantStore } from '../store/assistantStore';
import { useNotificationStore } from '../store/notificationStore';

/**
 * Флакси — маленький робот-помощник, который живёт поверх программы.
 *
 * Его можно взять мышью и поставить в любой угол, ткнуть — он ответит,
 * а двойным щелчком открыть помощника. Пока его не трогают, он моргает,
 * оглядывается и в конце концов засыпает, чтобы не мельтешить перед
 * глазами весь день.
 *
 * Что здесь важно и почему:
 * • перетаскивание идёт через transform, без пересчёта раскладки;
 * • положение помнится между запусками и подтягивается при изменении окна,
 *   иначе робот однажды окажется за краем экрана;
 * • курсор и клики он перехватывает только на себе — работа не страдает;
 * • его можно выключить в настройках, и тогда он не создаётся вовсе.
 */

const POS_KEY = 'flux_robot_pos';
const SIZE = 76;          // видимый размер робота
const EDGE = 12;          // отступ от края окна
const SLEEP_AFTER = 75000; // через сколько без внимания он засыпает

type Mood = 'idle' | 'happy' | 'talk' | 'sleep' | 'drag' | 'wave' | 'work' | 'think' | 'peek';

// Чем робот занят, пока его не трогают. Он не просто висит: то читает,
// то что-то подкручивает, то задумывается. Занятие меняется само и
// длится недолго, чтобы движение не превращалось в мельтешение.
const BUSY: { mood: Mood; hint: string }[] = [
  { mood: 'work',  hint: 'подкручивает' },
  { mood: 'think', hint: 'думает' },
  { mood: 'peek',  hint: 'подглядывает' },
];

// Реплики на щелчок. Короткие и по делу: робот — не болтун, а напоминание
// о том, что помощник рядом.
const POKES = [
  'Ой! Я тут.',
  'Щекотно 😊',
  'Нужна помощь? Спросите меня.',
  'Могу найти тег или документ.',
  'Двойной щелчок — и я открою чат.',
  'Меня можно перетащить куда удобно.',
  'Ищу по всей базе проекта.',
  'Скучаю по работе…',
];

const IDLE_LINES = [
  'Спросите: «что зависло»',
  'Спросите: «покажи все теги»',
  'Могу выгрузить найденное в Excel',
  'Помню, где лежит корзина',
  'Ищу по коду тега и по марке',
  'Знаю, что просрочено по ВДР',
];

// Подсказка под раздел, в котором человек сейчас работает. Робот должен
// быть к месту: в Проводнике говорить про файлы, а не про закупки.
const BY_ROUTE: { match: RegExp; lines: string[] }[] = [
  { match: /^\/registry/, lines: ['Связи тянутся мышью между карточками', 'Спросите «покажи дубли»'] },
  { match: /^\/explorer/, lines: ['Удалённое лежит в корзине', 'Есть подборка «Без тегов»'] },
  { match: /^\/management/, lines: ['Могу показать, что зависло дольше двух недель', 'Выгрузка в Excel — по видимому срезу'] },
  { match: /^\/constructor/, lines: ['Метки в шаблоне заполняются сами', 'Кнопка «Подстановки» — в панели'] },
  { match: /^\/notes/, lines: ['Блокнот личный, но заметкой можно поделиться'] },
  { match: /^\/equipment/, lines: ['Конфликты ревизий подсвечиваются', 'Спросите «какой расход у 3700-K02»'] },
];

export default function AssistantRobot() {
  const setOpen = useAssistantStore((s) => s.setOpen);
  const isOpen = useAssistantStore((s) => s.isOpen);
  const unread = useNotificationStore((s) => s.unread);

  const [pos, setPos] = useState<{ x: number; y: number }>(() => {
    try {
      const raw = localStorage.getItem(POS_KEY);
      if (raw) return JSON.parse(raw);
    } catch (_) {}
    return { x: window.innerWidth - SIZE - 96, y: window.innerHeight - SIZE - 120 };
  });
  const [mood, setMood] = useState<Mood>('idle');
  const [bubble, setBubble] = useState<string>('');
  const [blink, setBlink] = useState(false);
  const [look, setLook] = useState(0);           // -1 влево, 0 прямо, 1 вправо

  const dragRef = useRef<{ dx: number; dy: number; moved: boolean } | null>(null);
  const lastTouch = useRef<number>(Date.now());
  const bubbleTimer = useRef<any>(null);
  const pokeIndex = useRef(0);

  const clamp = useCallback((p: { x: number; y: number }) => ({
    x: Math.min(Math.max(EDGE, p.x), Math.max(EDGE, window.innerWidth - SIZE - EDGE)),
    y: Math.min(Math.max(EDGE, p.y), Math.max(EDGE, window.innerHeight - SIZE - EDGE)),
  }), []);

  // Робот не должен теряться за краем при изменении размера окна
  useEffect(() => {
    const onResize = () => setPos((p) => clamp(p));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [clamp]);

  useEffect(() => {
    try { localStorage.setItem(POS_KEY, JSON.stringify(pos)); } catch (_) {}
  }, [pos]);

  const say = useCallback((text: string, mood: Mood = 'talk', ms = 3200) => {
    setBubble(text);
    setMood(mood);
    lastTouch.current = Date.now();
    clearTimeout(bubbleTimer.current);
    bubbleTimer.current = setTimeout(() => {
      setBubble('');
      setMood('idle');
    }, ms);
  }, []);

  // ── Живость: моргание, взгляд по сторонам, сон ──
  useEffect(() => {
    const blinkTimer = setInterval(() => {
      if (mood === 'sleep') return;
      setBlink(true);
      setTimeout(() => setBlink(false), 160);
    }, 3600 + Math.random() * 2600);

    const lookTimer = setInterval(() => {
      if (mood === 'sleep' || mood === 'drag') return;
      setLook(Math.random() < 0.5 ? -1 : 1);
      setTimeout(() => setLook(0), 1100);
    }, 6000 + Math.random() * 4000);

    const lifeTimer = setInterval(() => {
      const idleFor = Date.now() - lastTouch.current;
      if (idleFor > SLEEP_AFTER) { setMood('sleep'); setBubble(''); return; }
      if (mood === 'drag' || mood === 'talk') return;
      const roll = Math.random();
      // Изредка подсказывает, что умеет — но только когда чат закрыт
      if (!isOpen && roll < 0.28) {
        const route = String(window.location?.hash || window.location?.pathname || '');
        const forRoute = BY_ROUTE.find(r => r.match.test(route.replace('#', '')));
        const pool = forRoute && Math.random() < 0.65 ? forRoute.lines : IDLE_LINES;
        say(pool[Math.floor(Math.random() * pool.length)], 'talk', 4400);
        return;
      }
      // Или просто занимается своим делом — так он выглядит живым, а не
      // ждущим команды.
      if (roll < 0.62) {
        const busy = BUSY[Math.floor(Math.random() * BUSY.length)];
        setMood(busy.mood);
        setTimeout(() => setMood((m) => (m === busy.mood ? 'idle' : m)), 3200 + Math.random() * 2500);
      }
    }, 17000);

    return () => { clearInterval(blinkTimer); clearInterval(lookTimer); clearInterval(lifeTimer); };
  }, [mood, isOpen, say]);

  // Непрочитанные уведомления — повод помахать рукой
  const seenUnread = useRef(unread);
  useEffect(() => {
    if (unread > seenUnread.current) {
      say(unread === 1 ? 'Новое уведомление' : `Новых уведомлений: ${unread}`, 'wave', 4200);
    }
    seenUnread.current = unread;
  }, [unread, say]);

  // ── Перетаскивание ──
  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    dragRef.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y, moved: false };
    lastTouch.current = Date.now();
    if (mood === 'sleep') setMood('idle');
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const next = clamp({ x: e.clientX - d.dx, y: e.clientY - d.dy });
    if (Math.abs(next.x - pos.x) > 2 || Math.abs(next.y - pos.y) > 2) {
      if (!d.moved) { d.moved = true; setMood('drag'); setBubble(''); }
      setPos(next);
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const d = dragRef.current;
    dragRef.current = null;
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    if (!d) return;
    if (d.moved) {
      setMood('happy');
      setTimeout(() => setMood('idle'), 900);
      return;
    }
    // Не двигали — значит ткнули
    pokeIndex.current = (pokeIndex.current + 1) % POKES.length;
    say(POKES[pokeIndex.current], 'happy', 2600);
  };

  const sleeping = mood === 'sleep';

  return (
    <div
      className="fixed z-[60] touch-none"
      style={{ left: 0, top: 0, transform: `translate3d(${pos.x}px, ${pos.y}px, 0)`, width: SIZE }}
    >
      {/* Реплика */}
      {bubble && (
        <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-max max-w-[220px]
                        px-2.5 py-1.5 rounded-xl text-2xs font-semibold leading-snug text-center
                        bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200
                        border border-slate-200 dark:border-slate-700 shadow-lg
                        after:content-[''] after:absolute after:top-full after:left-1/2 after:-translate-x-1/2
                        after:border-6 after:border-transparent after:border-t-white dark:after:border-t-slate-900
                        flux-robot-bubble">
          {bubble}
        </div>
      )}

      <button
        type="button"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDoubleClick={() => { setOpen(true); say('Открываю чат', 'happy', 1500); }}
        onMouseEnter={() => { lastTouch.current = Date.now(); if (sleeping) setMood('idle'); }}
        title="Помощник Флакси · перетащите мышью, двойной щелчок — открыть чат"
        aria-label="Помощник: открыть чат"
        className={`block w-[76px] h-[76px] cursor-grab active:cursor-grabbing select-none
                    ${mood === 'drag' ? 'flux-robot-dragging' : 'flux-robot-float'}`}
      >
        <RobotFace mood={mood} blink={blink} look={look} />
      </button>
    </div>
  );
}

/** Сам робот: рисуем фигурами, чтобы он был чётким на любом экране. */
function RobotFace({ mood, blink, look }: { mood: Mood; blink: boolean; look: number }) {
  const sleeping = mood === 'sleep';
  const happy = mood === 'happy' || mood === 'wave';
  const thinking = mood === 'think';
  const working = mood === 'work';
  const peeking = mood === 'peek';
  // Занят делом — взгляд опущен на работу; подглядывает — скошен вбок
  const eyeShift = peeking ? 3.2 : working ? -1.4 : look * 2.4;
  const eyeDrop = working ? 1.6 : 0;

  return (
    <svg viewBox="0 0 80 80" width="76" height="76" className="drop-shadow-lg">
      <defs>
        <linearGradient id="fluxRobotBody" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="oklch(0.72 0.13 163)" />
          <stop offset="100%" stopColor="oklch(0.55 0.13 163)" />
        </linearGradient>
        <radialGradient id="fluxRobotGlow">
          <stop offset="0%" stopColor="oklch(0.85 0.16 163)" stopOpacity="0.55" />
          <stop offset="100%" stopColor="oklch(0.85 0.16 163)" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Свечение под роботом — «стоит на месте», а не висит в пустоте */}
      <ellipse cx="40" cy="72" rx="20" ry="5" fill="url(#fluxRobotGlow)" />

      {/* Антенна */}
      <line x1="40" y1="16" x2="40" y2="9" stroke="oklch(0.55 0.13 163)" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="40" cy="7" r="3.6" fill="oklch(0.80 0.17 150)" className={sleeping ? '' : 'flux-robot-antenna'} />

      {/* Голова */}
      <rect x="14" y="16" width="52" height="42" rx="15" fill="url(#fluxRobotBody)" />
      <rect x="14" y="16" width="52" height="42" rx="15" fill="none"
        stroke="oklch(0.45 0.11 163)" strokeWidth="1.2" opacity="0.5" />

      {/* Экранчик лица */}
      <rect x="21" y="24" width="38" height="25" rx="10" fill="oklch(0.21 0.03 163)" opacity="0.92" />

      {/* Глаза */}
      {sleeping ? (
        <>
          <path d="M27 36 q4 -4 8 0" stroke="oklch(0.85 0.14 163)" strokeWidth="2.2" fill="none" strokeLinecap="round" />
          <path d="M45 36 q4 -4 8 0" stroke="oklch(0.85 0.14 163)" strokeWidth="2.2" fill="none" strokeLinecap="round" />
          <text x="60" y="20" fontSize="9" fill="oklch(0.75 0.10 163)" className="flux-robot-z">z</text>
          <text x="66" y="13" fontSize="7" fill="oklch(0.75 0.10 163)" opacity="0.7" className="flux-robot-z2">z</text>
        </>
      ) : blink ? (
        <>
          <rect x={27 + eyeShift} y="35" width="8" height="2.2" rx="1.1" fill="oklch(0.90 0.14 163)" />
          <rect x={45 + eyeShift} y="35" width="8" height="2.2" rx="1.1" fill="oklch(0.90 0.14 163)" />
        </>
      ) : (
        <>
          <circle cx={31 + eyeShift} cy={35 + eyeDrop} r="4.4" fill="oklch(0.92 0.14 163)" />
          <circle cx={49 + eyeShift} cy={35 + eyeDrop} r="4.4" fill="oklch(0.92 0.14 163)" />
          <circle cx={32.6 + eyeShift} cy={33.4 + eyeDrop} r="1.5" fill="white" opacity="0.95" />
          <circle cx={50.6 + eyeShift} cy={33.4 + eyeDrop} r="1.5" fill="white" opacity="0.95" />
        </>
      )}

      {/* Рот: улыбка шире, когда рад */}
      {!sleeping && (
        happy
          ? <path d="M33 43 q7 6 14 0" stroke="oklch(0.90 0.14 163)" strokeWidth="2" fill="none" strokeLinecap="round" />
          : <path d="M35 43.5 q5 3 10 0" stroke="oklch(0.85 0.12 163)" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      )}

      {/* Щёчки */}
      {happy && (
        <>
          <circle cx="24" cy="42" r="2.6" fill="oklch(0.78 0.12 20)" opacity="0.55" />
          <circle cx="56" cy="42" r="2.6" fill="oklch(0.78 0.12 20)" opacity="0.55" />
        </>
      )}

      {/* Занятия: думает — пузырьки над головой; работает — крутит ключ */}
      {thinking && (
        <>
          <circle cx="62" cy="22" r="2.2" fill="oklch(0.80 0.10 163)" className="flux-robot-think1" />
          <circle cx="68" cy="16" r="3" fill="oklch(0.80 0.10 163)" className="flux-robot-think2" />
        </>
      )}
      {working && (
        <g className="flux-robot-tool" style={{ transformOrigin: '62px 60px' }}>
          <rect x="59" y="52" width="2.6" height="11" rx="1.3" fill="oklch(0.55 0.03 163)" />
          <circle cx="60.3" cy="51" r="3.4" fill="none" stroke="oklch(0.55 0.03 163)" strokeWidth="2.2" />
        </g>
      )}

      {/* Ушки-заклёпки */}
      <rect x="10" y="30" width="4" height="12" rx="2" fill="oklch(0.50 0.11 163)" />
      <rect x="66" y="30" width="4" height="12" rx="2" fill="oklch(0.50 0.11 163)" />

      {/* Тело и ручки */}
      <rect x="26" y="58" width="28" height="13" rx="6" fill="url(#fluxRobotBody)" />
      <circle cx="21" cy="63" r="4.2" fill="oklch(0.62 0.12 163)"
        className={mood === 'wave' ? 'flux-robot-wave' : ''} style={{ transformOrigin: '21px 63px' }} />
      <circle cx="59" cy="63" r="4.2" fill="oklch(0.62 0.12 163)" />
    </svg>
  );
}
