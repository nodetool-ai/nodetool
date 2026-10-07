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
