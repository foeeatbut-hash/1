/**
 * Один смонтированный экземпляр раздела: keep-alive и «замороженный» роутер.
 *
 * Скрытый раздел остаётся в дереве (display:none) и не должен реагировать на
 * смену общего адреса — иначе, уйдя в Теги и вернувшись, человек нашёл бы
 * Конструктор с закрытым документом. Поэтому у каждого экземпляра свои
 * контексты react-router с застывшим location, а у живого — общий.
 *
 * Вынесено из Workspace отдельным файлом: тем же механизмом живут и окна.
 * Две копии keep-alive однажды разошлись бы, и разошлись бы незаметно.
 */
import React, { Suspense } from 'react';
import {
  Navigate, NavigationType, UNSAFE_LocationContext, UNSAFE_NavigationContext,
} from 'react-router-dom';
import type { Location, To } from 'react-router-dom';
import { useWorkspaceStore } from '../store/workspaceStore';
import { sectionForPath } from '../workspace/sections';
import { useStore } from '../store/store';
import SectionErrorBoundary from './SectionErrorBoundary';

export const asHref = (l: Location | { pathname: string; search?: string; hash?: string }) =>
  `${l.pathname}${l.search || ''}${l.hash || ''}`;

export function makeLocation(to: To, state: any = null): Location {
  if (typeof to === 'string') {
    const url = new URL(to, 'http://x');
    return { pathname: url.pathname, search: url.search, hash: url.hash, state, key: Math.random().toString(36).slice(2) };
  }
  return { pathname: to.pathname || '/', search: to.search || '', hash: to.hash || '', state, key: Math.random().toString(36).slice(2) };
}

export default function SectionFrame({
  paneId,
  path,
  isLive,
  visible,
  liveLocation,
  globalNavigate,
}: {
  paneId: string;
  path: string;
  isLive: boolean;
  visible: boolean;
  liveLocation: Location;
  globalNavigate: (to: To, opts?: any) => void;
}) {
  const def = sectionForPath(path);
  const user = useStore((s) => s.user);
  const setFrozenHref = useWorkspaceStore((s) => s.setFrozenHref);
  const closeInPane = useWorkspaceStore((s) => s.closeInPane);
  const initialHref = useWorkspaceStore.getState().frozenHrefs[`${paneId}::${path}`];
  const [frozenLoc, setFrozenLoc] = React.useState<Location>(() => makeLocation(initialHref || path));

  // Пока раздел живой — запоминаем его location, чтобы при возврате открыть там же
  React.useEffect(() => {
    if (isLive && liveLocation.pathname === path) {
      setFrozenLoc(liveLocation);
      setFrozenHref(paneId, path, asHref(liveLocation));
    }
  }, [isLive, liveLocation, path, paneId, setFrozenHref]);

  const location = isLive ? liveLocation : frozenLoc;

  const navigator = React.useMemo(
    () => ({
      createHref: (to: To) => (typeof to === 'string' ? to : asHref({ pathname: to.pathname || '/', search: to.search, hash: to.hash })),
      encodeLocation: (to: To) => makeLocation(to),
      go: () => {},
      push: (to: To, state?: any) => (isLive ? globalNavigate(to, { state }) : setFrozenLoc(makeLocation(to, state))),
      replace: (to: To, state?: any) => (isLive ? globalNavigate(to, { state, replace: true }) : setFrozenLoc(makeLocation(to, state))),
    }),
    [isLive, globalNavigate],
  );

  if (def.adminOnly && user?.role !== 'ADMIN') {
    return visible ? <Navigate to="/" replace /> : null;
  }

  const Comp = def.Component;
  // Собственный контекст роутера для этого экземпляра раздела: нельзя вкладывать
  // <Router> в <Router>, поэтому подменяем location/navigator напрямую через
  // контексты react-router (ровно то, что делает <Router> внутри, но без запрета
  // на вложенность). Так скрытый раздел «заморожен» и не реагирует на смену URL.
  const navContext = React.useMemo<any>(() => ({ basename: '', navigator: navigator as any, static: false }), [navigator]);
  const locContext = React.useMemo(() => ({ location, navigationType: NavigationType.Pop }), [location]);
  return (
    <div
      /* Отступ уменьшен с 24 до 10 px: раздел — лист, а не карточка,
         плавающая в сером поле. Поле шириной в палец вокруг каждого
         экрана съедало место и выглядело одинаково в любой программе */
      className={`absolute inset-0 ${def.pad ? 'p-2.5' : ''} ${def.scroll === 'fixed' ? 'overflow-hidden' : 'overflow-y-auto'}`}
      style={{ display: visible ? 'block' : 'none' }}
      aria-hidden={!visible}
    >
      <UNSAFE_NavigationContext.Provider value={navContext}>
        <UNSAFE_LocationContext.Provider value={locContext}>
          {/* Граница внутри панели: сбой одного раздела не должен уносить
              соседние — они смонтированы рядом и держат несохранённые правки */}
          <SectionErrorBoundary title={def.title} onClose={() => closeInPane(paneId, path)}>
            <Suspense fallback={<div className="w-full h-full flex items-center justify-center py-24"><div className="w-8 h-8 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" /></div>}>
              <Comp />
            </Suspense>
          </SectionErrorBoundary>
        </UNSAFE_LocationContext.Provider>
      </UNSAFE_NavigationContext.Provider>
    </div>
  );
}
