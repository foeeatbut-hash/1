/**
 * Обёртка листа Параметров: заголовок, пояснение и содержимое.
 *
 * Живёт отдельно, потому что нужна и самому экрану, и листам, вынесенным из
 * него: экран упирался в потолок размера, и держать обёртку внутри значило бы
 * тянуть весь лист обратно.
 */
import React from 'react';

export default function SectionShell({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="max-w-3xl">
      <h2 className="text-xl font-bold text-slate-900 dark:text-white">{title}</h2>
      <p className="text-xs text-slate-400 mt-1 mb-5">{desc}</p>
      {children}
    </div>
  );
}
