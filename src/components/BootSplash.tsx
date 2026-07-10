import React, { useEffect, useState } from 'react';

// ── Гейт готовности сервера ──
// Стартовая заставка (#boot-splash) целиком живёт в index.html: разметка —
// сиблинг #root, прогресс и статусы ведёт инлайн-скрипт с первой отрисовки
// страницы. React её НЕ пересоздаёт — интро идёт одной непрерывной анимацией.
// Задача ServerGate — дождаться встроенного Express (/api/health), затем
// погасить заставку через window.__bootSplashDone и отрисовать приложение.
export function ServerGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const startedAt = Date.now();

    const finish = () => {
      if (cancelled) return;
      // Сервер уже был готов при первом же опросе (dev-режим, обычный браузер) —
      // убираем заставку мгновенно, без прощальной анимации и мигания
      const instant = Date.now() - startedAt < 400;
      try { (window as any).__bootSplashDone?.(instant); } catch (_) { /* заставки уже нет (HMR) */ }
      setReady(true);
    };

    const check = async () => {
      try {
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), 2500);
        const r = await fetch('/api/health', { signal: ctl.signal });
        clearTimeout(timer);
        if (r.ok) { finish(); return; }
      } catch (_) { /* сервер ещё не слушает порт — ждём */ }
      if (!cancelled) setTimeout(check, 800);
    };
    check();

    return () => { cancelled = true; };
  }, []);

  // Пока сервер поднимается, ничего не рисуем — весь экран занимает заставка
  // из index.html. Когда готов — приложение монтируется сразу, а заставка
  // растворяется НАД ним, плавно открывая экран входа.
  if (!ready) return null;
  return <>{children}</>;
}
