import { PhotoPose, PHOTO_NEUTRAL } from './__photo';

/**
 * ЧЕРНОВИК: слой жизни поверх позы. В приложение не входит.
 *
 * Поза говорит, куда котёнок ставит части. Живым его делает не она, а то, что
 * происходит между позами: он дышит, моргает не по расписанию, ведёт ухом,
 * покачивает хвостом. Без этого слоя любая, даже правильная поза читается как
 * фотография.
 *
 * Три приёма, на которых всё держится:
 *
 *  1. Пружина вместо перехода. К новой позе части идут не по кривой заданной
 *     длины, а притягиваются с ускорением и слегка проскакивают. Поэтому
 *     движение не выглядит отмеренным.
 *  2. Опоздание. У хвоста пружина мягче, чем у корпуса, у ушей — мягче, чем у
 *     головы. Части приходят не одновременно, и тело читается как связное.
 *  3. Ничего строго периодического. Дыхание — сумма двух несоразмерных синусов,
 *     моргание и подёргивание уха идут по случайным паузам. Точный период
 *     глаз замечает мгновенно и перестаёт верить.
 */

type Joint = keyof PhotoPose;

/** Жёсткость и трение пружины на каждый сустав: больше жёсткость — быстрее приход. */
const SPRING: Partial<Record<Joint, [number, number]>> = {
  bodyY: [0.020, 0.80],
  lean: [0.018, 0.80],
  headTilt: [0.016, 0.78],
  headTurn: [0.014, 0.78],
  earL: [0.011, 0.72],
  earR: [0.011, 0.72],
  tail: [0.008, 0.70],
  tailTip: [0.006, 0.68],
  pawL: [0.022, 0.76],
  pawR: [0.022, 0.76],
  blink: [0.060, 0.60],
  breath: [0.040, 0.70],
};

const JOINTS = Object.keys(PHOTO_NEUTRAL) as Joint[];

const rand = (a: number, b: number) => a + Math.random() * (b - a);

export interface Mood {
  /** 0 — дремлет, 1 — обычный, 2 — возбуждён. Влияет на дыхание и хвост. */
  energy: number;
  /** Куда смотрит: −1 влево, 1 вправо, 0 на нас. */
  gaze: number;
}

export class PhotoLife {
  private cur: PhotoPose = { ...PHOTO_NEUTRAL };
  private vel: Partial<Record<Joint, number>> = {};
  private t = 0;

  private nextBlink = rand(1200, 3000);
  private blinkT = -1;
  private blinkTwice = false;

  private nextTwitch = rand(2500, 7000);
  private twitchT = -1;
  private twitchEar: 'earL' | 'earR' = 'earL';

  mood: Mood = { energy: 1, gaze: 0 };

  /** dt в миллисекундах. Возвращает позу, которую можно отдать в applyPhoto. */
  update(dt: number, target: PhotoPose): PhotoPose {
    const d = Math.min(dt, 50);
    this.t += d;
    const e = this.mood.energy;

    // Дыхание: два несоразмерных периода, чтобы вдохи не повторялись
    const slow = Math.sin(this.t / (1500 - e * 260));
    const fast = Math.sin(this.t / (430 - e * 70) + 1.1);
    const breath = 1 + (0.013 + e * 0.006) * slow + 0.0035 * fast;

    // Хвост живёт своей жизнью и почти не останавливается
    const sway = Math.sin(this.t / 1250) * (3 + e * 5) + Math.sin(this.t / 470 + 0.7) * (1 + e * 1.6);

    // Голова ведёт себя как у живого: медленно плывёт, не замирая
    const drift = Math.sin(this.t / 2600) * 1.6 + Math.sin(this.t / 1130 + 2.2) * 0.7;

    this.tickBlink(d);
    this.tickTwitch(d);

    const want: PhotoPose = { ...target };
    want.breath = target.breath * breath;
    want.tail = target.tail + sway;
    want.tailTip = target.tailTip + sway * 1.35;
    want.headTilt = target.headTilt + drift;
    want.headTurn = target.headTurn + this.mood.gaze * 2.6 + drift * 0.25;
    want.blink = Math.max(target.blink, this.blinkValue());
    if (this.twitchT >= 0) {
      const k = Math.sin((this.twitchT / 260) * Math.PI);
      want[this.twitchEar] += k * 13 * (this.twitchEar === 'earL' ? -1 : 1);
    }

    for (const j of JOINTS) {
      const [k, damp] = SPRING[j] ?? [0.02, 0.78];
      const v = (this.vel[j] ?? 0) + (want[j] - this.cur[j]) * k * d;
      const nv = v * Math.pow(damp, d / 16.67);
      this.vel[j] = nv;
      this.cur[j] += nv * d * 0.06;
    }
    return { ...this.cur };
  }

  /** Мгновенно поставить позу без разгона — для первого кадра. */
  snap(pose: PhotoPose) {
    this.cur = { ...pose };
    this.vel = {};
  }

  /** Внеочередное моргание: пригодится, когда котёнок на что-то среагировал. */
  blinkNow(twice = false) {
    this.blinkT = 0;
    this.blinkTwice = twice;
    this.nextBlink = rand(2200, 5200);
  }

  private tickBlink(d: number) {
    if (this.blinkT >= 0) {
      this.blinkT += d;
      const len = this.blinkTwice ? 460 : 190;
      if (this.blinkT > len) this.blinkT = -1;
      return;
    }
    this.nextBlink -= d;
    if (this.nextBlink <= 0) {
      this.blinkT = 0;
      // Иногда моргает дважды подряд — это мелочь, но её замечаешь
      this.blinkTwice = Math.random() < 0.22;
      this.nextBlink = rand(2000, 6500) / Math.max(0.4, this.mood.energy);
    }
  }

  private blinkValue() {
    if (this.blinkT < 0) return 0;
    const len = this.blinkTwice ? 460 : 190;
    const u = this.blinkT / len;
    if (!this.blinkTwice) return Math.sin(u * Math.PI);
    // Два смыкания подряд, между ними глаза открываются не до конца
    return Math.max(Math.sin(Math.min(1, u * 2.4) * Math.PI), Math.sin(Math.max(0, u * 2.4 - 1.4) * Math.PI));
  }

  private tickTwitch(d: number) {
    if (this.twitchT >= 0) {
      this.twitchT += d;
      if (this.twitchT > 260) this.twitchT = -1;
      return;
    }
    this.nextTwitch -= d;
    if (this.nextTwitch <= 0) {
      this.twitchT = 0;
      this.twitchEar = Math.random() < 0.5 ? 'earL' : 'earR';
      this.nextTwitch = rand(2600, 9000) / Math.max(0.4, this.mood.energy);
    }
  }
}
