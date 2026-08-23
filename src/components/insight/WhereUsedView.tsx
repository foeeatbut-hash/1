import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Link2 } from 'lucide-react';
import { useStore } from '../../store/store';
import { useInsightStore } from '../../store/insightStore';
import { fetchWhereUsed, EMPTY_USAGE, type UsageKind, type UsageResult } from '../../lib/insight';
import { KindIcon, Row, GroupHead, Empty, Skeleton } from './parts';

/**
 * «Где используется»: все места, где встречается объект.
 *
 * Главный вопрос, ради которого это делалось: «я меняю здесь — где вылезет».
 * Поэтому связи не сворачиваются в число, а показываются списком с переходом:
 * счётчик «в 7 документах» заставляет искать эти семь руками.
 */
export default function WhereUsedView({ kind, id }: { kind: UsageKind; id: string }) {
  const { activeProject } = useStore();
  const { openWhere, close } = useInsightStore();
  const navigate = useNavigate();
  const [data, setData] = useState<UsageResult>(EMPTY_USAGE);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchWhereUsed(kind, id, activeProject?.id).then(r => {
      if (alive) { setData(r); setLoading(false); }
    });
    return () => { alive = false; };
  }, [kind, id, activeProject?.id]);

  const go = (route: string) => {
    if (!route) return;
    navigate(route);
    close();
  };

  if (loading) return <Skeleton rows={6} />;

  if (!data.found) {
    return (
      <Empty
        icon={<Link2 className="w-5 h-5" />}
        title="Объект не найден"
        hint="Возможно, его удалили или он относится к другому проекту."
      />
    );
  }

  if (data.total === 0) {
    return (
      <Empty
        icon={<Link2 className="w-5 h-5" />}
        title="Пока нигде не используется"
        hint={`«${data.title}» не встречается ни в оборудовании, ни в документах, ни в файлах проекта. Такой объект можно переименовать или удалить, ничего не сломав.`}
      />
    );
  }

  return (
    <div className="pb-4">
      {data.groups.map(g => (
        <section key={g.id}>
          <GroupHead title={g.title} hint={g.hint} count={g.links.length} />
          <div className="px-1">
            {g.links.map(l => (
              <Row
                key={`${l.kind}-${l.id}`}
                icon={<KindIcon kind={l.kind} />}
                title={l.title}
                subtitle={l.subtitle}
                badge={l.badge}
                onClick={l.route ? () => go(l.route) : undefined}
                // У тега, элемента и документа связи есть свои — из панели
                // можно уйти вглубь, не возвращаясь к списку
                onSide={['tag', 'element', 'doc', 'file', 'vdr'].includes(l.kind)
                  ? () => openWhere(l.kind as UsageKind, l.id, true) : undefined}
                sideTitle="Связи этого объекта"
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
