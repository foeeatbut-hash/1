import React, { useEffect, useState } from 'react';

// ── Стартовая заставка Flux (React-версия) ──
// Продолжает заставку из index.html тем же дизайном: стили #boot-splash
// живут в <head> и не удаляются при монтировании React, поэтому переход
// «загрузка JS → ожидание сервера» происходит бесшовно.

// Этапы запуска встроенного сервера: реального прогресса нет (порт молчит,
// пока всё не готово), поэтому статусы сменяются по прошедшему времени.
const STAGES: { after: number; text: string }[] = [
  { after: 0, text: 'Запуск встроенного сервера…' },
  { after: 3, text: 'Подключение к базе данных…' },
  { after: 9, text: 'Проверка и обновление структуры данных…' },
  { after: 22, text: 'Подготовка рабочего пространства…' },
  { after: 40, text: 'Почти готово, ещё немного…' },
];

export default function BootSplash({ done = false }: { done?: boolean }) {
  // Считаем от метки монтирования, а не накоплением тиков интервала:
  // так время не ускоряется от лишних перерисовок (StrictMode и т.п.)
  const [startAt] = useState(() => Date.now());
  const [, forceTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => forceTick(n => n + 1), 400);
    return () => clearInterval(t);
  }, []);
  const elapsed = (Date.now() - startAt) / 1000;
  const status = [...STAGES].reverse().find(s => elapsed >= s.after)?.text || STAGES[0].text;
  // Процент — плавная асимптота: быстро в начале, медленнее к концу, 100% при готовности
  const pct = done ? 100 : Math.min(96, Math.round(100 * (1 - Math.exp(-elapsed / 15))));

  return (
    <div id="boot-splash" className={`in-app${done ? ' done' : ''}`}>
      <div className="orb o1" /><div className="orb o2" /><div className="orb o3" />
      <div className="stream s1" /><div className="stream s2" /><div className="stream s3" />
      <div className="glow" />
      <div className="tile-wrap">
        <div className="halo" />
        <div className="tile">
          <svg width="58" height="58" viewBox="0 0 100 100">
            <path className="flux-curve flux-base" pathLength={100} d="M16 62 C36 28 64 28 84 62" />
            <path className="flux-curve flux-base" pathLength={100} d="M16 40 C36 74 64 74 84 40" />
            <path className="flux-curve flux-comet" pathLength={100} d="M16 62 C36 28 64 28 84 62" />
            <path className="flux-curve flux-comet rev" pathLength={100} d="M16 40 C36 74 64 74 84 40" />
          </svg>
        </div>
      </div>
      <div className="wordmark">Flux</div>
      <div className="subtitle">Инженерный документооборот</div>
      <div className="bar-row">
        <div className="bar"><span className="fill" style={{ width: `${Math.max(10, pct)}%` }} /></div>
        <span className="pct">{pct}%</span>
      </div>
      <div className="status">{status}</div>
      <div className="credit">Разработка Раупова Хусрава</div>
    </div>
  );
}

// ── Гейт готовности сервера ──
// Пока /api/health не отвечает (встроенный Express ещё поднимается),
// держит заставку. Если сервер уже готов при первом же опросе (dev-режим,
// обычный браузер) — пропускает без задержки и мигания.
export function ServerGate({ children }: { children: React.ReactNode }) {
  const [phase, setPhase] = useState<'checking' | 'waiting' | 'fading' | 'ready'>('checking');

  useEffect(() => {
    let cancelled = false;
    const startedAt = Date.now();

    const check = async () => {
      try {
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), 2500);
        const r = await fetch('/api/health', { signal: ctl.signal });
        clearTimeout(timer);
        if (r.ok) {
          if (cancelled) return;
          if (Date.now() - startedAt < 400) {
            setPhase('ready'); // сервер уже был готов — без заставки
          } else {
            setPhase('fading');
            setTimeout(() => { if (!cancelled) setPhase('ready'); }, 550);
          }
          return;
        }
      } catch (_) { /* сервер ещё не слушает порт — ждём */ }
      if (!cancelled) {
        setPhase(p => (p === 'checking' ? 'waiting' : p));
        setTimeout(check, 800);
      }
    };
    check();
    return () => { cancelled = true; };
  }, []);

  if (phase === 'ready') return <>{children}</>;
  return <BootSplash done={phase === 'fading'} />;
}
