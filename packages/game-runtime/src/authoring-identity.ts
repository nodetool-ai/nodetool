/** Stable tuple encoding keeps construction order and display names out of identity. */
export function stableGameAuthoringId(unitId: string, sceneId: string, collectionId: string, key: string, childId?: string): string {
  const parts = [unitId, sceneId, collectionId, key];
  if (childId !== undefined) { parts.push(childId); }
  if (parts.some((part) => part.length === 0)) { throw new Error("Authoring identity keys must be nonempty"); }
  return parts.map((part) => `${part.length}:${part}`).join("");
}
