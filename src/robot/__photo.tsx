import React from 'react';
import { KittenMap, PartName, KITTEN_MAP } from './__photoMap';

/**
 * ЧЕРНОВИК: оживление нарисованного котёнка. В приложение не входит.
 *
 * Картинка не режется на файлы. Она вставляется целиком столько раз, сколько
 * у нас частей, и каждая копия закрывается своей маской — видно только «свой»
 * кусок. Части вложены друг в друга, как кости: повернули шею — уехала и
 * голова, и уши, и веки. Так рисунок остаётся единым файлом, а двигается по
 * суставам.
 *
 * Порядок слоёв — от дальнего к ближнему: хвост, корпус, уши, голова, лапы.
 * Каждая маска заходит под ту часть, что лежит поверх: когда голова
 * наклоняется, из-под неё выезжает не дыра, а шея, нарисованная в слое
 * корпуса. Отсюда же ограничение на углы — наклон головы держим в пределах
 * ±14°, иначе нахлёста не хватает.
 *
 * Чего так не сделать: поз, меняющих силуэт — прыжка, потягивания, батона.
 * Маска умеет двигать нарисованное, но не умеет дорисовывать. Для них нужны
 * отдельные рисунки.
 */

export type PhotoJoint =
  | 'bodyY' | 'lean' | 'breath'
  | 'headTilt' | 'headTurn'
  | 'earL' | 'earR'
  | 'tail' | 'tailTip'
  | 'pawL' | 'pawR'
  | 'blink';

export type PhotoPose = Record<PhotoJoint, number>;

export const PHOTO_NEUTRAL: PhotoPose = {
  bodyY: 0, lean: 0, breath: 1,
  headTilt: 0, headTurn: 0,
  earL: 0, earR: 0,
  tail: 0, tailTip: 0,
  pawL: 0, pawR: 0,
  blink: 0,
};

const p = (o: Partial<PhotoPose>): PhotoPose => ({ ...PHOTO_NEUTRAL, ...o });

/**
 * Позы. Углы намеренно небольшие: это оживший рисунок, а не кукла с шарнирами.
 * Милым его делает не размах, а то, что части опаздывают друг за другом.
 */
export const PHOTO_POSES = {
  sit: PHOTO_NEUTRAL,
  // Голову набок — главный вопросительный жест
  tilt: p({ headTilt: -12, headTurn: -1.5, earL: -6, earR: -3, tail: 14, tailTip: 12 }),
  tiltR: p({ headTilt: 12, headTurn: 1.5, earL: 3, earR: 6, tail: -14, tailTip: -12 }),
  // Смотрит на курсор / на панель
  lookL: p({ headTurn: -3.4, headTilt: -4, earL: -4, tail: 10, tailTip: 8 }),
  lookR: p({ headTurn: 3.4, headTilt: 4, earR: 4, tail: -10, tailTip: -8 }),
  // Переступил лапками. Лапа кренится от пола, а не машет: махать этой
  // оснастке нечем, за кистью не нарисовано предплечье
  pawStepL: p({ pawL: -11, headTilt: -5, tail: 16, tailTip: 14 }),
  pawStepR: p({ pawR: 11, headTilt: 5, tail: -16, tailTip: -14 }),
  // Топчется на месте — обе лапы врозь
  knead: p({ pawL: -9, pawR: 9, bodyY: 2, breath: 0.99, headTilt: -4, tail: 12, tailTip: 10 }),
  // Обрадовался: приподнялся, уши торчком, лапки врозь
  cheer: p({ pawL: -12, pawR: 12, bodyY: -4, breath: 1.04, headTilt: -3, earL: 6, earR: -6, tail: -18, tailTip: -14 }),
  // Уши прижаты, голова вниз
  shy: p({ headTilt: 10, earL: -16, earR: 16, bodyY: 2, breath: 0.98, tail: -14, tailTip: -18 }),
  sad: p({ headTilt: 8, earL: -13, earR: 13, bodyY: 3, breath: 0.97, tail: -20, tailTip: -16, blink: 0.45 }),
  // Насторожился: уши торчком, хвост вверх
  alert: p({ headTilt: -3, earL: 7, earR: -7, bodyY: -2, tail: -24, tailTip: -12 }),
  // Испугался
  startle: p({ bodyY: -5, breath: 1.04, earL: -20, earR: 20, headTilt: -5, tail: -30, tailTip: -16 }),
  // Дремлет
  doze: p({ bodyY: 4, breath: 0.97, headTilt: 9, earL: -8, earR: 8, tail: -26, tailTip: -22, blink: 0.85 }),
  sleep: p({ bodyY: 6, breath: 0.96, headTilt: 12, earL: -10, earR: 10, tail: -32, tailTip: -26, blink: 1 }),
  // Доволен собой
  proud: p({ bodyY: -2, headTilt: -2, earL: 5, earR: -5, tail: -44, tailTip: -8, blink: 0.3 }),
  blinkClosed: p({ blink: 1 }),
} satisfies Record<string, PhotoPose>;

export type PhotoPoseName = keyof typeof PHOTO_POSES;

export type PhotoRefs = Partial<Record<
  'root' | 'lift' | 'art' | 'body' | 'neck' | 'headTurn' |
  'earL' | 'earR' | 'tail' | 'tailTip' | 'pawL' | 'pawR' | 'lids' | 'shadow',
  SVGGElement | null
>>;

const rot = (a: number, [cx, cy]: [number, number]) => `rotate(${a.toFixed(2)} ${cx} ${cy})`;

/**
 * Перенос позы в разметку. Пишем transform прямо в узлы: за кадр выходит
 * десяток записей и ни одной перерисовки React.
 */
export function applyPhoto(
  refs: PhotoRefs,
  j: PhotoPose,
  x: number,
  floor: number,
  scale = 1,
  flip = 1,
  map: KittenMap = KITTEN_MAP,
) {
  const set = (el: SVGGElement | null | undefined, tr: string) => { if (el) el.setAttribute('transform', tr); };
  const P = map.parts;

  set(refs.root, `translate(${x.toFixed(2)} ${floor.toFixed(2)}) scale(${(scale * flip).toFixed(4)} ${scale.toFixed(4)})`);
  set(refs.lift, `translate(0 ${j.bodyY.toFixed(2)})`);

  // Корпус: наклон и дыхание вокруг точки посадки
  const seat = map.seat;
  set(refs.body,
    `${rot(j.lean, seat)} translate(${seat[0]} ${seat[1]}) ` +
    `scale(${(2 - j.breath).toFixed(4)} ${j.breath.toFixed(4)}) translate(${-seat[0]} ${-seat[1]})`);

  // Поворот головы для плоского рисунка — сдвиг вбок: так читается разворот.
  // Значение в единицах сцены, поэтому переводим в пиксели картинки.
  set(refs.neck, rot(j.headTilt, P.head.pivot));
  set(refs.headTurn, `translate(${(j.headTurn * map.unit).toFixed(2)} 0)`);

  set(refs.earL, rot(j.earL, P.earL.pivot));
  set(refs.earR, rot(j.earR, P.earR.pivot));
  set(refs.tail, rot(j.tail, P.tail.pivot));
  if (P.tailTip) set(refs.tailTip, rot(j.tailTip, P.tailTip.pivot));
  set(refs.pawL, rot(j.pawL, P.pawL.pivot));
  set(refs.pawR, rot(j.pawR, P.pawR.pivot));

  // Веки: закрываются сверху вниз. Отрицательное значение — глаза распахнуты.
  if (refs.lids) {
    const k = Math.max(0, j.blink);
    refs.lids.setAttribute('opacity', k > 0.001 ? '1' : '0');
    refs.lids.setAttribute('data-blink', k.toFixed(3));
    for (const el of Array.from(refs.lids.children) as SVGGElement[]) {
      const cy = Number(el.getAttribute('data-top'));
      el.setAttribute('transform', `translate(0 ${cy}) scale(1 ${Math.max(0.001, k).toFixed(4)}) translate(0 ${-cy})`);
    }
  }

  // Тень поджимается, когда котёнок отрывается от пола
  if (refs.shadow) {
    const k = Math.max(0.5, Math.min(1.1, 1 + j.bodyY / 40));
    refs.shadow.setAttribute('transform', `scale(${k.toFixed(3)} 1)`);
    refs.shadow.setAttribute('opacity', (0.32 * k).toFixed(3));
  }
}

// ── Разметка ───────────────────────────────────────────────────────────────

/** Копия картинки, обрезанная маской своей части. */
function Part({ name, map, id }: { name: PartName; map: KittenMap; id: string }) {
  const part = map.parts[name];
  if (!part) return null;
  return <image href={map.src} x={0} y={0} width={map.w} height={map.h} mask={`url(#${id}-m-${name})`} />;
}

export default function PhotoKitten({ refs, id = 'pk', map = KITTEN_MAP }:
  { refs: PhotoRefs; id?: string; map?: KittenMap }) {
  const set = (k: keyof PhotoRefs) => (el: SVGGElement | null) => { refs[k] = el; };
  const names = Object.keys(map.parts) as PartName[];
  const soft = map.feather ?? 0;

  return (
    <g>
      <defs>
        {soft > 0 && (
          <filter id={`${id}-soft`} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation={soft} />
          </filter>
        )}
        {/* Вырезы частей. Маска, а не clipPath: у маски край можно размыть, и
            стык двух частей перестаёт читаться разрезом. Размытие считается
            один раз — маска сама по себе не движется, движется группа поверх */}
        {names.map((n) => (
          <mask key={n} id={`${id}-m-${n}`} maskUnits="userSpaceOnUse"
                x={0} y={0} width={map.w} height={map.h}>
            <path d={map.parts[n]!.clip} fill="#fff" filter={soft > 0 ? `url(#${id}-soft)` : undefined} />
          </mask>
        ))}
        <radialGradient id={`${id}-floor`}>
          <stop offset="0" stopColor="rgba(15,23,42,.34)" />
          <stop offset="0.6" stopColor="rgba(15,23,42,.16)" />
          <stop offset="1" stopColor="rgba(15,23,42,0)" />
        </radialGradient>
      </defs>

      <g ref={set('root')}>
        {/* Тень на полу — градиентом, а не размытием: размытие пришлось бы
            считать каждый кадр */}
        <g ref={set('shadow')} opacity="0.32">
          <ellipse cx="0" cy="0" rx={map.shadowR} ry={map.shadowR * 0.3} fill={`url(#${id}-floor)`} />
        </g>

        <g ref={set('lift')}>
          {/* В пространство картинки: точка опоры встаёт в начало координат */}
          <g transform={`scale(${(1 / map.unit).toFixed(6)}) translate(${-map.anchor[0]} ${-map.anchor[1]})`}>
            <g>

              <g ref={set('tail')}>
                <Part name="tail" map={map} id={id} />
                {map.parts.tailTip && (
                  <g ref={set('tailTip')}><Part name="tailTip" map={map} id={id} /></g>
                )}
              </g>

              <g ref={set('body')}>
                <Part name="body" map={map} id={id} />

                <g ref={set('neck')}>
                  <g ref={set('headTurn')}>
                    <g ref={set('earL')}><Part name="earL" map={map} id={id} /></g>
                    <g ref={set('earR')}><Part name="earR" map={map} id={id} /></g>
                    <Part name="head" map={map} id={id} />

                    {/* Веки. Заслонка цвета шёрстки опускается сверху, а чуть
                        ниже неё едет тёмная ресничная линия — без неё закрытый
                        глаз читается не веком, а залепленным кружком */}
                    <g ref={set('lids')} opacity="0" mask={`url(#${id}-m-head)`}>
                      {(map.eyes ?? []).map((e, i) => (
                        <g key={i} data-top={(e.cy - e.ry * 1.04).toFixed(2)}>
                          <ellipse cx={e.cx} cy={e.cy + e.ry * 0.09} rx={e.rx * 1.06} ry={e.ry * 1.04} fill={map.lashColor} />
                          <ellipse cx={e.cx} cy={e.cy} rx={e.rx * 1.06} ry={e.ry * 1.04} fill={map.lidColor} />
                        </g>
                      ))}
                    </g>
                  </g>
                </g>

                {/* Лапы поверх головы: поднятая лапа должна оказаться перед мордочкой */}
                <g ref={set('pawR')}><Part name="pawR" map={map} id={id} /></g>
                <g ref={set('pawL')}><Part name="pawL" map={map} id={id} /></g>
              </g>
            </g>
          </g>
        </g>
      </g>
    </g>
  );
}
