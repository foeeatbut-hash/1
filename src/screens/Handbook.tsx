import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { BookOpen, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import HandbookNav from '../components/handbook/HandbookNav';
import HandbookArticleView from '../components/handbook/HandbookArticleView';
import { ARTICLES, search, articleById } from '../handbook/registry';
import { anchorsOf } from '../handbook/model';

/**
 * Руководство по программе.
 *
 * Три колонки: оглавление с поиском, статья, поле «на этой странице». Раздел
 * живёт в панели рабочего стола, поэтому ширину меряем у контейнера: при
 * @[1180px] стоят все три колонки, ниже уходит поле якорей, а при @[820px] —
 * и оглавление, в кнопку: статью читать важнее, чем видеть список.
 *
 * Вход бывает двух родов: из левого меню (открывается статья, на которой
 * остановились) и по F1 из любого раздела — тогда в адресе стоит ?for=/registry,
 * и открывается статья именно этого раздела.
 */
export default function Handbook() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const [query, setQuery] = useState('');
  // Ниже 820 точек оглавление и статья не помещаются рядом: держим оглавление
  // закрытым и открываем кнопкой. Выше 820 его показывает запрос к контейнеру,
  // и это состояние ни на что не влияет. Порог взят по замеру: при окне 1100
  // на панель остаётся около 860 точек — оглавление должно быть ещё видно.
  const [navOpen, setNavOpen] = useState(false);
  const [anchor, setAnchor] = useState('');
  const bodyRef = useRef<HTMLDivElement>(null);

  // Что открыто: явная статья, статья раздела по F1, либо начало
  const openId = useMemo(() => {
    const byId = params.get('article');
    if (byId && articleById(byId)) return byId;
    const forRoute = params.get('for');
    if (forRoute) {
      const a = ARTICLES.find((x) => x.route === forRoute);
      if (a) return a.id;
    }
    return 'start';
  }, [params]);

  const article = articleById(openId) || ARTICLES[0];
  const hits = useMemo(() => search(query), [query]);
  const anchors = useMemo(() => anchorsOf(article), [article]);

  const open = (id: string) => {
    const next = new URLSearchParams(params);
    next.set('article', id);
    next.delete('for');
    setParams(next, { replace: true });
  };

  // Смена статьи возвращает к началу: иначе новая статья открывается на том
  // месте, до которого была прокручена предыдущая
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
    setAnchor('');
  }, [openId]);

  // Какой заголовок сейчас на экране — подсвечиваем его в поле якорей
  useEffect(() => {
    const root = bodyRef.current;
    if (!root || !anchors.length) return;
    const onScroll = () => {
      let current = '';
      for (const a of anchors) {
        const el = root.querySelector(`#hb-${a.id}`) as HTMLElement | null;
        if (el && el.getBoundingClientRect().top - root.getBoundingClientRect().top < 80) current = a.id;
      }
      setAnchor(current);
    };
    onScroll();
    root.addEventListener('scroll', onScroll, { passive: true });
    return () => root.removeEventListener('scroll', onScroll);
  }, [anchors, openId]);

  const goAnchor = (id: string) => {
    const el = bodyRef.current?.querySelector(`#hb-${id}`) as HTMLElement | null;
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const titleOf = (id: string) => articleById(id)?.title || id;

  return (
    <div id="handbook-root" className="@container h-full min-h-0 flex flex-col">
      <div className="shrink-0 flex items-center gap-2 pb-3 min-w-0">
        <button
          type="button" onClick={() => setNavOpen((v) => !v)}
          title={navOpen ? 'Скрыть оглавление' : 'Показать оглавление'}
          className="@[820px]:hidden p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-850 text-slate-500 cursor-pointer shrink-0"
        >
          {navOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
        </button>
        <BookOpen className="w-5 h-5 text-emerald-700 dark:text-emerald-400 shrink-0" />
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-bold text-slate-900 dark:text-white truncate">Руководство</h1>
          <p className="text-2xs text-slate-500 dark:text-slate-400 truncate">
            Что умеет каждый раздел, что где хранится и чем связано
          </p>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex gap-4 min-w-0">
        <aside
          className={`${navOpen ? 'flex' : 'hidden'} @[820px]:flex shrink-0 w-56 @[1180px]:w-64 flex-col rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden`}
        >
          <HandbookNav
            articles={ARTICLES}
            openId={openId}
            query={query}
            hits={hits}
            onQuery={setQuery}
            onOpen={(id) => { open(id); setNavOpen(false); }}
          />
        </aside>

        <div ref={bodyRef} className="flex-1 min-w-0 overflow-y-auto scrollbar-thin pr-1">
          <HandbookArticleView
            article={article}
            onOpen={open}
            titleOf={titleOf}
            onGoToSection={(route) => navigate(route)}
          />
        </div>

        {anchors.length > 1 && (
          <nav className="hidden @[1180px]:flex shrink-0 w-48 flex-col gap-1 pt-1" aria-label="На этой странице">
            <span className="px-2 pb-1 text-2xs uppercase tracking-wider font-semibold text-slate-400 dark:text-slate-500">
              На этой странице
            </span>
            {anchors.map((x) => (
              <button
                key={x.id} type="button" onClick={() => goAnchor(x.id)}
                className={`text-left px-2 py-1 rounded-lg text-xs cursor-pointer transition-colors border-l-2 ${
                  anchor === x.id
                    ? 'border-emerald-600 text-emerald-800 dark:text-emerald-300 font-semibold bg-emerald-50/60 dark:bg-emerald-950/30'
                    : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'
                }`}
              >
                {x.title}
              </button>
            ))}
          </nav>
        )}
      </div>
    </div>
  );
}
