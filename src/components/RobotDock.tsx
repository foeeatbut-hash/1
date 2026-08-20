import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Rig, { RigRefs } from '../robot/rig';
import { POSES, FaceName } from '../robot/poses';
import { applySnapshot, applyGaze, poseSnapshot } from '../robot/apply';
import { useAssistantStore } from '../store/assistantStore';
import { useNotificationStore } from '../store/notificationStore';

/**
 * Флакси, когда чат закрыт: выглядывает из-за правого края, рядом с кнопкой
 * помощника. Он не бродит по программе и ничего не закрывает — только высовы-
 * вается, поглядывает и зовёт обратно.
 *
 * Клик открывает чат, и робот уезжает на полку в его шапке. Тянуть можно вверх
 * и вниз — высота запоминается; в сторону — тянется и возвращается: из дома он
 * не уходит.
 */

const DOCK_W = 54;
const DOCK_H = 78;
const Y_KEY = 'flux_robot_dock_y';

/**
 * Ширина места, по которому робот ездит. Больше самого робота: раньше место
 * было ровно по нему, и в состоянии покоя робот стоял сдвинутым на 20 px за
 * правый край — то есть был обрезан ровной вертикальной линией по границе
 * рельса. Задумывалось «выглядывает из-за края», читалось «сломалась
 * отрисовка»: рельс белый на белом, стены, из-за которой можно выглядывать,
 * там не видно.
 */
const DOCK_BOX = DOCK_W + 30;

// Насколько робот сдвинут вправо, к рельсу: 0 — прячется, 1 — стоит у рельса,
// 2 — шагнул к содержимому. В покое (1) он упирается в рельс ровно краем и
// целиком помещается в месте — обрезать его больше нечем.
const SHIFT = [44, 30, 12];

export default function RobotDock() {
  const setOpen = useAssistantStore((s) => s.setOpen);
  const unread = useNotificationStore((s) => s.unread);

  const refs = useRef<RigRefs>({});
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [face, setFace] = useState<FaceName>('happy');
  const [blink, setBlink] = useState(false);
  const [out, setOut] = useState(0);        // 0 прячется · 1 выглядывает · 2 вышел
  // Ниже кнопок правого рельса: «Уведомления», «Помощник», «Справка» занимают
  // сверху около 170 точек, и робот на 96 садился прямо на третью кнопку —
  // подпись читалась наполовину, а нажатие попадало в робота. Сохранённое
  // положение тоже подтягиваем: иначе у того, кто уже двигал робота, кнопка
  // так и осталась бы закрытой.
  const RAIL_BOTTOM = 176;
  const [y, setY] = useState<number>(() => {
    try {
      const v = parseInt(localStorage.getItem(Y_KEY) || '', 10);
      if (Number.isFinite(v)) return Math.max(RAIL_BOTTOM, v);
    } catch (_) {}
    return RAIL_BOTTOM + 24;
  });
  const [rubber, setRubber] = useState(0);  // «резинка» при попытке утащить в сторону
  const drag = useRef<{ y0: number; x0: number; top: number; moved: boolean } | null>(null);
  const hover = useRef(false);

  const pose = (name: keyof typeof POSES) => {
    applySnapshot({ refs: refs.current as any, floor: DOCK_H - 2, scale: 0.72 }, poseSnapshot(POSES[name], DOCK_W / 2 + 4));
  };

  useLayoutEffect(() => { pose('stand'); }, []);

  // Моргание
  useEffect(() => {
    const id = setInterval(() => {
      if (document.hidden) return;
      setBlink(true);
      setTimeout(() => setBlink(false), 150);
    }, 3400 + Math.random() * 2600);
    return () => clearInterval(id);
  }, []);

  // Сам по себе изредка выглядывает сильнее и прячется обратно
  useEffect(() => {
    const reduced = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced) { setOut(1); return; }
    let timer: any;
    const cycle = () => {
      if (!document.hidden && !hover.current && !drag.current) {
        setOut(2);
        setFace('happy');
        pose('wave');
        setTimeout(() => { if (!hover.current) { setOut(1); pose('stand'); } }, 2400);
      }
      timer = setTimeout(cycle, 20000 + Math.random() * 22000);
    };
    timer = setTimeout(cycle, 6000);
    setOut(1);
    return () => clearTimeout(timer);
  }, []);

  // Непрочитанные — повод высунуться и помахать
  const seen = useRef(unread);
  useEffect(() => {
    if (unread > seen.current) {
      setOut(2);
      setFace('surprise');
      pose('waveHigh');
      setTimeout(() => { setFace('happy'); pose('wave'); }, 700);
      setTimeout(() => { if (!hover.current) { setOut(1); pose('stand'); setFace('happy'); } }, 3600);
    }
    seen.current = unread;
  }, [unread]);

  // Взгляд за курсором
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const box = boxRef.current;
      if (!box) return;
      const r = box.getBoundingClientRect();
      applyGaze(refs.current as any, e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
    };
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, []);

  const onEnter = () => { hover.current = true; setOut(2); setFace('happy'); pose('stand'); };
  const onLeave = () => { hover.current = false; if (!drag.current) { setOut(1); pose('stand'); } };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    drag.current = { y0: e.clientY, x0: e.clientX, top: y, moved: false };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dy = e.clientY - d.y0;
    const dx = e.clientX - d.x0;
    if (!d.moved && Math.abs(dy) + Math.abs(dx) < 4) return;
    d.moved = true;
    setY(Math.max(56, Math.min(window.innerHeight - DOCK_H - 16, d.top + dy)));
    // В сторону уходит только на треть пути — и то на резинке
    setRubber(Math.max(-46, Math.min(0, dx)) / 3);
    setFace('surprise');
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    setRubber(0);
    setFace('happy');
    if (!d) return;
    if (d.moved) {
      try { localStorage.setItem(Y_KEY, String(y)); } catch (_) {}
      pose('land');
      setTimeout(() => pose('stand'), 260);
      return;
    }
    // Не двигали — значит открыть чат
    setOpen(true);
  };

  const shift = SHIFT[out] ?? SHIFT[1];

  return (
    <div
      ref={boxRef}
      className="fixed z-40 right-14 overflow-hidden touch-none cursor-pointer select-none"
      style={{ top: y, width: DOCK_BOX, height: DOCK_H }}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      title="Помощник Flux · нажмите, чтобы открыть чат"
      role="button"
      aria-label="Открыть помощника"
    >
      <svg
        viewBox={`0 0 ${DOCK_W} ${DOCK_H}`} width={DOCK_W} height={DOCK_H}
        style={{ transform: `translateX(${shift + rubber}px)`, transition: drag.current ? 'none' : 'transform 320ms cubic-bezier(.2,.8,.2,1)' }}
        className="drop-shadow-md"
        aria-hidden
      >
        <Rig refs={refs.current} face={face} blink={blink} idPrefix="flxdock" />
      </svg>
      {unread > 0 && (
        /* Счётчик у правого края — там, где сам робот. Слева он висел бы в
           пустом месте: место шире робота на 30 px. */
        <span className="absolute top-0 right-0 min-w-4 h-4 px-1 rounded-full bg-rose-500 text-white text-2xs font-bold flex items-center justify-center pointer-events-none">
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </div>
  );
}
