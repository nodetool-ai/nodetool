import { gameScriptParamValueOf, type GameScriptParam, type GameScriptParamValue } from "@nodetool-ai/protocol";

interface ScriptParamBehavior {
  readonly params?: Readonly<Record<string, GameScriptParam>>;
  readonly values?: Readonly<Record<string, GameScriptParamValue>>;
}

export interface ScriptParamReferenceIssue {
  /** Relative to the behavior: the stored value, or the declared default it falls back to. */
  readonly path: readonly string[];
  readonly message: string;
}

/**
 * Checks the entity and asset references a script's params resolve to. `entityExists` is null
 * where entity references cannot resolve at runtime, such as inside a 3D prefab.
 */
export function scriptParamReferenceIssues(behavior: ScriptParamBehavior, entityExists: ((id: string) => boolean) | null,
  assetKind: (slot: string) => string | undefined): ScriptParamReferenceIssue[] {
  const issues: ScriptParamReferenceIssue[] = [];
  for (const [name, param] of Object.entries(behavior.params ?? {})) {
    if (param.type !== "entity" && param.type !== "asset") { continue; }
    const stored = behavior.values !== undefined && Object.hasOwn(behavior.values, name);
    const value = gameScriptParamValueOf(param, stored ? behavior.values?.[name] : undefined);
    if (typeof value !== "string") { continue; }
    const path = stored ? ["values", name] : ["params", name, "default"];
    if (param.type === "entity") {
      if (entityExists === null) {
        issues.push({ path, message: `Script parameter ${name} cannot reference an entity inside a prefab` });
      } else if (!entityExists(value)) {
        issues.push({ path, message: `Script parameter ${name} references missing entity ${value}` });
      }
      continue;
    }
    const kind = assetKind(value);
    if (kind === undefined) {
      issues.push({ path, message: `Script parameter ${name} references missing asset ${value}` });
    } else if (param.kind !== undefined && kind !== param.kind) {
      issues.push({ path, message: `Script parameter ${name} requires a ${param.kind} asset, but ${value} is ${kind}` });
    }
  }
  return issues;
}

export interface ScriptParamsEdit {
  /** Replaces the declarations. Null removes params and values. Values for removed params are dropped. */
  readonly params?: Readonly<Record<string, GameScriptParam>> | null;
  /** Merges stored values. A null value returns that param to its default. */
  readonly values?: Readonly<Record<string, GameScriptParamValue | null>>;
}

/** Applies a `set_script_params` edit to a script behavior. The caller parses the result with the behavior schema. */
export function editScriptParams<Behavior extends ScriptParamBehavior>(behavior: Behavior, edit: ScriptParamsEdit): Record<string, unknown> {
  const { params: previousParams, values: previousValues, ...rest } = behavior;
  const params = edit.params === undefined ? previousParams : edit.params ?? undefined;
  if (params === undefined) {
    if (edit.values && Object.keys(edit.values).length > 0) { return { ...rest, values: edit.values }; }
    return rest;
  }
  const values: Record<string, GameScriptParamValue> = {};
  for (const [name, value] of Object.entries(previousValues ?? {})) {
    if (Object.hasOwn(params, name)) { values[name] = value; }
  }
  for (const [name, value] of Object.entries(edit.values ?? {})) {
    if (value === null) { delete values[name]; }
    else { Object.defineProperty(values, name, { value, writable: true, enumerable: true, configurable: true }); }
  }
  return Object.keys(values).length > 0 ? { ...rest, params, values } : { ...rest, params };
}
