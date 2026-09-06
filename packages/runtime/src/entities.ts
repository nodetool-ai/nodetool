/**
 * Entity values, resolved against the library.
 *
 * An `entity` value carried by a graph is `{id, kind, name, descriptor, …}`.
 * The `id` is the identity; every other field is a cache of what the library
 * held when the value was picked. So a value whose `descriptor` is empty is a
 * pointer, not an entity: read the row and use it. A value that carries its own
 * descriptor is taken at face value, which is what makes an inline entity —
 * written in a test, a DSL graph or a fake-mode run — work with no database at
 * all.
 */

import { isObjectLike, type Entity } from "@nodetool-ai/protocol";

/**
 * What {@link resolveEntities} needs from a {@link ProcessingContext}: the
 * ability to say whether the library is wired, and to read one row. Declared
 * structurally so a caller with neither a context nor a database can pass
 * nothing.
 */
export interface EntityLibraryContext {
  hasModelInterface(name: "getEntity"): boolean;
  getEntity(id: string): Promise<Entity | null>;
}

const isFilled = (value: unknown): boolean =>
  typeof value === "string" && value.trim() !== "";

/**
 * Fill each entity value from the library when it is a bare pointer, and pass
 * every other value through unchanged.
 *
 * A value is filled when its `descriptor` is empty, it names an `id`, and the
 * context exposes `getEntity`. A row that no longer exists leaves the value as
 * it was rather than dropping it: the caller asked to season a prompt, and a
 * stale name is closer to the intent than nothing.
 */
export async function resolveEntities(
  values: readonly unknown[] | null | undefined,
  context?: EntityLibraryContext | null
): Promise<Entity[]> {
  if (!values || values.length === 0) {
    return [];
  }
  const canRead = !!context && context.hasModelInterface("getEntity");
  const resolved: Entity[] = [];
  for (const value of values) {
    if (!isObjectLike(value)) {
      continue;
    }
    const entity = value as unknown as Entity;
    if (!canRead || isFilled(entity.descriptor) || !isFilled(entity.id)) {
      resolved.push(entity);
      continue;
    }
    const stored = await context!.getEntity(entity.id);
    resolved.push(stored ?? entity);
  }
  return resolved;
}
