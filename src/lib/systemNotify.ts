/**
 * Уведомления на рабочий стол Windows.
 *
 * Нужны ровно в одном случае: программа свёрнута или не в фокусе, а человеку
 * пишут. Тогда сообщение обязано дойти до него мимо Flux — иначе личный чат
 * работает только для того, кто и так смотрит в окно.
 *
 * Обратное так же важно: уведомление системы поверх открытого окна той же
 * программы — раздражение, а не помощь. Человек и так видит всплывашку внутри
 * Flux; вторая, снаружи, говорит ему то же самое ещё раз.
 *
 * Правило вынесено сюда, отдельно от разметки и от Electron, потому что
 * ошибиться в нём легко, а увидеть ошибку — нет: лишнее уведомление замечают
 * все, недошедшее не замечает никто.
 */

export interface SystemNotifyContext {
  /** Окно программы свёрнуто */
  minimized: boolean;
  /** Окно в фокусе — человек прямо сейчас смотрит в него */
  focused: boolean;
  /** Тихий режим включён (общий для всей программы) */
  quiet: boolean;
  /** Категория разрешена в настройках уведомлений */
  allowed: boolean;
  /** Мы вообще в Electron: в браузере системных уведомлений не обещаем */
  desktop: boolean;
}

/**
 * Показывать ли уведомление системы.
 *
 * Тихий режим сильнее всего остального: он и заведён затем, чтобы не отвлекать
 * — и обходить его снаружи программы было бы прямым обманом.
 */
export function shouldNotifySystem(ctx: SystemNotifyContext): boolean {
  if (!ctx.desktop) return false;
  if (ctx.quiet) return false;
  if (!ctx.allowed) return false;
  // Свёрнуто или не в фокусе — человек смотрит не сюда
  return ctx.minimized || !ctx.focused;
}

/**
 * Текст уведомления. Заголовок — имя отправителя, а не «Flux»: человек решает
 * по имени, отрываться ли, и «Flux» ему в этом не помогает.
 *
 * Тело подрезаем: система всё равно обрежет, но по своему правилу и посреди
 * слова. Лучше своё многоточие, чем чужой обрыв.
 */
export const BODY_LIMIT = 140;

export function notifyText(title: string, body: string): { title: string; body: string } {
  const t = String(title || '').trim() || 'Flux';
  const raw = String(body || '').replace(/\s+/g, ' ').trim();
  const b = raw.length > BODY_LIMIT ? `${raw.slice(0, BODY_LIMIT - 1).trimEnd()}…` : raw;
  return { title: t, body: b };
}

/** Счётчик на значке программы в панели Windows: тот же, что в трее Flux */
export function badgeCount(unread: number): number {
  return Math.max(0, Math.floor(unread) || 0);
}
