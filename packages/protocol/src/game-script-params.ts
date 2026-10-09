import { z } from "zod";

const finite = z.number().finite();
const id = z.string().min(1).max(128);
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const text = { description: z.string().max(512).optional() };

/** Asset kinds a script parameter may require. 2D bindings default to `image`. */
export const GAME_SCRIPT_ASSET_KINDS = ["image", "audio", "font", "model", "collider", "hdri"] as const;

export const gameScriptVectorValue = z.strictObject({ x: finite, y: finite, z: finite.optional() });

/**
 * One inspector-editable script parameter. `entity` names an entity of the same scene and
 * `asset` names a slot in the document's assets. Both resolve to `null` when unset.
 */
export const gameScriptParam = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("number"), ...text, default: finite, minimum: finite.optional(), maximum: finite.optional(), integer: z.boolean().optional() }),
  z.strictObject({ type: z.literal("boolean"), ...text, default: z.boolean() }),
  z.strictObject({ type: z.literal("color"), ...text, default: color }),
  z.strictObject({ type: z.literal("enum"), ...text, options: z.array(z.string().min(1).max(64)).min(1).max(32), default: z.string().min(1).max(64).optional() }),
  z.strictObject({ type: z.literal("entity"), ...text, default: id.optional() }),
  z.strictObject({ type: z.literal("asset"), ...text, kind: z.enum(GAME_SCRIPT_ASSET_KINDS).optional(), default: id.optional() }),
  z.strictObject({ type: z.literal("vector"), ...text, dimensions: z.union([z.literal(2), z.literal(3)]), default: gameScriptVectorValue,
    minimum: finite.optional(), maximum: finite.optional() })
]);

export type GameScriptParam = z.infer<typeof gameScriptParam>;

const paramName = z.string().regex(/^[A-Za-z_][A-Za-z0-9_]{0,63}$/, "Script parameter names must be identifiers of at most 64 characters")
  .refine((name) => !["__proto__", "constructor", "prototype"].includes(name), "Script parameter name is reserved");

export const gameScriptParams = z.record(paramName, gameScriptParam).refine((params) => Object.keys(params).length <= 32, "Script declares more than 32 parameters");

export const gameScriptParamValue = z.union([finite, z.boolean(), id, gameScriptVectorValue]);

export type GameScriptParamValue = z.infer<typeof gameScriptParamValue>;

export const gameScriptParamValues = z.record(paramName, gameScriptParamValue);

/** The value a script reads for one parameter. */
export type GameScriptResolvedParam = GameScriptParamValue | null;

function inRange(value: number, param: { readonly minimum?: number; readonly maximum?: number }): boolean {
  return (param.minimum === undefined || value >= param.minimum) && (param.maximum === undefined || value <= param.maximum);
}

/** Returns why `value` does not fit `param`, or undefined when it fits. References are checked by game validation. */
export function gameScriptParamValueIssue(param: GameScriptParam, value: unknown): string | undefined {
  switch (param.type) {
    case "number":
      if (typeof value !== "number" || !Number.isFinite(value)) { return "must be a number"; }
      if (param.integer && !Number.isInteger(value)) { return "must be an integer"; }
      return inRange(value, param) ? undefined : `must be between ${param.minimum ?? "-∞"} and ${param.maximum ?? "∞"}`;
    case "boolean":
      return typeof value === "boolean" ? undefined : "must be a boolean";
    case "color":
      return typeof value === "string" && color.safeParse(value).success ? undefined : "must be a #rrggbb colour";
    case "enum":
      return typeof value === "string" && param.options.includes(value) ? undefined : `must be one of ${param.options.join(", ")}`;
    case "entity":
    case "asset":
      return typeof value === "string" && id.safeParse(value).success ? undefined : `must be ${param.type === "entity" ? "an entity" : "an asset"} ID`;
    case "vector": {
      const vector = gameScriptVectorValue.safeParse(value);
      if (!vector.success) { return "must be a vector"; }
      if ((param.dimensions === 3) !== (vector.data.z !== undefined)) { return `must have ${param.dimensions} components`; }
      return [vector.data.x, vector.data.y, vector.data.z].every((component) => component === undefined || inRange(component, param))
        ? undefined : `components must be between ${param.minimum ?? "-∞"} and ${param.maximum ?? "∞"}`;
    }
  }
}

/** The authored value of a parameter: its stored value, else its default, else null. */
export function gameScriptParamValueOf(param: GameScriptParam, value: GameScriptParamValue | undefined): GameScriptResolvedParam {
  if (value !== undefined) { return value; }
  if (param.type === "enum") { return param.default ?? param.options[0]; }
  return param.default ?? null;
}

/** The `input.params` object a script receives. */
export function resolveGameScriptParams(params: Readonly<Record<string, GameScriptParam>>,
  values: Readonly<Record<string, GameScriptParamValue>> | undefined): Record<string, GameScriptResolvedParam> {
  return Object.fromEntries(Object.entries(params).map(([name, param]) =>
    [name, gameScriptParamValueOf(param, values && Object.hasOwn(values, name) ? values[name] : undefined)]));
}

/** Checks parameter declarations and stored values together, for the script behavior schema. */
export function refineGameScriptParams(behavior: { readonly params?: Readonly<Record<string, GameScriptParam>>; readonly values?: Readonly<Record<string, unknown>> },
  context: z.core.$RefinementCtx): void {
  const params = behavior.params ?? {};
  for (const [name, param] of Object.entries(params)) {
    if ((param.type === "number" || param.type === "vector") && param.minimum !== undefined && param.maximum !== undefined && param.minimum > param.maximum) {
      context.addIssue({ code: "custom", path: ["params", name, "minimum"], message: "Minimum must not exceed maximum" });
    }
    if (param.type === "enum" && new Set(param.options).size !== param.options.length) {
      context.addIssue({ code: "custom", path: ["params", name, "options"], message: "Enum options must be unique" });
    }
    if (param.default !== undefined) {
      const issue = gameScriptParamValueIssue(param, param.default);
      if (issue) { context.addIssue({ code: "custom", path: ["params", name, "default"], message: `Default ${issue}` }); }
    }
  }
  for (const [name, value] of Object.entries(behavior.values ?? {})) {
    const param = Object.hasOwn(params, name) ? params[name] : undefined;
    if (!param) {
      context.addIssue({ code: "custom", path: ["values", name], message: `Script does not declare parameter ${name}` });
      continue;
    }
    const issue = gameScriptParamValueIssue(param, value);
    if (issue) { context.addIssue({ code: "custom", path: ["values", name], message: `${name} ${issue}` }); }
  }
}
