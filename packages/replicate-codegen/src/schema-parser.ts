/**
 * Replicate schema parser.
 *
 * Parses Replicate's OpenAPI Input schema into NodeSpec objects
 * suitable for code generation.
 */

import type { ReplicateSchema } from "./schema-fetcher.js";
import type { EnumDef, FieldDef, NodeSpec } from "./types.js";

type AnyRecord = Record<string, any>;

export class SchemaParser {
  /**
   * Parse a ReplicateSchema into a NodeSpec.
   */
  parse(schema: ReplicateSchema): NodeSpec {
    const enums: EnumDef[] = [];
    const properties =
      (schema.inputSchema.properties as AnyRecord | undefined) ?? {};
    const required =
      (schema.inputSchema.required as string[] | undefined) ?? [];

    const inputFields = this._parseProperties(properties, required, enums);
    const className = this.generateClassName(schema.modelId);

    return {
      endpointId: `${schema.owner}/${schema.name}:${schema.version}`,
      className,
      docstring: schema.description || "",
      tags: [],
      useCases: [],
      inputFields,
      outputType: "str", // Default; overridden by config.returnType
      outputFields: [],
      enums
    };
  }

  /**
   * Parse properties into field definitions.
   */
  private _parseProperties(
    properties: AnyRecord,
    required: string[],
    enums: EnumDef[]
  ): FieldDef[] {
    const fields: FieldDef[] = [];

    for (const [name, prop] of Object.entries(properties)) {
      const propObj = prop as AnyRecord;

      // Check for enum
      let enumRef: string | undefined;
      if ("enum" in propObj) {
        const enumName = this._generateEnumName(name);
        const rawValues = propObj.enum as unknown[];
        const enumDef: EnumDef = {
          name: enumName,
          values: rawValues.map((v) => [this.toEnumKey(String(v)), String(v)]),
          description: (propObj.description as string | undefined) ?? ""
        };
        enums.push(enumDef);
        enumRef = enumName;
      }

      // Determine types
      const { tsType, propType } = this._jsonTypeToTs(propObj, enumRef, name);

      // Determine default
      const defaultVal = this._getDefaultValue(
        propObj,
        propType,
        required.includes(name)
      );
      const bounds = this._getBounds(propObj, propType);

      fields.push({
        name,
        tsType,
        propType,
        default: defaultVal,
        description: (propObj.description as string | undefined) ?? "",
        fieldType: "input",
        required: required.includes(name),
        enumRef,
        enumValues: enumRef
          ? (propObj.enum as unknown[] | undefined)?.map(String)
          : undefined,
        ...(bounds.min !== undefined && { min: bounds.min }),
        ...(bounds.max !== undefined && { max: bounds.max })
      });
    }

    return fields;
  }

  private _numericValue(value: unknown): number | undefined {
    return typeof value === "number" && Number.isFinite(value)
      ? value
      : undefined;
  }

  private _schemaBound(prop: AnyRecord, keys: string[]): number | undefined {
    for (const key of keys) {
      const value = this._numericValue(prop[key]);
      if (value !== undefined) {
        return value;
      }
    }

    const variants = (prop.anyOf ?? prop.oneOf ?? prop.allOf) as
      | AnyRecord[]
      | undefined;
    if (variants) {
      for (const variant of variants) {
        const value = this._schemaBound(variant, keys);
        if (value !== undefined) {
          return value;
        }
      }
    }
    return undefined;
  }

  private _descriptionText(prop: AnyRecord): string {
    const parts: string[] = [];
    if (typeof prop.description === "string") {
      parts.push(prop.description);
    }
    const variants = (prop.anyOf ?? prop.oneOf ?? prop.allOf) as
      | AnyRecord[]
      | undefined;
    if (variants) {
      for (const variant of variants) {
        const text = this._descriptionText(variant);
        if (text) {
          parts.push(text);
        }
      }
    }
    return parts.join(" ");
  }

  private _descriptionBounds(
    prop: AnyRecord,
    propType: string
  ): { min?: number; max?: number } {
    const text = this._descriptionText(prop).replace(/\s+/g, " ");
    if (!text) {
      return {};
    }

    if (propType === "str") {
      const maxChars = text.match(
        /\bmax(?:imum)?\s+(\d+(?:\.\d+)?)\s+(?:characters|chars)\b/i
      );
      if (maxChars) {
        return { max: Number(maxChars[1]) };
      }
      return {};
    }

    if (propType !== "int" && propType !== "float") {
      return {};
    }

    const minMatch = text.match(/\bminimum\s*:?\s*(-?\d+(?:\.\d+)?)/i);
    const maxMatch = text.match(/\bmaximum\s*:?\s*(-?\d+(?:\.\d+)?)/i);
    if (minMatch || maxMatch) {
      return {
        ...(minMatch ? { min: Number(minMatch[1]) } : {}),
        ...(maxMatch ? { max: Number(maxMatch[1]) } : {})
      };
    }

    const rangeMatch = text.match(
      /\brange\b[^.\n\r]{0,80}?(-?\d+(?:\.\d+)?)\s*(?:-|–|—|to|~|and)\s*(-?\d+(?:\.\d+)?)/i
    );
    if (rangeMatch) {
      return { min: Number(rangeMatch[1]), max: Number(rangeMatch[2]) };
    }

    const betweenMatch = text.match(
      /\bbetween\s+(-?\d+(?:\.\d+)?)\s*(?:-|–|—|to|~|and)\s*(-?\d+(?:\.\d+)?)/i
    );
    if (betweenMatch) {
      return { min: Number(betweenMatch[1]), max: Number(betweenMatch[2]) };
    }

    const bracketMatch = text.match(
      /\[\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\]/i
    );
    if (bracketMatch) {
      return { min: Number(bracketMatch[1]), max: Number(bracketMatch[2]) };
    }

    return {};
  }

  private _getBounds(
    prop: AnyRecord,
    propType: string
  ): { min?: number; max?: number } {
    if (propType === "enum") {
      return {};
    }

    const directMin = this._schemaBound(prop, ["minimum"]);
    const directMax = this._schemaBound(prop, ["maximum"]);
    const lengthMin = this._schemaBound(prop, ["minLength", "minItems"]);
    const lengthMax = this._schemaBound(prop, ["maxLength", "maxItems"]);
    const descriptionBounds = this._descriptionBounds(prop, propType);

    return {
      min: directMin ?? lengthMin ?? descriptionBounds.min,
      max: directMax ?? lengthMax ?? descriptionBounds.max
    };
  }

  /**
   * Map OpenAPI JSON types to TS/prop types.
   */
  private _jsonTypeToTs(
    prop: AnyRecord,
    enumRef: string | undefined,
    propName: string
  ): { tsType: string; propType: string } {
    if (enumRef) {
      return { tsType: "enum", propType: "enum" };
    }

    const jsonType = (prop.type as string | undefined) ?? "string";
    const format = prop.format as string | undefined;

    if (jsonType === "string") {
      // URI format fields are media inputs (image/video/audio)
      if (format === "uri") {
        // Infer media type from field name
        const lower = propName.toLowerCase();
        if (lower.includes("video")) {
          return { tsType: "video", propType: "video" };
        }
        if (
          lower.includes("audio") ||
          lower.includes("sound") ||
          lower.includes("music")
        ) {
          return { tsType: "audio", propType: "audio" };
        }
        // Default URI fields to image (most common in Replicate)
        return { tsType: "image", propType: "image" };
      }
      return { tsType: "string", propType: "str" };
    }

    if (jsonType === "integer") {
      return { tsType: "number", propType: "int" };
    }

    if (jsonType === "number") {
      return { tsType: "number", propType: "float" };
    }

    if (jsonType === "boolean") {
      return { tsType: "boolean", propType: "bool" };
    }

    if (jsonType === "array") {
      const items = (prop.items as AnyRecord | undefined) ?? {};
      const inner = this._jsonTypeToTs(items, undefined, propName);
      return {
        tsType: `${inner.tsType}[]`,
        propType: `list[${inner.propType}]`
      };
    }

    if (jsonType === "object") {
      return { tsType: "object", propType: "dict[str, any]" };
    }

    return { tsType: "any", propType: "any" };
  }

  /**
   * Get default value for a field.
   */
  private _getDefaultValue(
    prop: AnyRecord,
    propType: string,
    required: boolean
  ): unknown {
    // Asset refs default to null
    if (propType === "image" || propType === "video" || propType === "audio") {
      return null;
    }

    if ("default" in prop) {
      const defaultVal = prop.default;
      if (
        typeof defaultVal === "string" ||
        typeof defaultVal === "boolean" ||
        typeof defaultVal === "number"
      ) {
        return defaultVal;
      }
      if (defaultVal === null) return null;
    }

    // Sensible defaults based on type
    if (propType === "str") return "";
    if (propType === "int") {
      const desc = (
        (prop.description as string | undefined) ?? ""
      ).toLowerCase();
      return desc.includes("seed") ? -1 : 0;
    }
    if (propType === "float") return 0.0;
    if (propType === "bool") return false;
    if (propType.startsWith("list")) return [];
    if (required) return "";

    return null;
  }

  /**
   * Generate a PascalCase class name from model ID.
   *
   * "stability-ai/sdxl" → "StabilityAiSdxl"
   * "black-forest-labs/flux-schnell" → "BlackForestLabsFluxSchnell"
   */
  generateClassName(modelId: string): string {
    const parts = modelId.split("/");
    const nameParts: string[] = [];

    for (const part of parts) {
      const cleaned = part.replace(/\./g, "");
      const words = cleaned.split("-");
      nameParts.push(
        ...words.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      );
    }

    return nameParts.join("");
  }

  /**
   * Generate an enum class name from field name (PascalCase).
   */
  private _generateEnumName(fieldName: string): string {
    const words = fieldName.replace(/-/g, "_").split("_");
    return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join("");
  }

  /**
   * Convert a raw enum value to a sanitized UPPER_SNAKE_CASE key.
   *
   * - Replace `-`, `.`, space with `_`
   * - Prepend `_` if starts with digit
   * - Handle special characters (`:`, `+`, etc.)
   */
  toEnumKey(value: string): string {
    const strValue = String(value);

    // Handle ratios: "16:9" → "RATIO_16_9"
    if (/^\d+:\d+$/.test(strValue.trim())) {
      return `RATIO_${strValue.trim().replace(":", "_")}`.toUpperCase();
    }

    // Handle pure numeric: "5" → "VALUE_5"
    if (/^\d+$/.test(strValue.trim())) {
      return `VALUE_${strValue.trim()}`;
    }

    let v = strValue;

    // Replace special sequences
    v = v.replace(/\+\+/g, "_PLUS_PLUS_").replace(/\+/g, "_PLUS_");

    // Remove/replace special characters
    v = v
      .replace(/[()'"!?]/g, "")
      .replace(/&/g, "_AND_")
      .replace(/[:;#@$~^\\|=<>]/g, "_")
      .replace(/\{|\}|\[|\]/g, "")
      .replace(/,/g, "_");

    // Replace separators with underscores
    v = v.replace(/\//g, "__").replace(/[ \-.]/g, "_");

    // Convert to uppercase
    let result = v.toUpperCase();

    // Collapse multiple underscores and strip leading/trailing
    result = result.replace(/_+/g, "_").replace(/^_|_$/g, "");

    // Prepend _ if starts with digit
    if (result.length > 0 && /^\d/.test(result)) {
      result = `_${result}`;
    }

    // Final safety
    if (!result || /[^A-Za-z0-9_]/.test(result)) {
      result = result.replace(/[^A-Za-z0-9_]/g, "_");
      result = result.replace(/_+/g, "_").replace(/^_|_$/g, "");
      if (!result) result = "VALUE_UNKNOWN";
      if (/^\d/.test(result)) result = `_${result}`;
    }

    return result;
  }
}
