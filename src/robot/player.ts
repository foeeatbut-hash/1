import { POSES, PoseName, Pose, Joint, NEUTRAL, FaceName } from './poses';
import { PropId } from './props';

/**
 * Проигрыватель сценок.
 *
 * Сценка — это список кадров: время, поза, выражение лица, положение робота и
 * состояние предметов. Проигрыватель раскладывает кадры по каналам (один канал
 * на сустав и на каждое свойство каждого предмета), а дальше на каждом кадре
 * экрана считает промежуточные значения и отдаёт их одним снимком.
 *
 * Почему не CSS-анимации на каждую сценку: предметам нужны свои траектории и
 * случайные ветвления (гол или штанга), а кадров у сценки полтора десятка —
 * набор keyframes на каждую занял бы больше места, чем весь этот файл.
 *
 * Стоимость: пока сценка не идёт, requestAnimationFrame не запущен вовсе.
 */

export type ChestKind = 'idle' | 'work' | 'wait' | 'ok' | 'love';

export interface PropState { x: number; y: number; rot: number; s: number; op: number }
export const PROP_HIDDEN: PropState = { x: 0, y: 0, rot: 0, s: 1, op: 0 };

export type EaseName = 'linear' | 'out' | 'in' | 'inOut' | 'back' | 'step';

const EASE: Record<EaseName, (u: number) => number> = {
  linear: (u) => u,
  out: (u) => 1 - Math.pow(1 - u, 3),
  in: (u) => u * u * u,
  inOut: (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2),
  back: (u) => 1 + 2.2 * Math.pow(u - 1, 3) + 1.2 * Math.pow(u - 1, 2),
  step: () => 1,
};

export interface Frame {
  /** Время от начала сценки, мс */
  t: number;
  pose?: PoseName;
  face?: FaceName;
  chest?: ChestKind;
  /** Положение робота вдоль полки, px */
  x?: number;
  /** Развернуть робота: 1 — лицом к нам, −1 — зеркально */
  flip?: 1 | -1;
  scale?: number;
  ease?: EaseName;
  props?: Partial<Record<PropId, Partial<PropState>>>;
  /** Высота дуги полёта предмета до следующего его кадра, px */
  arc?: Partial<Record<PropId, number>>;
  /** Реплика в пузыре */
  say?: string;
  /**
   * Медленный переход: значение едет весь промежуток до этого кадра.
   * По умолчанию значение стоит на месте и трогается только под конец —
   * иначе кружка, поставленная на пол в начале сценки, всю сценку ползёт
   * к следующему своему кадру, а мяч уезжает из-под ног.
   */
  slow?: boolean;
  /** Встряска сцены (удар, приземление), 0…3 */
  shake?: number;
}

export interface Scene {
  id: string;
  /** Общая длительность, мс */
  dur: number;
  props?: PropId[];
  /** Вес при случайном выборе; больше — чаще */
  weight?: number;
  /** Годится ли для «спокойного режима» */
  calm?: boolean;
  /** Часы, в которые сценка уместна: [от, до) */
  hours?: [number, number];
  frames: Frame[];
}

export interface Snapshot {
  joints: Pose;
  x: number;
  flip: number;
  scale: number;
  shake: number;
  props: Partial<Record<PropId, PropState>>;
}

interface Key { t: number; v: number; ease: EaseName; arc?: number; slow?: boolean }

/** Промежуток, после которого значение считается «стоящим», и длина доводки. */
const HOLD_GAP = 700;
const HOLD_MOVE = 520;

type Channel = Joint | 'x' | 'flip' | 'scale';

const PROP_FIELDS: (keyof PropState)[] = ['x', 'y', 'rot', 's', 'op'];

export interface PlayerCallbacks {
  apply: (s: Snapshot) => void;
  face?: (f: FaceName) => void;
  chest?: (c: ChestKind) => void;
  say?: (text: string) => void;
  end?: () => void;
}

export class Player {
  private raf = 0;
  private startedAt = 0;
  private scene: Scene | null = null;
  private tracks = new Map<string, Key[]>();
  private events: { t: number; face?: FaceName; chest?: ChestKind; say?: string }[] = [];
  private nextEvent = 0;
  private shakeAt = -1;
  private shakeAmp = 0;
  private base: Snapshot;

  constructor(private cb: PlayerCallbacks, base?: Partial<Snapshot>) {
    this.base = {
      joints: { ...NEUTRAL }, x: 0, flip: 1, scale: 1, shake: 0, props: {},
      ...base,
    } as Snapshot;
  }

  get busy() { return !!this.scene; }
  get sceneId() { return this.scene?.id || ''; }

  /** Поза покоя, из которой начинается и в которую возвращается любая сценка. */
  setBase(joints: Pose, x: number) {
    this.base.joints = { ...joints };
    this.base.x = x;
  }

  play(scene: Scene) {
    this.stop(false);
    this.scene = scene;
    this.buildTracks(scene);
    this.startedAt = performance.now();
    this.nextEvent = 0;
    this.loop();
  }

  /** Мягкая остановка: короткий возврат в покой и погашение предметов. */
  stop(soft = true) {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    const had = this.scene;
    this.scene = null;
    this.tracks.clear();
    this.events = [];
    if (!had) return;
    if (soft) {
      const back: Scene = {
        id: 'return', dur: 240,
        frames: [
          { t: 0 },
          { t: 240, pose: undefined, ease: 'out' },
        ],
      };
      // Возврат строим вручную: цели — база, предметы гаснут
      this.scene = back;
      this.tracks.clear();
      const now = this.lastSnapshot;
      for (const j of Object.keys(this.base.joints) as Joint[]) {
        this.tracks.set(j, [
          { t: 0, v: now ? now.joints[j] : this.base.joints[j], ease: 'out' },
          { t: 240, v: this.base.joints[j], ease: 'out' },
        ]);
      }
      this.tracks.set('x', [
        { t: 0, v: now ? now.x : this.base.x, ease: 'out' },
        { t: 240, v: this.base.x, ease: 'out' },
      ]);
      this.tracks.set('flip', [{ t: 0, v: 1, ease: 'step' }]);
      this.tracks.set('scale', [{ t: 0, v: now ? now.scale : 1, ease: 'out' }, { t: 240, v: 1, ease: 'out' }]);
      for (const [key, keys] of Object.entries(this.propKeysSnapshot(now))) {
        this.tracks.set(key, keys);
      }
      this.events = [];
      this.nextEvent = 0;
      this.startedAt = performance.now();
      this.loop();
    } else {
      this.lastSnapshot = null;
    }
  }

  private lastSnapshot: Snapshot | null = null;

  /** Гасим то, что осталось на сцене от прерванной сценки. */
  private propKeysSnapshot(now: Snapshot | null): Record<string, Key[]> {
    const out: Record<string, Key[]> = {};
    if (!now) return out;
    for (const [id, st] of Object.entries(now.props)) {
      if (!st || st.op <= 0.01) continue;
      for (const f of PROP_FIELDS) {
        const from = (st as any)[f] as number;
        const to = f === 'op' ? 0 : from;
        out[`p:${id}:${f}`] = [{ t: 0, v: from, ease: 'out' }, { t: 240, v: to, ease: 'out' }];
      }
    }
    return out;
  }

  private buildTracks(scene: Scene) {
    this.tracks.clear();
    const put = (ch: string, k: Key) => {
      const arr = this.tracks.get(ch);
      if (arr) arr.push(k); else this.tracks.set(ch, [k]);
    };

    // Первый кадр всегда стартует из базовой позы
    for (const j of Object.keys(this.base.joints) as Joint[]) {
      put(j, { t: 0, v: this.base.joints[j], ease: 'out' });
    }
    put('x', { t: 0, v: this.base.x, ease: 'out' });
    put('flip', { t: 0, v: 1, ease: 'step' });
    put('scale', { t: 0, v: 1, ease: 'out' });
    for (const id of scene.props || []) {
      for (const f of PROP_FIELDS) {
        put(`p:${id}:${f}`, { t: 0, v: f === 'op' ? 0 : f === 's' ? 1 : 0, ease: 'out' });
      }
    }

    const pending: Partial<Record<PropId, number>> = {};
    for (const fr of scene.frames) {
      const ease = fr.ease || 'inOut';
      const slow = !!fr.slow;
      if (fr.pose) {
        const pose = POSES[fr.pose] as Pose;
        for (const j of Object.keys(pose) as Joint[]) put(j, { t: fr.t, v: pose[j], ease, slow });
      }
      if (fr.x !== undefined) put('x', { t: fr.t, v: fr.x, ease, slow });
      if (fr.flip !== undefined) put('flip', { t: fr.t, v: fr.flip, ease: 'step' });
      if (fr.scale !== undefined) put('scale', { t: fr.t, v: fr.scale, ease, slow });
      if (fr.props) {
        for (const [id, st] of Object.entries(fr.props)) {
          for (const f of PROP_FIELDS) {
            const v = (st as any)[f];
            if (v === undefined) continue;
            const key = `p:${id}:${f}`;
            const arc = f === 'y' ? pending[id as PropId] : undefined;
            put(key, { t: fr.t, v, ease, arc, slow });
            if (f === 'y' && arc !== undefined) delete pending[id as PropId];
          }
        }
      }
      // Дуга задаётся на кадре вылета и действует до следующего кадра предмета
      if (fr.arc) {
        for (const [id, h] of Object.entries(fr.arc)) {
          const key = `p:${id}:y`;
          const arr = this.tracks.get(key);
          if (arr && arr.length) arr[arr.length - 1].arc = h as number;
          else pending[id as PropId] = h as number;
        }
      }
      if (fr.face || fr.chest || fr.say !== undefined) {
        this.events.push({ t: fr.t, face: fr.face, chest: fr.chest, say: fr.say });
      }
      if (fr.shake) {
        this.events.push({ t: fr.t, face: undefined });
        // тряска обрабатывается отдельно — запомним на своей дорожке
        put('shake', { t: fr.t, v: fr.shake, ease: 'step' });
      }
    }
    this.events.sort((a, b) => a.t - b.t);
    for (const [ch, arr] of this.tracks) {
      arr.sort((a, b) => a.t - b.t);
      this.tracks.set(ch, addHolds(arr));
    }
  }

  private sample(ch: string, t: number, fallback: number): number {
    const keys = this.tracks.get(ch);
    if (!keys || !keys.length) return fallback;
    if (t <= keys[0].t) return keys[0].v;
    for (let i = keys.length - 1; i >= 0; i--) {
      if (t >= keys[i].t) {
        const a = keys[i];
        const b = keys[i + 1];
        if (!b) return a.v;
        const u = (t - a.t) / Math.max(1, b.t - a.t);
        const e = EASE[b.ease] || EASE.inOut;
        let v = a.v + (b.v - a.v) * e(Math.min(1, Math.max(0, u)));
        if (a.arc) v -= a.arc * Math.sin(Math.PI * Math.min(1, Math.max(0, u)));
        return v;
      }
    }
    return keys[0].v;
  }

  private loop = () => {
    const scene = this.scene;
    if (!scene) return;
    const t = performance.now() - this.startedAt;

    while (this.nextEvent < this.events.length && this.events[this.nextEvent].t <= t) {
      const e = this.events[this.nextEvent++];
      if (e.face && this.cb.face) this.cb.face(e.face);
      if (e.chest && this.cb.chest) this.cb.chest(e.chest);
      if (e.say !== undefined && this.cb.say) this.cb.say(e.say);
    }

    const joints = {} as Pose;
    for (const j of Object.keys(this.base.joints) as Joint[]) {
      joints[j] = this.sample(j, t, this.base.joints[j]);
    }
    const props: Partial<Record<PropId, PropState>> = {};
    for (const id of scene.props || []) {
      props[id] = {
        x: this.sample(`p:${id}:x`, t, 0),
        y: this.sample(`p:${id}:y`, t, 0),
        rot: this.sample(`p:${id}:rot`, t, 0),
        s: this.sample(`p:${id}:s`, t, 1),
        op: this.sample(`p:${id}:op`, t, 0),
      };
    }
    // Тряска: короткий затухающий импульс после кадра с shake
    const shakeKeys = this.tracks.get('shake');
    let shake = 0;
    if (shakeKeys) {
      for (let i = shakeKeys.length - 1; i >= 0; i--) {
        const dt = t - shakeKeys[i].t;
        if (dt >= 0 && dt < 260) {
          shake = shakeKeys[i].v * Math.exp(-dt / 90) * Math.sin(dt / 14);
          break;
        }
      }
    }

    const snap: Snapshot = {
      joints,
      x: this.sample('x', t, this.base.x),
      flip: this.sample('flip', t, 1) < 0 ? -1 : 1,
      scale: this.sample('scale', t, 1),
      shake,
      props,
    };
    this.lastSnapshot = snap;
    this.cb.apply(snap);

    if (t >= scene.dur) {
      const wasReturn = scene.id === 'return';
      this.scene = null;
      this.raf = 0;
      if (!wasReturn && this.cb.end) this.cb.end();
      return;
    }
    this.raf = requestAnimationFrame(this.loop);
  };
}

/**
 * Достановка «удерживающих» ключей.
 *
 * Промежуточные значения считаются между соседними ключами, поэтому кадр,
 * поставленный в начале сценки, тянул бы предмет всю сценку до следующего
 * своего кадра. Здесь длинные промежутки превращаются в «стоит, потом едет»:
 * значение держится и трогается только за HOLD_MOVE до цели. Кадры, помеченные
 * slow, и полёты по дуге не трогаем — там движение задумано долгим.
 */
function addHolds(keys: Key[]): Key[] {
  const out: Key[] = [];
  for (let i = 0; i < keys.length; i++) {
    const prev = keys[i - 1];
    const cur = keys[i];
    if (prev && !cur.slow && !prev.arc && cur.t - prev.t > HOLD_GAP && cur.v !== prev.v) {
      out.push({ t: cur.t - HOLD_MOVE, v: prev.v, ease: prev.ease });
    }
    out.push(cur);
  }
  return out;
}

/** Случайная сценка с учётом весов, времени суток и «спокойного режима». */
export function pickScene(list: Scene[], opts: { calmOnly: boolean; hour: number; avoid: string[] }): Scene | null {
  const fit = list.filter((s) => {
    if (opts.calmOnly && !s.calm) return false;
    if (opts.avoid.includes(s.id)) return false;
    if (s.hours) {
      const [a, b] = s.hours;
      const ok = a <= b ? opts.hour >= a && opts.hour < b : opts.hour >= a || opts.hour < b;
      if (!ok) return false;
    }
    return true;
  });
  const pool = fit.length ? fit : list.filter((s) => !opts.calmOnly || s.calm);
  if (!pool.length) return null;
  const total = pool.reduce((n, s) => n + (s.weight ?? 1), 0);
  let r = Math.random() * total;
  for (const s of pool) {
    r -= s.weight ?? 1;
    if (r <= 0) return s;
  }
  return pool[pool.length - 1];
}
