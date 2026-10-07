import type { Entity, EntityKind } from "@nodetool-ai/protocol";

/**
 * Filter + rank library entities for a mention query: name prefix matches
 * first, then name substring, then kind / tag matches. An empty query keeps
 * library order so the row is stable while the picker opens.
 */
export const filterEntitiesForMention = (
  entities: Entity[],
  query: string
): Entity[] => {
  const q = query.trim().toLowerCase();
  if (!q) {
    return entities;
  }
  const ranked: Array<{ entity: Entity; rank: number }> = [];
  for (const entity of entities) {
    const name = (entity.name || "").toLowerCase();
    const rank = name.startsWith(q)
      ? 0
      : name.includes(q)
        ? 1
        : entity.kind.startsWith(q) ||
            (entity.tags ?? []).some((t) => t.toLowerCase().includes(q))
          ? 2
          : -1;
    if (rank >= 0) {
      ranked.push({ entity, rank });
    }
  }
  ranked.sort((a, b) => a.rank - b.rank);
  return ranked.map((r) => r.entity);
};

/** Narrow to one kind (or keep all), then rank by the query. */
export const filterEntities = (
  entities: readonly Entity[],
  kind: "all" | EntityKind,
  query: string
): Entity[] =>
  filterEntitiesForMention(
    kind === "all"
      ? [...entities]
      : entities.filter((entity) => entity.kind === kind),
    query
  );
