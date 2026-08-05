import React from 'react';

/**
 * Реквизит Флакси: мяч, ворота, кольцо, диван, телевизор, кружка и прочее.
 *
 * Каждый предмет нарисован вокруг собственного начала координат: у напольных
 * это точка касания пола, у подвесных — точка крепления. Проигрыватель двигает
 * их одним transform, поэтому внутри — только форма.
 *
 * Предметы существуют только во время своей сценки: сцена перечисляет нужные
 * и после неё они гасятся.
 */

export type PropId =
  | 'ball' | 'goal' | 'hoop' | 'mug' | 'sofa' | 'tv' | 'blueprint'
  | 'broom' | 'plant' | 'can' | 'cat' | 'balloon' | 'plane' | 'bell' | 'book';

const M = {
  wood: 'oklch(0.58 0.06 60)',
  metal: 'oklch(0.58 0.03 163)',
  dark: 'oklch(0.35 0.02 163)',
  green: 'oklch(0.62 0.12 163)',
  paper: 'oklch(0.94 0.02 200)',
  warm: 'oklch(0.78 0.13 60)',
};

export const PROP_SHAPES: Record<PropId, React.ReactNode> = {
  // Мяч: катится и летит, поэтому центр — в центре мяча, а не на полу
  ball: (
    <>
      <circle cx="0" cy="0" r="6" fill="white" stroke={M.dark} strokeWidth="0.8" />
      <path d="M0,-6 l3.5,2.6 l-1.4,4.2 h-4.2 l-1.4,-4.2 z" fill={M.dark} opacity="0.85" />
    </>
  ),

  // Ворота: рама и сетка
  goal: (
    <>
      <path d="M-20,0 v-24 h40 v24" fill="none" stroke={M.metal} strokeWidth="2.4" strokeLinejoin="round" />
      <g stroke={M.metal} strokeWidth="0.7" opacity="0.55">
        <path d="M-13,-24 v24 M-6,-24 v24 M1,-24 v24 M8,-24 v24 M15,-24 v24" />
        <path d="M-20,-18 h40 M-20,-12 h40 M-20,-6 h40" />
      </g>
    </>
  ),

  // Кольцо: щит и обод, крепится сверху
  hoop: (
    <>
      <rect x="-11" y="-2" width="22" height="16" rx="2" fill={M.paper} opacity="0.9" stroke={M.dark} strokeWidth="0.8" />
      <rect x="-5" y="3" width="10" height="7" rx="1" fill="none" stroke={M.dark} strokeWidth="0.8" />
      <ellipse cx="0" cy="14" rx="8" ry="2.2" fill="none" stroke="oklch(0.68 0.16 40)" strokeWidth="2" />
      <path d="M-7,15 l2,7 M-3,16 l1,7 M3,16 l-1,7 M7,15 l-2,7" stroke={M.paper} strokeWidth="0.8" opacity="0.9" fill="none" />
    </>
  ),

  // Кружка с паром
  mug: (
    <>
      <path d="M-6,-11 h11 a1.5,1.5 0 0 1 1.5,1.5 v8 a2.5,2.5 0 0 1 -2.5,2.5 h-8 a2.5,2.5 0 0 1 -2.5,-2.5 v-8 a1.5,1.5 0 0 1 1.5,-1.5 z" fill="white" stroke={M.dark} strokeWidth="0.8" />
      <path d="M6.5,-8 a3.5,3.5 0 0 1 0,6" fill="none" stroke={M.dark} strokeWidth="1.2" />
      <path d="M-4,-9.6 h9 v2 h-9 z" fill="oklch(0.45 0.07 60)" />
      <path d="M-2,-13 q2,-3 0,-5" stroke={M.metal} strokeWidth="1.1" fill="none" opacity="0.55" className="flux-flx-steam1" />
      <path d="M2,-13 q2,-3 0,-5" stroke={M.metal} strokeWidth="1.1" fill="none" opacity="0.45" className="flux-flx-steam2" />
    </>
  ),

  // Диван
  sofa: (
    <>
      <rect x="-23" y="-14" width="46" height="10" rx="4" fill={M.green} />
      <rect x="-23" y="-22" width="8" height="12" rx="4" fill={M.green} opacity="0.85" />
      <rect x="15" y="-22" width="8" height="12" rx="4" fill={M.green} opacity="0.85" />
      <rect x="-14" y="-20" width="28" height="8" rx="4" fill={M.green} opacity="0.7" />
      <rect x="-19" y="-4" width="4" height="4" rx="1.5" fill={M.wood} />
      <rect x="15" y="-4" width="4" height="4" rx="1.5" fill={M.wood} />
    </>
  ),

  // Телевизор на подставке
  tv: (
    <>
      <rect x="-4" y="-6" width="8" height="6" rx="1.5" fill={M.dark} />
      <rect x="-9" y="-1.5" width="18" height="2" rx="1" fill={M.dark} />
      <rect x="-17" y="-28" width="34" height="23" rx="3" fill={M.dark} />
      <rect x="-14" y="-25" width="28" height="17" rx="1.5" fill="oklch(0.62 0.09 210)" className="flux-flx-tv" />
      <circle cx="0" cy="-6.6" r="0.8" fill={M.green} />
    </>
  ),

  // Чертёж-свиток
  blueprint: (
    <>
      <rect x="-13" y="-19" width="26" height="19" rx="1.5" fill="oklch(0.78 0.06 230)" stroke={M.dark} strokeWidth="0.7" />
      <g stroke="white" strokeWidth="0.7" opacity="0.8" fill="none">
        <rect x="-9" y="-15.5" width="10" height="7" />
        <path d="M3,-15.5 h6 M3,-12 h6 M3,-8.5 h4 M-9,-5 h18" />
      </g>
    </>
  ),

  // Метла
  broom: (
    <>
      <rect x="-0.9" y="-26" width="1.8" height="21" rx="0.9" fill={M.wood} />
      <path d="M-5,-6 h10 l2,6 h-14 z" fill={M.warm} />
      <path d="M-4,-1 v1 M-2,-1 v1 M0,-1 v1 M2,-1 v1 M4,-1 v1" stroke={M.wood} strokeWidth="0.6" />
    </>
  ),

  // Цветок в горшке
  plant: (
    <>
      <path d="M-6,-8 h12 l-1.5,8 h-9 z" fill="oklch(0.62 0.10 40)" />
      <rect x="-7" y="-10" width="14" height="3" rx="1.2" fill="oklch(0.66 0.11 40)" />
      <path d="M0,-9 v-8" stroke={M.green} strokeWidth="1.4" fill="none" />
      <ellipse cx="-4" cy="-15" rx="4.2" ry="2.6" fill={M.green} transform="rotate(-24 -4 -15)" />
      <ellipse cx="4" cy="-17" rx="4.2" ry="2.6" fill={M.green} transform="rotate(24 4 -17)" />
      <circle cx="0" cy="-20.5" r="2.6" fill="oklch(0.80 0.14 20)" className="flux-flx-bloom" />
    </>
  ),

  // Лейка
  can: (
    <>
      <rect x="-6" y="-9" width="12" height="9" rx="2.5" fill={M.metal} />
      <path d="M6,-7 l7,-3 l0.6,1.6 l-6.6,3 z" fill={M.metal} />
      <path d="M-5,-9 q5,-6 10,0" fill="none" stroke={M.metal} strokeWidth="1.4" />
      <g className="flux-flx-drops" opacity="0">
        <circle cx="13" cy="-6" r="0.9" fill="oklch(0.78 0.08 230)" />
        <circle cx="15" cy="-3" r="0.8" fill="oklch(0.78 0.08 230)" />
      </g>
    </>
  ),

  // Кот
  cat: (
    <>
      <ellipse cx="0" cy="-4.5" rx="8" ry="4.5" fill="oklch(0.52 0.03 60)" />
      <circle cx="-7" cy="-9" r="4.2" fill="oklch(0.52 0.03 60)" />
      <path d="M-10,-12 l1,-3.4 l2.6,2.2 z M-4.4,-12.6 l0.6,-3.4 l2.4,2.6 z" fill="oklch(0.52 0.03 60)" />
      <circle cx="-8.4" cy="-9.4" r="0.9" fill="oklch(0.88 0.12 120)" />
      <circle cx="-5.6" cy="-9.4" r="0.9" fill="oklch(0.88 0.12 120)" />
      <path d="M7,-6 q6,-2 4,-8" fill="none" stroke="oklch(0.52 0.03 60)" strokeWidth="2.4" strokeLinecap="round" className="flux-flx-tail" />
    </>
  ),

  // Шарик
  balloon: (
    <>
      <ellipse cx="0" cy="-7" rx="6.5" ry="8" fill="oklch(0.72 0.15 20)" opacity="0.9" />
      <path d="M0,1 q2,4 -1,8" stroke={M.dark} strokeWidth="0.7" fill="none" opacity="0.6" />
      <ellipse cx="-2.2" cy="-9.5" rx="1.8" ry="2.4" fill="white" opacity="0.35" />
    </>
  ),

  // Бумажный самолётик
  plane: (
    <>
      <path d="M-9,0 l18,-5 l-18,-5 l4,5 z" fill={M.paper} stroke={M.dark} strokeWidth="0.6" strokeLinejoin="round" />
      <path d="M-5,0 l14,-5" stroke={M.dark} strokeWidth="0.5" opacity="0.5" />
    </>
  ),

  // Колокольчик
  bell: (
    <>
      <path d="M-6,0 q0,-9 6,-9 q6,0 6,9 z" fill={M.warm} />
      <rect x="-7" y="-1" width="14" height="2" rx="1" fill={M.warm} />
      <circle cx="0" cy="2.4" r="1.6" fill={M.warm} />
      <circle cx="0" cy="-10" r="1.4" fill={M.metal} />
    </>
  ),

  // Книжка-справочник
  book: (
    <>
      <path d="M-10,-2 h9 v-12 h-9 z" fill={M.paper} stroke={M.dark} strokeWidth="0.6" />
      <path d="M1,-2 h9 v-12 h-9 z" fill={M.paper} stroke={M.dark} strokeWidth="0.6" />
      <rect x="-1" y="-14.5" width="2" height="13" rx="0.8" fill={M.green} />
      <g stroke={M.dark} strokeWidth="0.5" opacity="0.4">
        <path d="M-8,-11 h5 M-8,-9 h5 M-8,-7 h5 M3,-11 h5 M3,-9 h5 M3,-7 h5" />
      </g>
    </>
  ),
};

export const ALL_PROPS = Object.keys(PROP_SHAPES) as PropId[];

/** Крупная обстановка стоит за роботом, всё, что он берёт в руки, — перед ним. */
export const BACK_PROPS: PropId[] = ['goal', 'hoop', 'sofa', 'tv', 'plant'];
export const FRONT_PROPS: PropId[] = ALL_PROPS.filter((p) => !BACK_PROPS.includes(p));
