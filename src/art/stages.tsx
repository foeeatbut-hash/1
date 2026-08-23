import React from 'react';
import type { Canvas } from './canvases';

/**
 * Обстановка вокруг холста.
 *
 * Полка — лента 380×96, почти 4:1. Ни одна картина в такое отношение не
 * ложится, и первая попытка растянуть композицию по ленте дала клипарт.
 * Решение другое: холст остаётся в своём формате и занимает столько, сколько
 * просит, а лишнее место занимает то, для чего лента естественна, — стена
 * галереи с посетителями, мастерская с художником у мольберта, чертёжный стол.
 *
 * Заодно это отвечает на вопрос «а что это вообще»: рама и человек рядом
 * говорят «картина» быстрее любой подписи, и дают масштаб.
 *
 * Насколько крупно. Раньше холсту отводилось 56 точек по высоте из 88, и на
 * «Моне Лизе» это давало полоску шириной 38 точек — разглядеть в ней что-то
 * было нельзя. Теперь подпись не лежит поверх сцены, а стоит отдельной
 * строкой под ней, и нижняя полоса освободилась: холсту отдано 74 точки из 96,
 * то есть треть высоты сверх прежнего. Люди подросли следом — иначе они
 * перестают давать масштаб.
 *
 * Три обстановки:
 *   gallery — стена, рама, светильник, посетители смотрят;
 *   studio  — мольберт, художник с кистью, палитра, окно;
 *   desk    — чертёжный стол, лист, рука с пером.
 */

const W = 380;
const H = 96;

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
// Силуэтами: на такой высоте лицо не нарисовать, а силуэт читается сразу и не
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
  const ground = 82;
  const { w, h } = fit(aspect, 74, 168);
  // Холст левее середины: справа остаётся место людям, и композиция не делится
  // ровно пополам — так спокойнее для глаза
  const cx = 122;
  const x = cx - w / 2;
  const y = 3 + (74 - h) / 2;
  const b = 4; // рама

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
      <rect y={ground + 5} width={W} height="1" fill="#b5a893" opacity="0.6" />

      {/* Свет от светильника — конус на картину */}
      <path d={`M${cx} 2L${x - 16} ${ground}H${x + w + 16}z`} fill="url(#gal-light)" className="flux-art-lamp" />
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
        <rect x={x + w + b + 6} y={y + h - 11} width="15" height="10" rx="1" fill="#fff" />
        <rect x={x + w + b + 8} y={y + h - 9} width="11" height="1" fill="#9a8f7e" />
        <rect x={x + w + b + 8} y={y + h - 6} width="8" height="1" fill="#b3a897" />
      </g>

      {/* Посетители: пара смотрит вблизи, двое проходят дальше */}
      <Visitor x={238} ground={ground} h={54} tone="#3d3a35" delay={0} />
      <Visitor x={258} ground={ground} h={47} tone="#4a463f" delay={0.9} bag />
      <Visitor x={330} ground={ground} h={50} tone="#565149" delay={1.7} />
      <Visitor x={356} ground={ground} h={43} tone="#4f4a43" delay={2.4} />

      {/* Скамья */}
      <g fill="#8c7f6c">
        <rect x="282" y="73" width="32" height="3.4" rx="1.4" />
        <rect x="286" y="76" width="2.8" height="6" /><rect x="306" y="76" width="2.8" height="6" />
      </g>
    </svg>
  );
}

// ── Мастерская ───────────────────────────────────────────────────────────────
export function StudioStage({ canvas }: StageProps) {
  const { Draw, aspect } = canvas;
  const ground = 84;
  const { w, h } = fit(aspect, 72, 148);
  const cx = 138;
  const x = cx - w / 2;
  const y = 4 + (72 - h) / 2;

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
        <rect x="12" y="10" width="50" height="52" rx="1.5" fill="url(#st-win)" />
        <rect x="12" y="10" width="50" height="52" rx="1.5" fill="none" stroke="#8d8272" strokeWidth="2" />
        <line x1="37" y1="10" x2="37" y2="62" stroke="#8d8272" strokeWidth="1.6" />
        <line x1="12" y1="36" x2="62" y2="36" stroke="#8d8272" strokeWidth="1.6" />
        <path d="M62 12L124 66v-9L62 23z" fill="#fff8e6" opacity="0.35" className="flux-art-lamp" />
      </g>
      <rect y={ground} width={W} height={H - ground} fill="#b3a48d" />
      <rect y={ground - 1.5} width={W} height="2" fill="#9b8c76" />

      {/* Мольберт */}
      <g stroke="#7d6242" strokeWidth="3.2" strokeLinecap="round" fill="none">
        <line x1={cx - 24} y1={ground} x2={cx - 7} y2={y + 6} />
        <line x1={cx + 24} y1={ground} x2={cx + 7} y2={y + 6} />
        <line x1={cx} y1={y + h + 10} x2={cx} y2={ground + 2} />
        <line x1={cx - 18} y1={y + h + 4} x2={cx + 18} y2={y + h + 4} strokeWidth="4.4" />
      </g>

      {/* Холст на мольберте */}
      <g>
        <rect x={x - 2.5} y={y - 2.5} width={w + 5} height={h + 5} fill="#efe7d8" />
        <rect x={x - 2.5} y={y - 2.5} width={w + 5} height={h + 5} fill="none" stroke="#c3b49a" strokeWidth="1" />
        <g transform={`translate(${x} ${y}) scale(${w / (100 * aspect)} ${h / 100})`}>
          <Draw />
        </g>
      </g>

      {/* Художник справа, лицом к холсту */}
      <g>
        <ellipse cx="264" cy={ground + 1} rx="18" ry="3.4" fill="#000" opacity="0.16" />
        {/* Ноги и корпус */}
        <path d="M264 44c10 0 16 9 17 20 1 7 1 13 1 20h-36c0-7 0-13 1-20 1-11 7-20 17-20z" fill="#41423f" />
        {/* Голова со шляпой */}
        <circle cx="264" cy="37" r="8.5" fill="#c99a6a" />
        <path d="M252 32c1-7 7-10 12-10s11 3 12 10c-8-3-16-3-24 0z" fill="#6b5a3e" />
        <path d="M249 32h30v2.8h-30z" fill="#6b5a3e" />
        {/* Рука с кистью — тянется к холсту и возвращается */}
        <g className="flux-art-brush" style={{ transformOrigin: '258px 54px' }}>
          <path d="M258 54c-13 2-26 0-37-4" stroke="#41423f" strokeWidth="6.5" strokeLinecap="round" fill="none" />
          <path d="M221 50l-15-3" stroke="#8a6a3c" strokeWidth="2.6" strokeLinecap="round" />
          <circle cx="205" cy="47" r="2.2" fill="#2f6f7a" />
        </g>
        {/* Палитра во второй руке */}
        <g>
          <path d="M275 60c9-2 16 2 16 8s-7 8-16 6c-5-1-8-4-8-7s3-6 8-7z" fill="#b98f5c" />
          <circle cx="280" cy="63" r="1.7" fill="#c0392b" /><circle cx="285" cy="65" r="1.7" fill="#2f6f7a" />
          <circle cx="279" cy="68" r="1.7" fill="#e0a92c" />
        </g>
      </g>

      {/* Табурет и банки с кистями */}
      <g fill="#8a7250">
        <rect x="320" y="68" width="24" height="3.2" rx="1.3" />
        <rect x="323" y="71" width="2.6" height="16" /><rect x="338" y="71" width="2.6" height="16" />
      </g>
      <g>
        <rect x="352" y="72" width="13" height="15" rx="2" fill="#9aa7ad" />
        <g stroke="#7a5c34" strokeWidth="1.7" strokeLinecap="round">
          <line x1="355" y1="72" x2="353" y2="61" /><line x1="358" y1="72" x2="359" y2="59" />
          <line x1="361" y1="72" x2="364" y2="62" />
        </g>
      </g>
    </svg>
  );
}

// ── Чертёжный стол ───────────────────────────────────────────────────────────
export function DeskStage({ canvas }: StageProps) {
  const { Draw, aspect } = canvas;
  const { w, h } = fit(aspect, 80, 150);
  const cx = 170;
  const x = cx - w / 2;
  const y = 5;

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
        <line x1="0" y1="28" x2={W} y2="28" /><line x1="0" y1="64" x2={W} y2="64" />
      </g>

      {/* Лист с чертежом */}
      <g className="flux-art-hang" style={{ transformOrigin: `${cx}px ${y}px` }}>
        <rect x={x - 5} y={y - 4} width={w + 10} height={h + 9} fill="#e8dcc0" />
        <rect x={x - 5} y={y - 4} width={w + 10} height={h + 9} fill="none" stroke="#c0ab84" strokeWidth="0.8" />
        <g transform={`translate(${x} ${y}) scale(${w / (100 * aspect)} ${h / 100})`}>
          <Draw />
        </g>
      </g>

      {/* Рука с пером справа */}
      <g className="flux-art-pen" style={{ transformOrigin: '322px 60px' }}>
        {/* Предплечье из-за правого края и кисть руки */}
        <path d="M380 48c-17 0-34 4-46 13" stroke="#c99a6a" strokeWidth="12" strokeLinecap="round" fill="none" />
        <path d="M338 61c-8 2-15 5-19 9" stroke="#c99a6a" strokeWidth="9.5" strokeLinecap="round" fill="none" />
        {/* Перо: стержень к листу, опахало вверх */}
        <path d="M322 70l-15 9" stroke="#3f3222" strokeWidth="2.3" strokeLinecap="round" />
        <path d="M326 66c11-13 24-21 37-23-9 13-20 23-33 27z" fill="#f2e9d4" />
        <path d="M326 66c11-13 24-21 37-23" stroke="#c4b492" strokeWidth="0.9" fill="none" />
      </g>

      {/* Циркуль и линейка слева */}
      <g stroke="#8a7a55" strokeWidth="2.5" strokeLinecap="round" fill="none">
        <path d="M40 78l11-31M51 47l11 31" />
        <circle cx="51" cy="45" r="2.6" fill="#8a7a55" />
      </g>
      <rect x="12" y="32" width="56" height="5.5" rx="1" fill="#cbb98d" opacity="0.8" transform="rotate(-7 40 34)" />

      {/* Чернильница */}
      <g>
        <ellipse cx="92" cy="86" rx="11" ry="4.4" fill="#3a2f22" />
        <path d="M81 86v-9c0-3 5-6 11-6s11 3 11 6v9z" fill="#4a3d2c" />
        <ellipse cx="92" cy="77" rx="11" ry="3.8" fill="#241c12" />
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
