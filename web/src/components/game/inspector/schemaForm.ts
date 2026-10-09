import { z } from "zod";

export interface FieldSchema {
  type?: string;
  enum?: (string | number)[];
  const?: string | number;
  default?: unknown;
  properties?: Record<string, FieldSchema>;
  items?: FieldSchema;
  prefixItems?: FieldSchema[];
  anyOf?: FieldSchema[];
  oneOf?: FieldSchema[];
  required?: string[];
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  minLength?: number;
  minItems?: number;
  maxItems?: number;
  pattern?: string;
  $ref?: string;
  $defs?: Record<string, FieldSchema>;
}

export function gameSchemaFields(schema: z.ZodType): FieldSchema {
  return z.toJSONSchema(schema) as FieldSchema;
}

export function schemaVariant(schema: FieldSchema, value: unknown): FieldSchema {
  const options = schema.oneOf ?? schema.anyOf;
  if (!options?.length) return schema;
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return options.find((option) => Object.entries(option.properties ?? {}).some(([key, child]) => child.const !== undefined && child.const === record[key])) ?? options[0];
}

export function schemaDefault(schema: FieldSchema): unknown {
  if (schema.default !== undefined) return structuredClone(schema.default);
  if (schema.oneOf?.length) return schemaDefault(schema.oneOf[0]);
  if (schema.anyOf?.length) return schemaDefault(schema.anyOf[0]);
  if (schema.const !== undefined) return schema.const;
  if (schema.enum?.length) return schema.enum[0];
  if (schema.type === "boolean") return false;
  if (schema.type === "integer" || schema.type === "number") {
    if (schema.exclusiveMinimum !== undefined) return schema.type === "integer" ? Math.floor(schema.exclusiveMinimum) + 1 : schema.exclusiveMinimum + 1;
    return schema.minimum ?? 0;
  }
  if (schema.type === "string") return schema.pattern === "^#[0-9a-fA-F]{6}$" ? "#ffffff" : schema.minLength ? "New" : "";
  if (schema.type === "array") return Array.from({ length: schema.minItems ?? 0 }, () => schemaDefault(schema.items ?? { type: "string" }));
  if (schema.type === "object" || schema.properties) return Object.fromEntries(Object.entries(schema.properties ?? {})
    .filter(([key]) => schema.required?.includes(key)).map(([key, child]) => [key, schemaDefault(child)]));
  return null;
}
