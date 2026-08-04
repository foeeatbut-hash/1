import { Pose, Joint } from './poses';
import { PIVOTS } from './rig';
import { Snapshot, PropState } from './player';
import { PropId } from './props';

/**
 * Перенос снимка в DOM.
 *
 * Единственное место, где мы трогаем разметку во время движения: пишем
 * transform прямо в узлы по ссылкам, без участия React. За кадр получается
 * около полутора десятков записей — и ни одного пересчёта раскладки, потому
 * что меняются только transform и opacity.
 */

const HIP_Y = PIVOTS.hipL[1];
const NECK_Y = PIVOTS.headTilt[1];

const rot = (a: number, [cx, cy]: [number, number]) => `rotate(${a.toFixed(2)} ${cx} ${cy})`;

export function poseSnapshot(joints: Pose, x: number, scale = 1): Snapshot {
  return { joints, x, flip: 1, scale, shake: 0, props: {} };
}

export interface ApplyTargets {
  refs: Record<string, SVGGElement | null | undefined>;
  props?: Partial<Record<PropId, SVGGElement | null>>;
  floor: number;
  /** Базовый масштаб сцены: робот нарисован в 86 единиц роста. */
  scale?: number;
}

export function applySnapshot(t: ApplyTargets, s: Snapshot) {
  const r = t.refs;
  const j = s.joints;
  const set = (el: SVGGElement | null | undefined, tr: string) => { if (el) el.setAttribute('transform', tr); };

  const base = t.scale ?? 1;
  const sx = s.scale * base * s.flip;
  set(r.root, `translate(${(s.x + s.shake).toFixed(2)} ${t.floor}) scale(${sx.toFixed(3)} ${(s.scale * base).toFixed(3)})`);

  // Корпус: подъём, наклон и сжатие — всё вокруг таза
  set(r.body,
    `translate(0 ${j.bodyY.toFixed(2)}) ${rot(j.lean, [0, HIP_Y])} ` +
    `translate(0 ${HIP_Y}) scale(1 ${j.squash.toFixed(3)}) translate(0 ${-HIP_Y})`);

  set(r.headTilt, rot(j.headTilt, [0, NECK_Y]));
  set(r.headTurn, `translate(${j.headTurn.toFixed(2)} 0)`);
  set(r.antenna, rot(j.antenna, PIVOTS.antenna));

  const arms: [string, Joint][] = [
    ['shoulderL', 'shoulderL'], ['elbowL', 'elbowL'],
    ['shoulderR', 'shoulderR'], ['elbowR', 'elbowR'],
    ['hipL', 'hipL'], ['kneeL', 'kneeL'], ['hipR', 'hipR'], ['kneeR', 'kneeR'],
  ];
  for (const [key, joint] of arms) set(r[key], rot(j[joint], PIVOTS[joint]));

  // Тень сжимается, когда робот в воздухе
  if (r.shadow) {
    const k = Math.max(0.42, Math.min(1.15, 1 + j.bodyY / 34));
    r.shadow.setAttribute('transform', `scale(${k.toFixed(3)} 1)`);
    r.shadow.setAttribute('opacity', String(Math.max(0.35, k)));
  }

  if (t.props) {
    for (const [id, el] of Object.entries(t.props)) {
      if (!el) continue;
      const st = s.props[id as PropId] as PropState | undefined;
      if (!st) { el.setAttribute('opacity', '0'); continue; }
      el.setAttribute('transform',
        `translate(${st.x.toFixed(2)} ${st.y.toFixed(2)}) rotate(${st.rot.toFixed(2)}) scale(${(st.s * base).toFixed(3)})`);
      el.setAttribute('opacity', st.op.toFixed(3));
    }
  }
}

/** Взгляд: зрачки и лёгкий поворот головы к точке в координатах сцены. */
export function applyGaze(refs: Record<string, SVGGElement | null | undefined>, dx: number, dy: number) {
  const px = Math.max(-2.6, Math.min(2.6, dx / 26));
  const py = Math.max(-1.8, Math.min(1.8, dy / 26));
  if (refs.pupils) refs.pupils.setAttribute('transform', `translate(${px.toFixed(2)} ${py.toFixed(2)})`);
}
