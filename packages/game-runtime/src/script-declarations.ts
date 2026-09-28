import { z } from "zod";

type Schema = z.core.JSONSchema.JSONSchema;

function schemaType(schema: Schema | boolean): string {
  if (typeof schema === "boolean") return schema ? "unknown" : "never";
  if (schema.$ref) throw new Error("Script declarations require inline schemas");
  if (schema.const !== undefined) return JSON.stringify(schema.const);
  if (schema.enum) return schema.enum.map((value) => JSON.stringify(value)).join(" | ");
  const union = schema.anyOf ?? schema.oneOf;
  if (union) return union.map((option) => schemaType(option)).join(" | ");
  if (schema.type === "string" || schema.type === "boolean" || schema.type === "null") return schema.type;
  if (schema.type === "number" || schema.type === "integer") return "number";
  if (schema.type === "array") {
    if (schema.prefixItems) return `[${schema.prefixItems.map((item) => schemaType(item)).join(", ")}]`;
    if (!schema.items || Array.isArray(schema.items)) throw new Error("Script array declarations require a typed item schema");
    return `Array<${schemaType(schema.items)}>`;
  }
  if (schema.type === "object") {
    const required = new Set(schema.required ?? []);
    const properties = Object.entries(schema.properties ?? {}).map(([name, property]) => {
      const key = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : JSON.stringify(name);
      return `${key}${required.has(name) ? "" : "?"}: ${schemaType(property)}`;
    });
    if (schema.additionalProperties && schema.additionalProperties !== true) properties.push(`[key: string]: ${schemaType(schema.additionalProperties)}`);
    return `{ ${properties.join("; ")} }`;
  }
  throw new Error(`Unsupported script declaration schema type ${String(schema.type)}`);
}

export function gameScriptSchemaDeclaration(name: string, schema: z.ZodType): string {
  return `type ${name} = ${schemaType(z.toJSONSchema(schema, { io: "input" }))};`;
}
