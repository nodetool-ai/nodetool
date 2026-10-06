import { compose3 } from "../spatial3d/math.js";
import type { EntityState3D } from "../spatial3d/state.js";
export function updateVisualHierarchy3D(states: readonly EntityState3D[]): void {
  const byId = new Map(states.map((state) => [state.definition.id, state]));
  const children = new Map<string, EntityState3D[]>();
  const queue: EntityState3D[] = [];
  for (const state of states) {
    const parentId = state.definition.parentId;
    if (!parentId) {
      queue.push(state);
    } else {
      const siblings = children.get(parentId) ?? [];
      siblings.push(state);
      children.set(parentId, siblings);
    }
  }
  for (let index = 0; index < queue.length; index += 1) {
    const state = queue[index];
    const parent = state.definition.parentId ? byId.get(state.definition.parentId) : undefined;
    if (parent) {
      state.transform = compose3(parent.transform, state.localTransform);
      state.active = state.active && parent.active;
    }
    queue.push(...(children.get(state.definition.id) ?? []));
  }
}
