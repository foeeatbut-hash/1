import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { X, ChevronUp, ChevronDown } from 'lucide-react';
import Rig, { RigRefs } from '../robot/rig';
import { PROP_SHAPES, PropId, BACK_PROPS, FRONT_PROPS } from '../robot/props';
import { Player, Snapshot, ChestKind, Scene, pickScene } from '../robot/player';
import { POSES, FaceName } from '../robot/poses';
import { applySnapshot, applyGaze, poseSnapshot } from '../robot/apply';
import {
  SCENES, FLOOR, HOME_X, STAGE_W,
  SCENE_HELLO, SCENE_BELL, SCENE_WAIT, SCENE_DONE, SCENE_LISTEN,
  SCENE_SLEEP, SCENE_WAKE, SCENE_ENOUGH, POKES,
} from '../robot/scenes';
import { useAssistantStore } from '../store/assistantStore';
import { useNotificationStore } from '../store/notificationStore';

/**
 * Полка Флакси — единственная шапка панели помощника.
 *
 * Здесь он живёт: сидит, играет в футбол, читает чертёж, реагирует на то, что
 * происходит в программе. Заголовка над чатом больше нет: панель узнаётся по
 * самому роботу, а место отдано ему.
 *
 * Что важно в устройстве:
 * • сценки — данные (robot/scenes.ts), здесь только правила «когда»;
 * • пока сценка не идёт, кадровый цикл не запущен вовсе;
 * • при «уменьшить движение», свёрнутой полке и потере фокуса окна робот
 *   замирает и ничего не считает;
 * • полку можно свернуть в полосу 36 px, не выключая робота совсем.
 */

const STAGE_H = 88;
const BASE_SCALE = 0.85;
const SHELF_KEY = 'flux_robot_shelf';
const LEVEL_KEY = 'flux_robot_level';       // calm | normal | lively
const SLEEP_AFTER = 150000;                  // 2,5 минуты тишины — и он засыпает

type Level = 'calm' | 'normal' | 'lively';

const GAP: Record<Level, [number, number]> = {
  calm: [55000, 90000],
  normal: [26000, 46000],
  lively: [14000, 26000],
};

function readLevel(): Level {
  try {
    const v = localStorage.getItem(LEVEL_KEY);
    if (v === 'calm' || v === 'lively') return v;
  } catch (_) {}
  return 'normal';
}

export default function RobotStage({ onClose }: { onClose: () => void }) {
  const refs = useRef<RigRefs>({});
  const propRefs = useRef<Partial<Record<PropId, SVGGElement | null>>>({});
  const svgRef = useRef<SVGSVGElement | null>(null);

  const [face, setFace] = useState<FaceName>('neutral');
  const [chest, setChest] = useState<ChestKind>('idle');
  const [blink, setBlink] = useState(false);
  const [bubble, setBubble] = useState('');
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem(SHELF_KEY) === '0'; } catch { return false; }
  });
  const [level, setLevel] = useState<Level>(readLevel);

  const loading = useAssistantStore((s) => s.loading);
  const messages = useAssistantStore((s) => s.messages);
  const unread = useNotificationStore((s) => s.unread);

  const reduced = useRef(false);
  const asleep = useRef(false);
  const lastTouch = useRef(Date.now());
  const nextSceneAt = useRef(Date.now() + 9000);
  const recent = useRef<string[]>([]);
  const pokeAt = useRef<number[]>([]);
  const pokeIdx = useRef(0);
  const drag = useRef<{ dx: number; dy: number; x: number; y: number; moved: boolean } | null>(null);
  const bubbleTimer = useRef<any>(null);

  // ── Проигрыватель ────────────────────────────────────────────────────────
  const playerRef = useRef<Player | null>(null);
  if (!playerRef.current) {
    playerRef.current = new Player({
      apply: (s: Snapshot) => applySnapshot({ refs: refs.current as any, props: propRefs.current, floor: FLOOR, scale: BASE_SCALE }, s),
      face: (f) => setFace(f),
      chest: (c) => setChest(c),
      say: (text) => {
        setBubble(text);
        clearTimeout(bubbleTimer.current);
        if (text) bubbleTimer.current = setTimeout(() => setBubble(''), 2600);
      },
      end: () => scheduleNext(),
    }, poseSnapshot(POSES.sit, HOME_X));
  }
  const player = playerRef.current!;

  const scheduleNext = useCallback(() => {
    const [a, b] = GAP[level];
    nextSceneAt.current = Date.now() + a + Math.random() * (b - a);
  }, [level]);

  const play = useCallback((scene: Scene) => {
    if (reduced.current) return;
    player.play(scene);
    recent.current = [scene.id, ...recent.current].slice(0, 3);
  }, [player]);

  const wake = useCallback(() => {
    lastTouch.current = Date.now();
    if (asleep.current) {
      asleep.current = false;
      play(SCENE_WAKE);
    }
  }, [play]);

  // Первое появление: приезжает справа и машет
  useLayoutEffect(() => {
    applySnapshot({ refs: refs.current as any, props: propRefs.current, floor: FLOOR, scale: BASE_SCALE },
      poseSnapshot(POSES.sit, HOME_X));
    reduced.current = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (!collapsed && !reduced.current) {
      const t = setTimeout(() => play(SCENE_HELLO), 120);
      return () => clearTimeout(t);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { player.stop(false); clearTimeout(bubbleTimer.current); }, [player]);

  // Отладочная ручка для подгонки поз и сценок: включается вручную
  // (localStorage flux_robot_debug = 1) и по умолчанию ничего не создаёт.
  useEffect(() => {
    try { if (localStorage.getItem('flux_robot_debug') !== '1') return; } catch (_) { return; }
    (window as any).__flaxi = {
      poses: Object.keys(POSES),
      scenes: [...SCENES, ...POKES].map((s) => s.id),
      pose: (name: keyof typeof POSES) => {
        player.stop(false);
        applySnapshot({ refs: refs.current as any, props: propRefs.current, floor: FLOOR, scale: BASE_SCALE },
          poseSnapshot(POSES[name], HOME_X));
      },
      play: (id: string) => {
        const all = [...SCENES, ...POKES, SCENE_HELLO, SCENE_BELL, SCENE_WAIT, SCENE_DONE, SCENE_SLEEP, SCENE_WAKE, SCENE_ENOUGH];
        const sc = all.find((s) => s.id === id);
        if (sc) play(sc);
      },
      face: (f: FaceName) => setFace(f),
      raw: (over: Record<string, number>) => {
        player.stop(false);
        applySnapshot({ refs: refs.current as any, props: propRefs.current, floor: FLOOR, scale: BASE_SCALE },
          poseSnapshot({ ...POSES.stand, ...over } as any, HOME_X));
      },
    };
    return () => { delete (window as any).__flaxi; };
  }, [play, player]);

  // Настройки могут поменяться на другом экране
  useEffect(() => {
    const onChange = () => {
      setLevel(readLevel());
      try { setCollapsed(localStorage.getItem(SHELF_KEY) === '0'); } catch (_) {}
    };
    window.addEventListener('flux:robot-changed', onChange);
    return () => window.removeEventListener('flux:robot-changed', onChange);
  }, []);

  // ── Моргание ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (collapsed) return;
    let alive = true;
    const tick = () => {
      if (!alive) return;
      if (!document.hidden && !asleep.current) {
        setBlink(true);
        setTimeout(() => setBlink(false), 150);
      }
      timer = setTimeout(tick, 2800 + Math.random() * 3400);
    };
    let timer = setTimeout(tick, 2600);
    return () => { alive = false; clearTimeout(timer); };
  }, [collapsed]);

  // ── Взгляд за курсором ───────────────────────────────────────────────────
  useEffect(() => {
    if (collapsed || reduced.current) return;
    const onMove = (e: MouseEvent) => {
      const svg = svgRef.current;
      if (!svg) return;
      const r = svg.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * STAGE_W;
      const y = ((e.clientY - r.top) / r.height) * STAGE_H;
      applyGaze(refs.current as any, x - HOME_X, y - 40);
    };
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, [collapsed]);

  // ── Расписание сценок ────────────────────────────────────────────────────
  useEffect(() => {
    if (collapsed) return;
    const id = setInterval(() => {
      if (reduced.current || document.hidden || !document.hasFocus()) return;
      if (player.busy || drag.current) return;

      const idleFor = Date.now() - lastTouch.current;
      if (!asleep.current && idleFor > SLEEP_AFTER) {
        asleep.current = true;
        play(SCENE_SLEEP);
        return;
      }
      if (asleep.current) return;

      if (Date.now() >= nextSceneAt.current) {
        const scene = pickScene(SCENES, {
          calmOnly: level === 'calm',
          hour: new Date().getHours(),
          avoid: recent.current,
        });
        if (scene) play(scene);
        else scheduleNext();
      }
    }, 900);
    return () => clearInterval(id);
  }, [collapsed, level, play, player, scheduleNext]);

  // ── Реакции на программу ─────────────────────────────────────────────────
  const seenUnread = useRef(unread);
  useEffect(() => {
    if (unread > seenUnread.current && !collapsed) { wake(); play(SCENE_BELL); }
    seenUnread.current = unread;
  }, [unread, collapsed, play, wake]);

  const wasLoading = useRef(loading);
  useEffect(() => {
    if (collapsed) return;
    if (loading && !wasLoading.current) { wake(); play(SCENE_WAIT); }
    if (!loading && wasLoading.current) {
      const last = messages[messages.length - 1];
      const empty = last && last.role === 'assistant' && /не наш|ничего/i.test(String(last.text || ''));
      play(empty ? { ...SCENE_DONE, id: 'shrug-done' } : SCENE_DONE);
    }
    wasLoading.current = loading;
  }, [loading, collapsed, messages, play, wake]);

  // Пока идёт обработка — повторяем «ожидание», чтобы он не замирал
  useEffect(() => {
    if (!loading || collapsed || reduced.current) return;
    const id = setInterval(() => { if (!player.busy) play(SCENE_WAIT); }, 600);
    return () => clearInterval(id);
  }, [loading, collapsed, play, player]);

  // Человек печатает в поле помощника — робот разворачивается и слушает
  useEffect(() => {
    if (collapsed) return;
    const onType = () => {
      wake();
      if (!player.busy) play(SCENE_LISTEN);
      nextSceneAt.current = Date.now() + 12000;
    };
    window.addEventListener('flux:assistant-typing', onType);
    return () => window.removeEventListener('flux:assistant-typing', onType);
  }, [collapsed, play, player, wake]);

  // ── Тычок и перетаскивание ───────────────────────────────────────────────
  const onPointerDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    const r = svgRef.current!.getBoundingClientRect();
    drag.current = { dx: e.clientX, dy: e.clientY, x: HOME_X, y: 0, moved: false };
    wake();
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.dx;
    const dy = e.clientY - d.dy;
    if (!d.moved && Math.abs(dx) + Math.abs(dy) < 4) return;
    if (!d.moved) { d.moved = true; player.stop(false); setFace('surprise'); }
    d.x = Math.max(34, Math.min(STAGE_W - 34, HOME_X + dx));
    d.y = Math.max(-30, Math.min(28, dy));
    // Болтается на курсоре: ноги вниз, руки вверх
    const snap = poseSnapshot(
      { ...POSES.startle, hipL: 34 + Math.sin(Date.now() / 90) * 10, hipR: -34 - Math.sin(Date.now() / 90) * 10 },
      d.x);
    applySnapshot({ refs: refs.current as any, props: propRefs.current, floor: FLOOR + d.y, scale: BASE_SCALE }, snap);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    if (!d) return;

    if (d.moved) {
      // На резинке домой: из дома он не уходит
      play({
        id: 'drop', dur: 900,
        frames: [
          { t: 0, x: d.x, pose: 'startle', face: 'surprise' },
          { t: 420, x: HOME_X, pose: 'land', ease: 'in', shake: 1.6, face: 'shy' },
          { t: 700, pose: 'stand', ease: 'out', face: 'happy' },
          { t: 900, pose: 'sit', ease: 'inOut' },
        ],
      });
      return;
    }

    // Не двигали — значит ткнули
    const now = Date.now();
    pokeAt.current = [...pokeAt.current.filter((t) => now - t < 10000), now];
    if (pokeAt.current.length >= 5) {
      pokeAt.current = [];
      play(SCENE_ENOUGH);
      return;
    }
    pokeIdx.current = (pokeIdx.current + 1) % POKES.length;
    play(POKES[pokeIdx.current]);
  };

  const toggleShelf = () => {
    const next = !collapsed;
    setCollapsed(next);
    try { localStorage.setItem(SHELF_KEY, next ? '0' : '1'); } catch (_) {}
    if (next) player.stop(false);
    else setTimeout(() => play(SCENE_HELLO), 60);
  };

  // ── Разметка ─────────────────────────────────────────────────────────────
  const btn = 'p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white ' +
    'hover:bg-black/[0.06] dark:hover:bg-white/[0.08] cursor-pointer transition-ui';

  return (
    <div
      className="relative shrink-0 overflow-hidden border-b border-black/[0.06] dark:border-white/[0.07]
                 bg-gradient-to-b from-emerald-500/[0.10] to-transparent dark:from-emerald-400/[0.07]"
      style={{ height: collapsed ? 36 : STAGE_H }}
    >
      {!collapsed && (
        <>
          {/* Пузырь с репликой */}
          {bubble && (
            <div style={{ left: `${(HOME_X / STAGE_W) * 100}%` }}
              className="absolute -translate-x-1/2 top-1 z-10 px-2.5 py-1 rounded-xl
                            text-2xs font-semibold whitespace-nowrap pointer-events-none
                            bg-white/95 dark:bg-slate-900/95 text-slate-700 dark:text-slate-300
                            border border-black/[0.06] dark:border-white/[0.08]  flux-robot-bubble">
              {bubble}
            </div>
          )}
          <svg
            ref={svgRef}
            viewBox={`0 0 ${STAGE_W} ${STAGE_H}`}
            width="100%" height={STAGE_H}
            className="absolute inset-0 cursor-grab active:cursor-grabbing select-none touch-none"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            role="img"
            aria-label="Помощник Flux"
          >
            {/* Полка, на которой он живёт */}
            <line x1="0" y1={FLOOR + 0.5} x2={STAGE_W} y2={FLOOR + 0.5}
              stroke="currentColor" strokeWidth="1" className="text-black/[0.07] dark:text-white/[0.09]" />
            {/* Обстановка — за роботом */}
            {BACK_PROPS.map((id) => (
              <g key={id} ref={(el) => { propRefs.current[id] = el; }} opacity="0">
                {PROP_SHAPES[id]}
              </g>
            ))}
            <Rig refs={refs.current} face={face} blink={blink} chest={chest} />
            {/* То, что он держит в руках, — перед ним, иначе кружка пропадает за корпусом */}
            {FRONT_PROPS.map((id) => (
              <g key={id} ref={(el) => { propRefs.current[id] = el; }} opacity="0">
                {PROP_SHAPES[id]}
              </g>
            ))}
          </svg>
        </>
      )}

      {collapsed && (
        <div className="absolute inset-0 flex items-center gap-2 px-3">
          <MiniFlaxi />
          <span className="text-2xs font-semibold text-slate-500 dark:text-slate-400">Помощник Flux</span>
        </div>
      )}

      <div className="absolute top-1.5 right-1.5 z-10 flex items-center gap-0.5">
        <button type="button" onClick={toggleShelf} className={btn}
          title={collapsed ? 'Развернуть полку помощника' : 'Свернуть полку помощника'}
          aria-label={collapsed ? 'Развернуть полку' : 'Свернуть полку'}>
          {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
        </button>
        <button type="button" onClick={onClose} className={btn} title="Закрыть" aria-label="Закрыть помощника">
          <X className="w-4.5 h-4.5" />
        </button>
      </div>
    </div>
  );
}

/** Робот в свёрнутой полке: сидит, моргает, но не играет. */
function MiniFlaxi() {
  const refs = useRef<RigRefs>({});
  const [blink, setBlink] = useState(false);
  useLayoutEffect(() => {
    applySnapshot({ refs: refs.current as any, floor: 27, scale: 0.29 }, poseSnapshot(POSES.sit, 14));
  }, []);
  useEffect(() => {
    const id = setInterval(() => { setBlink(true); setTimeout(() => setBlink(false), 150); }, 4200);
    return () => clearInterval(id);
  }, []);
  return (
    <svg viewBox="0 0 28 28" width="28" height="28" aria-hidden>
      <Rig refs={refs.current} face="happy" blink={blink} idPrefix="flxmini" />
    </svg>
  );
}
