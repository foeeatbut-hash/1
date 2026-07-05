// Логотип Flux: плитка с градиентом и белым глифом «переплетения потоков».
// Инлайн-стили, чтобы одинаково работать в сайдбаре, на логине и в настройках.
import React from 'react';

interface FluxLogoProps {
  size?: number;
  radius?: number;
  className?: string;
}

export default function FluxLogo({ size = 32, radius, className }: FluxLogoProps) {
  const r = radius ?? Math.round(size * 0.26);
  return (
    <div
      className={className}
      aria-label="Flux"
      style={{
        width: size,
        height: size,
        borderRadius: r,
        background: 'linear-gradient(135deg, #2563eb, #06b6d4)',
        display: 'grid',
        placeItems: 'center',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,.28), 0 6px 16px -8px rgba(6,110,180,.55)',
        flex: 'none',
      }}
    >
      <svg
        viewBox="0 0 100 100"
        width="60%"
        height="60%"
        fill="none"
        stroke="#fff"
        strokeWidth={9}
        strokeLinecap="round"
        style={{ filter: 'drop-shadow(0 1px 1px rgba(0,0,0,.2))', display: 'block' }}
      >
        <path d="M16 62 C36 28 64 28 84 62" />
        <path d="M16 40 C36 74 64 74 84 40" />
      </svg>
    </div>
  );
}
