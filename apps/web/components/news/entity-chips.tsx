import type { EntityBrief, EntityKind } from '@gukjang/spec';
import { cn } from '../../lib/utils';

const ENTITY_ICON: Record<EntityKind, string> = {
  PERSON: '👤',
  ORG: '🏢',
  PLACE: '📍',
  PRODUCT: '📦',
  EVENT: '📅',
  BRAND: '🏷️',
  WORD: '🔤',
  TIME: '🕐',
  NUMBER: '#',
  OTHER: '•',
};

/**
 * docs/05-screen-specs.md S2 — "핵심 개체 칩. 탭 시 그래프에서 해당 노드 하이라이트."
 * entity.id와 그래프 노드 id는 서로 다른 공간이라(그래프는 path에서 조립, 개체 FK 없음)
 * 라벨 문자열로 매칭한다 — `selectableNodeIds`에 없는 개체는 클릭해도 반응하지 않는다.
 */
export function EntityChips({
  entities,
  selectableNodeIds,
  selectedNodeId,
  onSelect,
}: {
  entities: EntityBrief[];
  selectableNodeIds: Map<string, number>;
  selectedNodeId: number | null;
  onSelect: (nodeId: number | null) => void;
}) {
  if (entities.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {entities.map((entity) => {
        const nodeId = selectableNodeIds.get(entity.name);
        const selected = nodeId !== undefined && nodeId === selectedNodeId;
        const clickable = nodeId !== undefined;
        return (
          <button
            key={entity.id}
            type="button"
            disabled={!clickable}
            onClick={() => clickable && onSelect(selected ? null : nodeId)}
            className={cn(
              'inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 font-sans text-xs',
              selected ? 'border-rule-strong bg-ink text-paper' : 'border-rule text-ink-soft',
              clickable ? 'cursor-pointer' : 'cursor-default opacity-70',
            )}
          >
            <span aria-hidden>{ENTITY_ICON[entity.kind]}</span>
            {entity.name}
          </button>
        );
      })}
    </div>
  );
}
