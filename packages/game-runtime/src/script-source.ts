export function scriptSourceKey(sceneId: string, entityId: string, behaviorIndex: number): string {
  return JSON.stringify([sceneId, entityId, behaviorIndex]);
}

export function sceneScriptSourceKey(sceneId: string, entityId: string, behaviorIndex: number): string {
  return JSON.stringify(["scene", sceneId, entityId, behaviorIndex]);
}

export function prefabScriptSourceKey(prefabId: string, entityId: string, behaviorIndex: number): string {
  return JSON.stringify(["prefab", prefabId, entityId, behaviorIndex]);
}

export interface GameScriptSourceIdentity {
  readonly legacy: boolean;
  readonly kind: "scene" | "prefab";
  readonly scopeId: string;
  readonly entityId: string;
  readonly behaviorIndex: number;
}

/** 2D sources and instance state use triples. 3D sources distinguish scene and prefab scopes. */
export function parseScriptSourceKey(key: unknown): GameScriptSourceIdentity | undefined {
  if (typeof key !== "string") { return undefined; }
  try {
    const value: unknown = JSON.parse(key);
    if (!Array.isArray(value)) { return undefined; }
    const scoped = value.length === 4 && (value[0] === "scene" || value[0] === "prefab");
    if (!scoped && value.length !== 3) { return undefined; }
    const [scopeId, entityId, behaviorIndex] = scoped ? value.slice(1) : value;
    if (typeof scopeId !== "string" || typeof entityId !== "string" || !Number.isInteger(behaviorIndex) || behaviorIndex < 0) {
      return undefined;
    }
    return { legacy: !scoped, kind: scoped && value[0] === "prefab" ? "prefab" : "scene", scopeId, entityId, behaviorIndex };
  } catch {
    return undefined;
  }
}
