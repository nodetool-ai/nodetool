import { z } from "zod";

type Schema = z.core.JSONSchema.JSONSchema;

function schemaType(schema: Schema | boolean, references: ReadonlyMap<string, string>): string {
  if (typeof schema === "boolean") return schema ? "unknown" : "never";
  if (schema.$ref) {
    const name = references.get(schema.$ref);
    if (!name) { throw new Error("Script declarations require local schema references"); }
    return name;
  }
  if (schema.const !== undefined) return JSON.stringify(schema.const);
  if (schema.enum) return schema.enum.map((value) => JSON.stringify(value)).join(" | ");
  const union = schema.anyOf ?? schema.oneOf;
  if (union) return union.map((option) => schemaType(option, references)).join(" | ");
  if (schema.type === "string" || schema.type === "boolean" || schema.type === "null") return schema.type;
  if (schema.type === "number" || schema.type === "integer") return "number";
  if (schema.type === "array") {
    if (schema.prefixItems) return `[${schema.prefixItems.map((item) => schemaType(item, references)).join(", ")}]`;
    if (!schema.items || Array.isArray(schema.items)) throw new Error("Script array declarations require a typed item schema");
    return `Array<${schemaType(schema.items, references)}>`;
  }
  if (schema.type === "object") {
    const required = new Set(schema.required ?? []);
    const properties = Object.entries(schema.properties ?? {}).map(([name, property]) => {
      const key = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : JSON.stringify(name);
      return `${key}${required.has(name) ? "" : "?"}: ${schemaType(property, references)}`;
    });
    if (schema.additionalProperties && schema.additionalProperties !== true) properties.push(`[key: string]: ${schemaType(schema.additionalProperties, references)}`);
    return `{ ${properties.join("; ")} }`;
  }
  throw new Error(`Unsupported script declaration schema type ${String(schema.type)}`);
}

export function gameScriptSchemaDeclaration(name: string, schema: z.ZodType): string {
  const json = z.toJSONSchema(schema, { io: "input" });
  const definitions = Object.entries(json.$defs ?? {});
  const references = new Map(definitions.map(([key], index) => [`#/$defs/${key}`, `${name}Value${index}`]));
  const aliases = definitions.map(([key, value]) => `type ${references.get(`#/$defs/${key}`)} = ${schemaType(value, references)};`);
  return [...aliases, `type ${name} = ${schemaType(json, references)};`].join("\n");
}

/** Additive world declarations, separate from compatibility-pinned input types. */
export function gameScriptWorldDeclaration(entity: string): string {
  return `
type GameScriptWorldEntity = ${entity};
type GameScriptWorldQuery = {
  readonly source?: string;
  readonly tag?: string;
  readonly near?: { readonly x: number; readonly y: number; readonly z?: number };
  readonly radius?: number;
  readonly limit?: number;
};
declare const world: {
  get(id: string): GameScriptWorldEntity | undefined;
  query(options?: GameScriptWorldQuery): string[];
};
`;
}

/** Lifecycle-object script declarations. `input` and `command` name the dimension's input and command types. */
export function gameScriptLifecycleDeclaration(name: string, input: string, command: string): string {
  return `
type ${name}Contact = { otherId: string; phase: "enter" | "stay" | "exit"; sensor: boolean };
type ${name}Result = { state?: unknown; commands?: ${command}[] } | undefined | void;
type ${name}DestroyCommandKind = "hud" | "emit" | "spawn" | "despawn" | "sceneTransition";
/**
 * A script may be an object of hooks instead of a function. Within a tick they run in this order:
 * onStart (first call), onSceneEnter, onTriggerEnter, onTriggerExit and onContact (previous tick's contacts
 * in event order), due timers, then onFixedUpdate or onUpdate. onDestroy runs alone in the tick after a despawn.
 * Each hook sees the state returned by the previous one. Other methods are timer handlers.
 */
type ${name} = {
  onStart?(input: ${input}): ${name}Result;
  onSceneEnter?(input: ${input}): ${name}Result;
  onTriggerEnter?(input: ${input}, contact: ${name}Contact): ${name}Result;
  onTriggerExit?(input: ${input}, contact: ${name}Contact): ${name}Result;
  onContact?(input: ${input}, contact: ${name}Contact): ${name}Result;
  onFixedUpdate?(input: ${input}): ${name}Result;
  onUpdate?(input: ${input}): ${name}Result;
  onDestroy?(input: ${input}): { state?: unknown; commands?: Extract<${command}, { kind: ${name}DestroyCommandKind }>[] } | undefined | void;
  [method: string]: ((input: ${input}, contact: ${name}Contact) => ${name}Result) | undefined;
};
/** Calls the script object's method \`name\` once, \`ticks\` ticks from now. A timer with the same name is replaced. */
declare function after(ticks: number, name: string): void;
/** Calls the script object's method \`name\` every \`ticks\` ticks. A timer with the same name is replaced. */
declare function every(ticks: number, name: string): void;
`;
}
