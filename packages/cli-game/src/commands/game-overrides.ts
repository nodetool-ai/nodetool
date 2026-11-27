import { z } from "zod";

/**
 * Test-run overrides applied to the raw document before validation, so the document schema checks every
 * overridden value against its declaration. The file on disk is never changed.
 */

export interface DocumentOverrideOptions {
  /** `name=value` or `entity:name=value`. */
  param?: string[];
  /** Scene to start in instead of `entrySceneId`. */
  scene?: string;
}

export interface ScriptParamOverride {
  readonly entityId?: string;
  readonly name: string;
  readonly value: unknown;
}

/** Parses `--param` values. The value is JSON when it parses as JSON, otherwise a string. */
export function parseParamOverrides(specs: readonly string[]): ScriptParamOverride[] {
  return specs.map((spec) => {
    const equals = spec.indexOf("=");
    if (equals <= 0) { throw new Error(`--param must be name=value or entity:name=value, got ${JSON.stringify(spec)}`); }
    const key = spec.slice(0, equals).trim();
    const raw = spec.slice(equals + 1);
    const colon = key.lastIndexOf(":");
    const entityId = colon > 0 ? key.slice(0, colon) : undefined;
    const name = colon > 0 ? key.slice(colon + 1) : key;
    if (name === "") { throw new Error(`--param ${JSON.stringify(spec)} names no parameter`); }
    let value: unknown = raw;
    try { value = JSON.parse(raw) as unknown; } catch {
      // Not JSON, so the value is the text as written, such as an enum option or an entity id.
    }
    return entityId === undefined ? { name, value } : { entityId, name, value };
  });
}

type JsonObject = Record<string, unknown>;

const entityLike = z.looseObject({ id: z.string(), behaviors: z.array(z.unknown()) });
const sceneList = z.array(z.looseObject({ id: z.string() })).catch([]);

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Visits every entity-like object (an `id` and a `behaviors` array) in scenes, prefabs and nested children. */
function visitEntities(value: unknown, visit: (entity: JsonObject) => void): void {
  if (Array.isArray(value)) {
    for (const item of value) { visitEntities(item, visit); }
    return;
  }
  if (!isObject(value)) { return; }
  if (entityLike.safeParse(value).success) { visit(value); }
  for (const child of Object.values(value)) { visitEntities(child, visit); }
}

/**
 * Returns a copy of the document with the overrides applied. Each `--param` sets the stored value of every script
 * behavior that declares that parameter, or only those on the named entity. A parameter no script declares is an
 * error, so a typo does not run the default silently.
 */
export function applyDocumentOverrides(document: unknown, options: DocumentOverrideOptions): unknown {
  const params = parseParamOverrides(options.param ?? []);
  if (params.length === 0 && options.scene === undefined) { return document; }
  if (!isObject(document)) { throw new Error("Game document must be a JSON object"); }
  const copy = structuredClone(document);
  if (options.scene !== undefined) {
    const ids = sceneList.parse(copy.scenes).map((scene) => scene.id);
    if (!ids.includes(options.scene)) {
      throw new Error(`--scene ${JSON.stringify(options.scene)} is not a scene of this game. Scenes: ${ids.join(", ")}`);
    }
    copy.entrySceneId = options.scene;
  }
  const matches = new Array<number>(params.length).fill(0);
  visitEntities(copy.scenes, (entity) => applyToEntity(entity, params, matches));
  visitEntities(copy.prefabs, (entity) => applyToEntity(entity, params, matches));
  params.forEach((param, index) => {
    if (matches[index] === 0) {
      const where = param.entityId === undefined ? "" : ` on entity ${param.entityId}`;
      throw new Error(`--param ${param.name}: no script${where} declares this parameter`);
    }
  });
  return copy;
}

function applyToEntity(entity: JsonObject, params: readonly ScriptParamOverride[], matches: number[]): void {
  for (const behavior of entity.behaviors as unknown[]) {
    if (!isObject(behavior) || behavior.kind !== "script" || !isObject(behavior.params)) { continue; }
    params.forEach((param, index) => {
      if (param.entityId !== undefined && param.entityId !== entity.id) { return; }
      if (!Object.hasOwn(behavior.params as JsonObject, param.name)) { return; }
      const values = isObject(behavior.values) ? behavior.values : {};
      Object.defineProperty(values, param.name, { value: param.value, writable: true, enumerable: true, configurable: true });
      behavior.values = values;
      matches[index] += 1;
    });
  }
}
