/**
 * Слой пометок поверх страницы чертежа.
 *
 * Пометки хранятся в долях страницы (0..1), а не в точках: чертёж A1 и его же
 * скан в другом разрешении дают одно и то же место. Перевод в экранные
 * координаты — здесь, и только здесь.
 *
 * Пометки прошлой ревизии рисуются серыми и не ловят мышь: их показывают,
 * чтобы видеть, что учтено, а не чтобы править.
 */
import React from 'react';

export interface Markup {
  id: string;
  revision: string;
  page: number;
  kind: 'CLOUD' | 'RECT' | 'ARROW' | 'NOTE' | 'STAMP' | 'PEN';
  x: number; y: number; w: number; h: number;
  color: string;
  strokeWidth: number;
  text?: string | null;
  state: 'OPEN' | 'DONE' | 'REJECTED';
  createdAt: string;
  createdBy?: { id: string; name: string; symbol?: string } | null;
}

/**
 * Волнистая обводка — та самая, которой чертёжник обводит изменённое место.
 * Дуги по периметру прямоугольника: шаг подбирается так, чтобы на каждой
 * стороне уместилось целое число дуг, иначе на углах получается обрубок.
 */
function cloudPath(x: number, y: number, w: number, h: number): string {
  const step = Math.max(12, Math.min(26, Math.min(w, h) / 4));
  const arcs = (from: number, to: number, fn: (t: number) => [number, number]) => {
    const n = Math.max(1, Math.round(Math.abs(to - from) / step));
    const d: string[] = [];
    for (let i = 0; i < n; i++) {
      const [px, py] = fn(from + ((to - from) * (i + 1)) / n);
      d.push(`A ${step / 1.6} ${step / 1.6} 0 0 1 ${px} ${py}`);
    }
    return d.join(' ');
  };
  return [
    `M ${x} ${y}`,
    arcs(x, x + w, (t) => [t, y]),
    arcs(y, y + h, (t) => [x + w, t]),
    arcs(x + w, x, (t) => [t, y + h]),
    arcs(y + h, y, (t) => [x, t]),
    'Z',
  ].join(' ');
}

export default function MarkupLayer({
  markups, width, height, currentRevision, selectedId, onSelect, draft,
}: {
  markups: Markup[];
  width: number;
  height: number;
  /** Ревизия чертежа сейчас: пометки других ревизий гасим */
  currentRevision: string;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Рамка, которую сейчас тянут мышью */
  draft: { x: number; y: number; w: number; h: number; kind: string; color: string } | null;
}) {
  const px = (v: number, size: number) => v * size;

  const shape = (m: Markup, old: boolean) => {
    const x = px(m.x, width);
    const y = px(m.y, height);
    const w = px(m.w, width);
    const h = px(m.h, height);
    const stroke = old ? '#94a3b8' : m.color;
    const common = {
      stroke,
      strokeWidth: m.strokeWidth,
      fill: 'none',
      opacity: old ? 0.5 : (m.state === 'DONE' ? 0.55 : 1),
      style: { cursor: old ? 'default' : 'pointer' } as React.CSSProperties,
      onClick: old ? undefined : (e: React.MouseEvent) => { e.stopPropagation(); onSelect(m.id); },
    };
    switch (m.kind) {
      case 'CLOUD': return <path d={cloudPath(x, y, w, h)} {...common} />;
      case 'RECT': return <rect x={x} y={y} width={w} height={h} rx={2} {...common} />;
      case 'ARROW': return (
        <g {...common}>
          <line x1={x} y1={y} x2={x + w} y2={y + h} markerEnd="url(#flux-arrow)" />
          <line x1={x} y1={y} x2={x + w} y2={y + h} stroke="transparent" strokeWidth={14} />
        </g>
      );
      case 'NOTE':
      case 'STAMP': return (
        <g {...common}>
          <rect x={x} y={y} width={Math.max(w, 22)} height={Math.max(h, 22)} rx={4}
            fill={old ? '#e2e8f0' : `${stroke}22`} stroke={stroke} />
          <text x={x + 6} y={y + 16} fontSize={12} fill={stroke} fontWeight={700} style={{ pointerEvents: 'none' }}>
            {m.kind === 'STAMP' ? (m.text || '') : '!'}
          </text>
        </g>
      );
      default: return null;
    }
  };

  const sel = markups.find((m) => m.id === selectedId) || null;

  return (
    <svg width={width} height={height} className="absolute left-0 top-0" onClick={() => onSelect(null)}
      style={{ pointerEvents: 'auto' }}>
      <defs>
        <marker id="flux-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" />
        </marker>
      </defs>
      {markups.map((m) => (
        <g key={m.id}>{shape(m, m.revision !== currentRevision)}</g>
      ))}
      {sel && (
        <rect
          x={px(sel.x, width) - 4} y={px(sel.y, height) - 4}
          width={px(sel.w, width) + 8} height={px(sel.h, height) + 8}
          fill="none" stroke="#059669" strokeDasharray="4 3" strokeWidth={1.5} style={{ pointerEvents: 'none' }}
        />
      )}
      {draft && (
        <rect x={px(draft.x, width)} y={px(draft.y, height)}
          width={px(draft.w, width)} height={px(draft.h, height)}
          fill="none" stroke={draft.color} strokeWidth={2} strokeDasharray="5 4" style={{ pointerEvents: 'none' }} />
      )}
    </svg>
  );
}
