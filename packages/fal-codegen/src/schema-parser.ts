/**
 * OpenAPI schema parser for extracting node information.
 *
 * This module parses OpenAPI schemas to extract input/output definitions,
 * enums, and other metadata needed for code generation.
 *
 * Ported from schema_parser.py (Python) to TypeScript.
 */

import type { EnumDef, FieldDef, NodeSpec } from "./types.js";

type AnyRecord = Record<string, any>;

export class SchemaParser {
  private _rootSchema: AnyRecord = {};

  /**
   * Parse an OpenAPI schema into a node specification.
   */
  parse(openapiSchema: AnyRecord): NodeSpec {
    this._rootSchema = openapiSchema;

    const endpointId = this._extractEndpointId(openapiSchema);
    const inputSchema = this._extractInputSchema(openapiSchema);
    const outputSchema = this._extractOutputSchema(openapiSchema);

    const enums: EnumDef[] = [];

    let inputFields = this._parseProperties(
      (inputSchema["properties"] as AnyRecord | undefined) ?? {},
      (inputSchema["required"] as string[] | undefined) ?? [],
      "input",
      enums
    );
    inputFields = this.normalizeAssetUrlFields(inputFields);
    inputFields = this.normalizeImageUrlsFields(inputFields);

    const outputFields = this._parseProperties(
      (outputSchema["properties"] as AnyRecord | undefined) ?? {},
      (outputSchema["required"] as string[] | undefined) ?? [],
      "output",
      enums
    );

    const outputType = this._determineOutputType(outputSchema, outputFields);
    const className = this.generateClassName(endpointId);

    return {
      endpointId,
      className,
      docstring: "",
      tags: [],
      useCases: [],
      inputFields,
      outputType,
      outputFields,
      enums
    };
  }

  /**
   * Extract endpoint ID from schema metadata or paths fallback.
   */
  private _extractEndpointId(schema: AnyRecord): string {
    try {
      const meta = schema["info"]?.["x-fal-metadata"];
      if (meta?.["endpointId"]) {
        return meta["endpointId"] as string;
      }
    } catch {
      // fall through
    }

    // Fallback: extract from paths
    const paths = (schema["paths"] as AnyRecord | undefined) ?? {};
    for (const path of Object.keys(paths)) {
      if (path.startsWith("/")) {
        return path.replace(/^\//, "");
      }
    }
    return "";
  }

  /**
   * Extract input schema from OpenAPI paths (POST requestBody).
   */
  private _extractInputSchema(schema: AnyRecord): AnyRecord {
    const paths = (schema["paths"] as AnyRecord | undefined) ?? {};
    for (const methods of Object.values(paths)) {
      const post = (methods as AnyRecord)["post"];
      if (!post) continue;

      const requestBody = (post as AnyRecord)["requestBody"] ?? {};
      const content =
        ((requestBody as AnyRecord)["content"] as AnyRecord | undefined) ?? {};
      const appJson =
        (content["application/json"] as AnyRecord | undefined) ?? {};
      const inputSchemaRef = appJson["schema"] as AnyRecord | undefined;

      if (inputSchemaRef) {
        return this._resolveRef(schema, inputSchemaRef);
      }
    }
    return {};
  }

  /**
   * Extract output schema from OpenAPI paths (GET responses).
   */
  private _extractOutputSchema(schema: AnyRecord): AnyRecord {
    const paths = (schema["paths"] as AnyRecord | undefined) ?? {};
    let candidateSchema: AnyRecord = {};

    for (const [path, methods] of Object.entries(paths)) {
      const get = (methods as AnyRecord)["get"];
      if (!get) continue;

      const responses = (get as AnyRecord)["responses"] ?? {};
      const response200 =
        (responses as AnyRecord)["200"] ??
        (responses as AnyRecord)[200] ??
        null;
      if (!response200) continue;

      const content =
        ((response200 as AnyRecord)["content"] as AnyRecord | undefined) ?? {};
      const appJson =
        (content["application/json"] as AnyRecord | undefined) ?? {};
      const outputSchemaRef = appJson["schema"] as AnyRecord | undefined;
      if (!outputSchemaRef) continue;

      const resolved = this._resolveRef(schema, outputSchemaRef);

      // Prefer the /requests/{request_id} path (actual result, not queue status)
      if (path.endsWith("/requests/{request_id}")) {
        return resolved;
      }

      // Otherwise save as candidate if it's not a queue status schema
      if (!this._isQueueStatusSchema(resolved)) {
        candidateSchema = resolved;
      }
    }

    return candidateSchema;
  }

  /**
   * Check if a schema is a queue status schema (not the actual output).
   */
  private _isQueueStatusSchema(schema: AnyRecord): boolean {
    const title = ((schema["title"] as string | undefined) ?? "").toLowerCase();
    if (title === "queuestatus") return true;
    const properties = (schema["properties"] as AnyRecord | undefined) ?? {};
    return "status" in properties && "request_id" in properties;
  }

  /**
   * Resolve $ref references in schema, merging allOf.
   */
  private _resolveRef(schema: AnyRecord, schemaObj: AnyRecord): AnyRecord {
    if (typeof schemaObj !== "object" || schemaObj === null) return {};

    if ("$ref" in schemaObj) {
      const refPath = schemaObj["$ref"] as string;
      if (refPath.startsWith("#/")) {
        const parts = refPath.replace(/^#\//, "").split("/");

        let current: any = schema;
        for (const part of parts) {
          current = (current as AnyRecord)?.[part] ?? {};
        }
        return this._resolveRef(schema, current as AnyRecord);
      }
    }

    // Handle allOf
    if ("allOf" in schemaObj) {
      const merged: AnyRecord = {
        type: "object",
        properties: {},
        required: []
      };
      for (const subSchema of schemaObj["allOf"] as AnyRecord[]) {
        const resolved = this._resolveRef(schema, subSchema);
        if (resolved["properties"]) {
          Object.assign(
            merged["properties"] as AnyRecord,
            resolved["properties"] as AnyRecord
          );
        }
        if (resolved["required"]) {
          (merged["required"] as string[]).push(
            ...(resolved["required"] as string[])
          );
        }
      }
      return merged;
    }

    return schemaObj;
  }

  /**
   * Parse properties into field definitions.
   */
  private _parseProperties(
    properties: AnyRecord,
    required: string[],
    fieldType: "input" | "output",
    enums: EnumDef[]
  ): FieldDef[] {
    const fields: FieldDef[] = [];

    for (const [name, prop] of Object.entries(properties)) {
      // Check if this is a nested asset structure
      const [nestedAssetKey, extraFields] = this._getNestedAssetInfo(
        prop as AnyRecord
      );

      if (nestedAssetKey) {
        // Determine asset type based on the nested key
        let tsType: string;
        let propType: string;
        const keyLower = nestedAssetKey.toLowerCase();
        if (keyLower.includes("video")) {
          tsType = "video";
          propType = "video";
        } else if (keyLower.includes("image")) {
          tsType = "image";
          propType = "image";
        } else if (keyLower.includes("audio")) {
          tsType = "audio";
          propType = "audio";
        } else {
          tsType = "string";
          propType = "str";
        }

        const defaultVal = this._getDefaultValue(
          { type: "asset" },
          propType,
          required.includes(name)
        );

        fields.push({
          name,
          tsType,
          propType,
          default: defaultVal,
          description:
            ((prop as AnyRecord)["description"] as string | undefined) ?? "",
          fieldType,
          required: required.includes(name),
          enumRef: undefined,
          nestedAssetKey
        });

        // Add extra fields from the nested schema
        for (const extra of extraFields) {
          fields.push({
            name: extra.name,
            tsType: extra.tsType,
            propType: extra.propType,
            default: extra.default,
            description: extra.description,
            fieldType,
            required: false,
            enumRef: undefined,
            parentField: name
          });
        }
        continue;
      }

      // Check for enum — either top-level or inside anyOf/oneOf variants
      let enumRef: string | undefined;
      let enumValues: string[] | undefined;
      if ("enum" in (prop as AnyRecord)) {
        enumValues = (prop as AnyRecord)["enum"] as string[];
      } else {
        // Look for enum inside anyOf/oneOf (common FAL pattern:
        // anyOf: [{$ref: "#/.../ImageSize"}, {type: "string", enum: [...]}])
        const variants = ((prop as AnyRecord)["anyOf"] ??
          (prop as AnyRecord)["oneOf"]) as AnyRecord[] | undefined;
        if (variants) {
          for (const variant of variants) {
            if ("enum" in variant) {
              enumValues = variant["enum"] as string[];
              break;
            }
          }
        }
      }
      if (enumValues) {
        const enumName = this._generateEnumName(name);
        const enumDef: EnumDef = {
          name: enumName,
          values: enumValues.map((v) => [
            this.toEnumValue(v),
            v
          ]),
          description:
            ((prop as AnyRecord)["description"] as string | undefined) ?? ""
        };
        enums.push(enumDef);
        enumRef = enumName;
      }

      // Determine TS type
      const { tsType, propType } = this.jsonTypeToTs(
        prop as AnyRecord,
        enumRef,
        name
      );

      // Determine default value
      const defaultVal = this._getDefaultValue(
        prop as AnyRecord,
        propType,
        required.includes(name),
        enumRef
      );

      const propRec = prop as AnyRecord;
      const fieldMin = propRec["minimum"] as number | undefined;
      const fieldMax = propRec["maximum"] as number | undefined;
      fields.push({
        name,
        tsType,
        propType,
        default: defaultVal,
        description: (propRec["description"] as string | undefined) ?? "",
        fieldType,
        required: required.includes(name),
        enumRef,
        enumValues: enumRef ? enumValues : undefined,
        ...(fieldMin !== undefined && { min: fieldMin }),
        ...(fieldMax !== undefined && { max: fieldMax })
      });
    }

    return fields;
  }

  /**
   * Convert JSON schema type to TypeScript type info.
   *
   * Returns both:
   * - tsType: TypeScript type string ("string", "number", "boolean", "image", etc.)
   * - propType: @prop type value ("str", "float", "int", "bool", "image", etc.)
   */
  jsonTypeToTs(
    prop: AnyRecord,
    enumRef: string | undefined,
    propName: string = ""
  ): { tsType: string; propType: string } {
    if (enumRef) {
      return { tsType: "enum", propType: "enum" };
    }

    const jsonType = (prop["type"] as string | undefined) ?? "string";

    if (jsonType === "string") {
      const nameLower = propName.toLowerCase();

      if (nameLower.endsWith("_url") || nameLower.endsWith("_urls")) {
        const descLower = (
          (prop["description"] as string | undefined) ?? ""
        ).toLowerCase();
        const titleLower = (
          (prop["title"] as string | undefined) ?? ""
        ).toLowerCase();

        if (
          nameLower.includes("image") ||
          descLower.includes("image") ||
          titleLower.includes("image")
        ) {
          return { tsType: "image", propType: "image" };
        } else if (
          nameLower.includes("video") ||
          descLower.includes("video") ||
          titleLower.includes("video")
        ) {
          return { tsType: "video", propType: "video" };
        } else if (
          nameLower.includes("audio") ||
          descLower.includes("audio") ||
          titleLower.includes("audio")
        ) {
          return { tsType: "audio", propType: "audio" };
        }
      } else if (nameLower === "image" || nameLower === "mask") {
        return { tsType: "image", propType: "image" };
      } else if (nameLower === "video") {
        return { tsType: "video", propType: "video" };
      } else if (nameLower === "audio") {
        return { tsType: "audio", propType: "audio" };
      }

      return { tsType: "string", propType: "str" };
    } else if (jsonType === "integer") {
      return { tsType: "number", propType: "int" };
    } else if (jsonType === "number") {
      return { tsType: "number", propType: "float" };
    } else if (jsonType === "boolean") {
      return { tsType: "boolean", propType: "bool" };
    } else if (jsonType === "array") {
      const items = (prop["items"] as AnyRecord | undefined) ?? {};

      // Handle $ref in array items (complex object types)
      if ("$ref" in items) {
        const refTypeName = this._resolveRefTypeName(items["$ref"] as string);
        if (refTypeName) {
          return {
            tsType: `${refTypeName}[]`,
            propType: `list[${refTypeName}]`
          };
        }
      }

      const inner = this.jsonTypeToTs(items, undefined, propName);
      return {
        tsType: `${inner.tsType}[]`,
        propType: `list[${inner.propType}]`
      };
    } else if (jsonType === "object") {
      return { tsType: "object", propType: "dict[str, any]" };
    }

    return { tsType: "any", propType: "any" };
  }

  /**
   * Resolve a $ref path to the referenced schema's title.
   */
  private _resolveRefTypeName(refPath: string): string | null {
    if (!refPath.startsWith("#/")) return null;
    const parts = refPath.replace(/^#\//, "").split("/");

    let current: any = this._rootSchema;
    for (const part of parts) {
      current = (current as AnyRecord)?.[part];
      if (!current) return null;
    }
    return ((current as AnyRecord)?.["title"] as string | null) ?? null;
  }

  /**
   * Check if a property references a schema containing an asset URL field.
   *
   * Returns [nestedAssetKey, extraFields] where:
   * - nestedAssetKey: The key for the asset URL inside the nested object
   * - extraFields: List of additional field definitions from the nested schema
   */
  private _getNestedAssetInfo(prop: AnyRecord): [
    string | null,
    Array<{
      name: string;
      tsType: string;
      propType: string;
      default: unknown;
      description: string;
    }>
  ] {
    const resolved = this._resolveRef(this._rootSchema, prop);

    if (!resolved || !("properties" in resolved)) {
      return [null, []];
    }

    const properties = (resolved["properties"] as AnyRecord | undefined) ?? {};
    let nestedAssetKey: string | null = null;
    const extraFields: Array<{
      name: string;
      tsType: string;
      propType: string;
      default: unknown;
      description: string;
    }> = [];

    for (const [key, subProp] of Object.entries(properties)) {
      const keyLower = key.toLowerCase();
      if (keyLower.endsWith("_url")) {
        if (keyLower.includes("video")) {
          nestedAssetKey = key;
        } else if (keyLower.includes("image")) {
          nestedAssetKey = key;
        } else if (keyLower.includes("audio")) {
          nestedAssetKey = key;
        }
      } else {
        // Collect non-asset fields to add as separate node fields
        const subType =
          ((subProp as AnyRecord)["type"] as string | undefined) ?? "string";
        let tsType: string;
        let propType: string;
        let defaultVal: unknown;

        if (subType === "integer") {
          tsType = "number";
          propType = "int";
          defaultVal = 0;
        } else if (subType === "number") {
          tsType = "number";
          propType = "float";
          defaultVal = 0.0;
        } else if (subType === "boolean") {
          tsType = "boolean";
          propType = "bool";
          defaultVal = false;
        } else {
          tsType = "string";
          propType = "str";
          defaultVal = "";
        }

        extraFields.push({
          name: key,
          tsType,
          propType,
          default: defaultVal,
          description:
            ((subProp as AnyRecord)["description"] as string | undefined) ?? ""
        });
      }
    }

    return [nestedAssetKey, extraFields];
  }

  /**
   * Get default value for a field.
   */
  private _getDefaultValue(
    prop: AnyRecord,
    propType: string,
    required: boolean,
    enumName?: string
  ): unknown {
    // Asset refs should always default to empty objects
    if (propType === "image") return null;
    if (propType === "video") return null;
    if (propType === "audio") return null;

    if ("default" in prop) {
      const defaultVal = prop["default"];
      if (typeof defaultVal === "string") {
        // Return raw string value — FAL API expects plain enum values like "none", not "Acceleration.NONE"
        return defaultVal;
      } else if (typeof defaultVal === "boolean") {
        return defaultVal;
      } else if (typeof defaultVal === "number") {
        return defaultVal;
      }
      // null default
      if (defaultVal === null) return null;
    }

    // Generate sensible defaults based on type
    if (propType === "str") return "";
    if (propType === "int") {
      const desc = (
        (prop["description"] as string | undefined) ?? ""
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
   * Determine the output type for the node.
   */
  private _determineOutputType(
    outputSchema: AnyRecord,
    _outputFields: FieldDef[]
  ): string {
    const properties =
      (outputSchema["properties"] as AnyRecord | undefined) ?? {};
    const keys = Object.keys(properties);

    // Single output patterns
    if (keys.length === 1) {
      const propName = keys[0].toLowerCase();
      if (propName.includes("video")) return "video";
      if (propName.includes("image")) return "image";
      if (propName.includes("audio")) return "audio";
      const propSchema = properties[keys[0]] as AnyRecord | undefined;
      if (propSchema?.["type"] === "string") return "str";
      // Single array field (e.g. { values: array }) → dict with one field
      if (propSchema?.["type"] === "array") return "dict";
    }

    // Check for 3D model output fields
    if ("model_glb" in properties || "model_mesh" in properties)
      return "model_3d";

    // Check if video is present (even with other properties)
    if ("video" in properties) return "video";

    // Check if images is present
    if ("images" in properties) return "image";

    // Check if audio is present
    if ("audio" in properties) return "audio";

    // Multiple outputs or dict
    if (keys.length > 1) return "dict";

    return "any";
  }

  /**
   * Generate a PascalCase class name from endpoint ID.
   *
   * The leading vendor segment is dropped (fal-ai, openai, openrouter, …).
   *
   * Examples:
   * - "fal-ai/flux/dev" → "FluxDev"
   * - "fal-ai/luma-dream-machine/image-to-video" → "LumaDreamMachineImageToVideo"
   * - "openai/gpt-image-2" → "GptImage2"
   */
  generateClassName(endpointId: string): string {
    let parts = endpointId.split("/");

    // Drop the vendor segment (fal-ai, openai, openrouter, perceptron, …).
    // FAL endpoint IDs always start with a vendor; including it in the
    // class name produces awkward duplicates like `OpenaiGptImage2`.
    if (parts.length > 1) {
      parts = parts.slice(1);
    }

    const nameParts: string[] = [];
    for (const part of parts) {
      // Replace dots with nothing (v5.6 -> v56)
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
   * Convert a string value to a valid UPPER_SNAKE_CASE enum name.
   *
   * Examples:
   * - "16:9"       → "RATIO_16_9"
   * - "square_hd"  → "SQUARE_HD"
   * - "5"          → "VALUE_5"
   * - "3D Model"   → "MODEL_3D"
   * - "DPM++ 2M"   → "DPM_PLUS_PLUS_2M"
   */
  toEnumValue(value: unknown): string {
    const strValue = String(value);
    // Handle ratios early (before removing colons)
    if (/^\d+:\d+$/.test(strValue.trim())) {
      const replaced = strValue.trim().replace(":", "_");
      return `RATIO_${replaced}`.toUpperCase();
    }

    // Handle numeric values
    if (/^\d+$/.test(strValue.trim())) {
      return `VALUE_${strValue.trim()}`;
    }

    let v = strValue;

    // Replace ++ with _PLUS_PLUS_, + with _PLUS_
    v = v.replace(/\+\+/g, "_PLUS_PLUS_").replace(/\+/g, "_PLUS_");

    // Remove/replace special characters
    v = v
      .replace(/\(/g, "")
      .replace(/\)/g, "")
      .replace(/,/g, "_")
      .replace(/'/g, "")
      .replace(/\u2019/g, "") // right single quotation mark
      .replace(/"/g, "")
      .replace(/!/g, "")
      .replace(/\?/g, "")
      .replace(/&/g, "_AND_")
      .replace(/:/g, "_")
      .replace(/;/g, "_")
      .replace(/#/g, "_")
      .replace(/@/g, "_AT_")
      .replace(/\$/g, "_")
      .replace(/~/g, "_")
      .replace(/`/g, "")
      .replace(/\^/g, "_")
      .replace(/\{/g, "")
      .replace(/\}/g, "")
      .replace(/\[/g, "")
      .replace(/\]/g, "")
      .replace(/\\/g, "_")
      .replace(/\|/g, "_")
      .replace(/=/g, "_")
      .replace(/</g, "_")
      .replace(/>/g, "_");

    // Replace spaces, hyphens, slashes, dots with underscores
    // Use double underscore for slashes
    v = v
      .replace(/\//g, "__")
      .replace(/ /g, "_")
      .replace(/-/g, "_")
      .replace(/\./g, "_");

    // Convert to uppercase
    let result = v.toUpperCase();

    // Collapse multiple underscores and strip leading/trailing underscores
    result = result.replace(/_+/g, "_").replace(/^_|_$/g, "");

    // If starts with a digit, prefix appropriately
    if (result.length > 0 && /^\d/.test(result)) {
      // Try to handle "3D" → "MODEL_3D" pattern
      if (result.includes("D") && result.indexOf("D") < 3) {
        const parts = result.split("_");
        if (parts.length > 1) {
          // Move first part to end
          result = [...parts.slice(1), parts[0]].join("_");
        } else {
          result = `VALUE_${result}`;
        }
      } else {
        result = `VALUE_${result}`;
      }
    }

    // Final safety: ensure result is a valid identifier
    if (!result || /[^A-Za-z0-9_]/.test(result)) {
      result = result.replace(/[^A-Za-z0-9_]/g, "_");
      result = result.replace(/_+/g, "_").replace(/^_|_$/g, "");
      if (!result) result = "VALUE_UNKNOWN";
      if (/^\d/.test(result)) result = `VALUE_${result}`;
    }

    return result;
  }

  /**
   * Normalize asset URL field names for output fields.
   * Maps "image_url" / "video_url" / "audio_url" style fields.
   */
  normalizeAssetUrlFields(fields: FieldDef[]): FieldDef[] {
    return fields.map((f) => {
      const lower = f.name.toLowerCase();
      if (lower.endsWith("_url")) {
        if (lower.includes("image")) {
          // Rename image_url → image (store original as apiParamName)
          const shortName = f.name.replace(/_url$/i, "");
          return {
            ...f,
            name: shortName,
            apiParamName: f.name,
            tsType: "image",
            propType: "image"
          };
        } else if (lower.includes("video")) {
          const shortName = f.name.replace(/_url$/i, "");
          return {
            ...f,
            name: shortName,
            apiParamName: f.name,
            tsType: "video",
            propType: "video"
          };
        } else if (lower.includes("audio")) {
          const shortName = f.name.replace(/_url$/i, "");
          return {
            ...f,
            name: shortName,
            apiParamName: f.name,
            tsType: "audio",
            propType: "audio"
          };
        }
      }
      return f;
    });
  }

  /**
   * Normalize image_urls (plural) style fields.
   */
  normalizeImageUrlsFields(fields: FieldDef[]): FieldDef[] {
    return fields.map((f) => {
      const lower = f.name.toLowerCase();
      if (lower.endsWith("_urls") && lower.includes("image")) {
        const shortName = f.name.replace(/_urls$/i, "s");
        return {
          ...f,
          name: shortName,
          apiParamName: f.name,
          tsType: "image[]",
          propType: "list[image]"
        };
      }
      return f;
    });
  }
}
