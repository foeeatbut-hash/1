import React from 'react';
import type { Canvas } from './canvases';

/**
 * Обстановка вокруг холста.
 *
 * Полка 380×88 — это 4,3:1. Ни одна картина в такое отношение не ложится, и
 * первая попытка растянуть композицию по ленте дала клипарт. Решение другое:
 * холст остаётся в своём формате и занимает столько, сколько просит, а лишнее
 * место занимает то, для чего лента естественна, — стена галереи с
 * посетителями, мастерская с художником у мольберта, чертёжный стол.
 *
 * Заодно это отвечает на вопрос «а что это вообще»: рама и человек рядом
 * говорят «картина» быстрее любой подписи, и дают масштаб.
 *
 * Три обстановки:
 *   gallery — стена, рама, светильник, посетители смотрят;
 *   studio  — мольберт, художник с кистью, палитра, окно;
 *   desk    — чертёжный стол, лист, рука с пером.
 */

const W = 380;
const H = 88;

/** Место под холст: высота фиксирована, ширина — от отношения сторон. */
function fit(aspect: number, maxH: number, maxW: number) {
  let h = maxH;
  let w = h * aspect;
  if (w > maxW) { w = maxW; h = w / aspect; }
  return { w, h };
}

interface StageProps {
  canvas: Canvas;
}

// ── Люди ─────────────────────────────────────────────────────────────────────
// Силуэтами: на 88 точках лицо не нарисовать, а силуэт читается сразу и не
// спорит с картиной за внимание.

function Visitor({ x, ground, h, tone, delay = 0, bag = false }: {
  x: number; ground: number; h: number; tone: string; delay?: number; bag?: boolean;
}) {
  const headR = h * 0.11;
  const headY = ground - h + headR;
  return (
    <g className="flux-art-visitor" style={{ animationDelay: `${delay}s`, transformOrigin: `${x}px ${ground}px` }}>
      <ellipse cx={x} cy={ground + 1} rx={h * 0.16} ry={h * 0.035} fill="#000" opacity="0.18" />
      <path
        d={`M${x} ${headY + headR * 1.4}c${h * 0.13} 0 ${h * 0.17} ${h * 0.16} ${h * 0.18} ${h * 0.34}`
          + `c${h * 0.02} ${h * 0.14} ${h * 0.03} ${h * 0.3} ${h * 0.03} ${h * 0.44}`
          + `h${-h * 0.42}c0-${h * 0.14} ${h * 0.01}-${h * 0.3} ${h * 0.03}-${h * 0.44}`
          + `c${h * 0.01}-${h * 0.18} ${h * 0.05}-${h * 0.34} ${h * 0.18}-${h * 0.34}z`}
        fill={tone}
      />
      <circle cx={x} cy={headY} r={headR} fill={tone} />
      {bag && <path d={`M${x + h * 0.2} ${ground - h * 0.42}v${h * 0.16}h${h * 0.09}v-${h * 0.16}z`} fill={tone} opacity="0.85" />}
    </g>
  );
}

// ── Галерея ──────────────────────────────────────────────────────────────────
export function GalleryStage({ canvas }: StageProps) {
  const { Draw, aspect } = canvas;
  // Пол поднят: внизу слева лежит музейная табличка с названием, и рама не
  // должна на неё налезать. Полоса 74…88 остаётся под неё свободной.
  const ground = 74;
  const { w, h } = fit(aspect, 56, 150);
  // Холст левее середины: справа остаётся место людям, и композиция не делится
  // ровно пополам — так спокойнее для глаза
  const cx = 132;
  const x = cx - w / 2;
  const y = 4 + (56 - h) / 2;
  const b = 3.5; // рама

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <linearGradient id="gal-wall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#eae4da" /><stop offset="100%" stopColor="#dcd4c7" />
        </linearGradient>
        <linearGradient id="gal-frame" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#c9a44f" /><stop offset="45%" stopColor="#a8862f" />
          <stop offset="100%" stopColor="#7d6320" />
        </linearGradient>
        <linearGradient id="gal-light" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fff6d8" stopOpacity="0.55" /><stop offset="100%" stopColor="#fff6d8" stopOpacity="0" />
        </linearGradient>
      </defs>

      <rect width={W} height={H} fill="url(#gal-wall)" />
      {/* Пол и плинтус */}
      <rect y={ground} width={W} height={H - ground} fill="#c3b8a6" />
      <rect y={ground - 2} width={W} height="2.5" fill="#a99c88" />
      <rect y={ground + 4} width={W} height="1" fill="#b5a893" opacity="0.6" />

      {/* Свет от светильника — конус на картину */}
      <path d={`M${cx} 2L${x - 14} ${ground}H${x + w + 14}z`} fill="url(#gal-light)" className="flux-art-lamp" />
      <g fill="#6f665a">
        <rect x={cx - 1} y="0" width="2" height="5" />
        <path d={`M${cx - 7} 5h14l-3 4h-8z`} />
      </g>

      {/* Рама с холстом */}
      <g className="flux-art-hang" style={{ transformOrigin: `${cx}px ${y}px` }}>
        <rect x={x - b} y={y - b} width={w + b * 2} height={h + b * 2} rx="1" fill="url(#gal-frame)" />
        <rect x={x - b} y={y - b} width={w + b * 2} height={h + b * 2} rx="1" fill="none" stroke="#6b5417" strokeWidth="0.8" />
        <rect x={x - 1} y={y - 1} width={w + 2} height={h + 2} fill="#3a3228" />
        <g transform={`translate(${x} ${y}) scale(${w / (100 * aspect)} ${h / 100})`}>
          <Draw />
        </g>
        {/* Тень от рамы на стене */}
        <rect x={x - b} y={y + h + b} width={w + b * 2} height="2.5" fill="#000" opacity="0.12" />
      </g>

      {/* Табличка рядом с картиной */}
      <g opacity="0.5">
        <rect x={x + w + b + 5} y={y + h - 10} width="14" height="9" rx="1" fill="#fff" />
        <rect x={x + w + b + 7} y={y + h - 8} width="10" height="1" fill="#9a8f7e" />
        <rect x={x + w + b + 7} y={y + h - 5.5} width="7" height="1" fill="#b3a897" />
      </g>

      {/* Посетители: пара справа и одинокий слева */}
      <Visitor x={240} ground={ground} h={42} tone="#3d3a35" delay={0} />
      <Visitor x={256} ground={ground} h={36} tone="#4a463f" delay={0.9} bag />
      <Visitor x={324} ground={ground} h={39} tone="#565149" delay={1.7} />
      {/* Слева места нет: там музейная табличка с названием */}
      <Visitor x={350} ground={ground} h={33} tone="#4f4a43" delay={2.4} />

      {/* Скамья */}
      <g fill="#8c7f6c">
        <rect x="280" y="66" width="30" height="3" rx="1.2" />
        <rect x="284" y="69" width="2.5" height="5" /><rect x="303" y="69" width="2.5" height="5" />
      </g>
    </svg>
  );
}

// ── Мастерская ───────────────────────────────────────────────────────────────
export function StudioStage({ canvas }: StageProps) {
  const { Draw, aspect } = canvas;
  const ground = 76;
  const { w, h } = fit(aspect, 54, 130);
  const cx = 148;
  const x = cx - w / 2;
  const y = 6 + (54 - h) / 2;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <linearGradient id="st-wall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#d9cfc0" /><stop offset="100%" stopColor="#c6bbaa" />
        </linearGradient>
        <linearGradient id="st-win" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#e9f0f6" /><stop offset="100%" stopColor="#c7d6e4" />
        </linearGradient>
      </defs>
      <rect width={W} height={H} fill="url(#st-wall)" />
      {/* Окно слева — источник света в мастерской */}
      <g>
        <rect x="16" y="10" width="48" height="46" rx="1.5" fill="url(#st-win)" />
        <rect x="16" y="10" width="48" height="46" rx="1.5" fill="none" stroke="#8d8272" strokeWidth="2" />
        <line x1="40" y1="10" x2="40" y2="56" stroke="#8d8272" strokeWidth="1.6" />
        <line x1="16" y1="33" x2="64" y2="33" stroke="#8d8272" strokeWidth="1.6" />
        <path d="M64 12L120 60v-8L64 22z" fill="#fff8e6" opacity="0.35" className="flux-art-lamp" />
      </g>
      <rect y={ground} width={W} height={H - ground} fill="#b3a48d" />
      <rect y={ground - 1.5} width={W} height="2" fill="#9b8c76" />

      {/* Мольберт */}
      <g stroke="#7d6242" strokeWidth="3" strokeLinecap="round" fill="none">
        <line x1={cx - 22} y1={ground} x2={cx - 6} y2={y + 6} />
        <line x1={cx + 22} y1={ground} x2={cx + 6} y2={y + 6} />
        <line x1={cx} y1={y + h + 10} x2={cx} y2={ground + 2} />
        <line x1={cx - 16} y1={y + h + 4} x2={cx + 16} y2={y + h + 4} strokeWidth="4" />
      </g>

      {/* Холст на мольберте */}
      <g>
        <rect x={x - 2} y={y - 2} width={w + 4} height={h + 4} fill="#efe7d8" />
        <rect x={x - 2} y={y - 2} width={w + 4} height={h + 4} fill="none" stroke="#c3b49a" strokeWidth="1" />
        <g transform={`translate(${x} ${y}) scale(${w / (100 * aspect)} ${h / 100})`}>
          <Draw />
        </g>
      </g>

      {/* Художник справа, лицом к холсту */}
      <g>
        <ellipse cx="262" cy={ground + 1} rx="16" ry="3" fill="#000" opacity="0.16" />
        {/* Ноги и корпус */}
        <path d="M262 44c9 0 14 8 15 18 1 6 1 12 1 18h-32c0-6 0-12 1-18 1-10 6-18 15-18z" fill="#41423f" />
        {/* Голова со шляпой */}
        <circle cx="262" cy="38" r="7.5" fill="#c99a6a" />
        <path d="M251 34c1-6 6-9 11-9s10 3 11 9c-7-3-15-3-22 0z" fill="#6b5a3e" />
        <path d="M248 34h28v2.5h-28z" fill="#6b5a3e" />
        {/* Рука с кистью — тянется к холсту и возвращается */}
        <g className="flux-art-brush" style={{ transformOrigin: '256px 52px' }}>
          <path d="M256 52c-12 2-24 0-34-4" stroke="#41423f" strokeWidth="6" strokeLinecap="round" fill="none" />
          <path d="M222 48l-14-3" stroke="#8a6a3c" strokeWidth="2.4" strokeLinecap="round" />
          <circle cx="207" cy="45" r="2" fill="#2f6f7a" />
        </g>
        {/* Палитра во второй руке */}
        <g>
          <path d="M272 56c8-2 15 2 15 7s-7 8-15 6c-5-1-7-4-7-6s2-6 7-7z" fill="#b98f5c" />
          <circle cx="277" cy="59" r="1.6" fill="#c0392b" /><circle cx="282" cy="61" r="1.6" fill="#2f6f7a" />
          <circle cx="276" cy="64" r="1.6" fill="#e0a92c" />
        </g>
      </g>

      {/* Табурет и банки с кистями */}
      <g fill="#8a7250">
        <rect x="318" y="62" width="22" height="3" rx="1.2" />
        <rect x="321" y="65" width="2.5" height="15" /><rect x="335" y="65" width="2.5" height="15" />
      </g>
      <g>
        <rect x="348" y="66" width="12" height="14" rx="2" fill="#9aa7ad" />
        <g stroke="#7a5c34" strokeWidth="1.6" strokeLinecap="round">
          <line x1="351" y1="66" x2="349" y2="56" /><line x1="354" y1="66" x2="355" y2="54" />
          <line x1="357" y1="66" x2="360" y2="57" />
        </g>
      </g>
    </svg>
  );
}

// ── Чертёжный стол ───────────────────────────────────────────────────────────
export function DeskStage({ canvas }: StageProps) {
  const { Draw, aspect } = canvas;
  // Лист правее середины и выше: внизу слева лежит табличка с названием,
  // и лист не должен уходить под неё
  const { w, h } = fit(aspect, 58, 130);
  const cx = 176;
  const x = cx - w / 2;
  const y = 4;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <linearGradient id="dk-wood" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#8a6236" /><stop offset="100%" stopColor="#6b4a26" />
        </linearGradient>
      </defs>
      <rect width={W} height={H} fill="url(#dk-wood)" />
      {/* Доски стола */}
      <g stroke="#5c3f1f" strokeWidth="1" opacity="0.5">
        <line x1="0" y1="26" x2={W} y2="26" /><line x1="0" y1="58" x2={W} y2="58" />
      </g>

      {/* Лист с чертежом */}
      <g className="flux-art-hang" style={{ transformOrigin: `${cx}px ${y}px` }}>
        <rect x={x - 4} y={y - 4} width={w + 8} height={h + 8} fill="#e8dcc0" />
        <rect x={x - 4} y={y - 4} width={w + 8} height={h + 8} fill="none" stroke="#c0ab84" strokeWidth="0.8" />
        <g transform={`translate(${x} ${y}) scale(${w / (100 * aspect)} ${h / 100})`}>
          <Draw />
        </g>
      </g>

      {/* Рука с пером справа */}
      <g className="flux-art-pen" style={{ transformOrigin: '318px 54px' }}>
        {/* Предплечье из-за правого края и кисть руки */}
        <path d="M380 44c-16 0-32 4-44 12" stroke="#c99a6a" strokeWidth="11" strokeLinecap="round" fill="none" />
        <path d="M336 56c-8 2-14 5-18 8" stroke="#c99a6a" strokeWidth="9" strokeLinecap="round" fill="none" />
        {/* Перо: стержень к листу, опахало вверх */}
        <path d="M318 64l-14 8" stroke="#3f3222" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M322 60c10-12 22-19 34-21-8 12-18 21-30 25z" fill="#f2e9d4" />
        <path d="M322 60c10-12 22-19 34-21" stroke="#c4b492" strokeWidth="0.9" fill="none" />
      </g>

      {/* Циркуль и линейка слева */}
      <g stroke="#8a7a55" strokeWidth="2.4" strokeLinecap="round" fill="none">
        <path d="M46 70l10-28M56 42l10 28" />
        <circle cx="56" cy="40" r="2.4" fill="#8a7a55" />
      </g>
      <rect x="16" y="30" width="52" height="5" rx="1" fill="#cbb98d" opacity="0.8" transform="rotate(-7 42 32)" />

      {/* Чернильница */}
      <g>
        <ellipse cx="98" cy="78" rx="10" ry="4" fill="#3a2f22" />
        <path d="M88 78v-8c0-3 4-5 10-5s10 2 10 5v8z" fill="#4a3d2c" />
        <ellipse cx="98" cy="70" rx="10" ry="3.5" fill="#241c12" />
      </g>
    </svg>
  );
}

export const STAGES = {
  gallery: GalleryStage,
  studio: StudioStage,
  desk: DeskStage,
};

export type StageId = keyof typeof STAGES;
