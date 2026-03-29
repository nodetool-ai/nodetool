/**
 * Parser for Python package metadata JSON.
 *
 * Converts the nodetool-replicate package_metadata JSON format into
 * NodeSpec objects suitable for code generation, without requiring
 * API access to Replicate.
 */

import type { EnumDef, FieldDef, NodeSpec } from "./types.js";
import { SchemaParser } from "./schema-parser.js";

 
type AnyRecord = Record<string, any>;

/** A single node entry from the Python metadata JSON. */
export interface MetadataNodeEntry {
  title: string;
  description: string;
  namespace: string;
  node_type: string;
  properties: MetadataProperty[];
  outputs: MetadataOutput[];
  the_model_info?: AnyRecord;
  basic_fields?: string[];
}

interface MetadataProperty {
  name: string;
  type: { type: string; values?: string[]; optional?: boolean; type_args?: unknown[] };
  default: unknown;
  title: string;
  description: string;
  min?: number;
  max?: number;
}

interface MetadataOutput {
  type: { type: string; type_args?: unknown[] };
  name: string;
}

/** Top-level structure of the package metadata JSON. */
export interface PackageMetadata {
  name: string;
  description: string;
  version: string;
  nodes: MetadataNodeEntry[];
}

/**
 * Map Python metadata type strings to propType / tsType pairs.
 */
function mapType(typeStr: string): { tsType: string; propType: string } {
  switch (typeStr) {
    case "str":
      return { tsType: "string", propType: "str" };
    case "int":
      return { tsType: "number", propType: "int" };
    case "float":
      return { tsType: "number", propType: "float" };
    case "bool":
      return { tsType: "boolean", propType: "bool" };
    case "image":
      return { tsType: "image", propType: "image" };
    case "video":
      return { tsType: "video", propType: "video" };
    case "audio":
      return { tsType: "audio", propType: "audio" };
    case "enum":
      return { tsType: "enum", propType: "enum" };
    default:
      return { tsType: "any", propType: "any" };
  }
}

export class MetadataParser {
  private schemaParser = new SchemaParser();

  /**
   * Parse a single metadata node entry into a NodeSpec.
   */
  parseNode(entry: MetadataNodeEntry): NodeSpec {
    const enums: EnumDef[] = [];
    const inputFields = this._parseProperties(entry.properties, enums);

    // Derive className from node_type (last segment)
    const className = entry.node_type.split(".").pop()!;

    // Derive modelId from the_model_info
    const owner = entry.the_model_info?.owner as string | undefined;
    const name = entry.the_model_info?.name as string | undefined;
    const modelId = owner && name ? `${owner}/${name}` : "";

    // Determine output type from first output
    const outputTypeStr =
      entry.outputs?.[0]?.type?.type ?? "str";
    const { propType: outputType } = mapType(outputTypeStr);

    return {
      endpointId: modelId, // Will be matched to config key
      className,
      docstring: entry.description || "",
      tags: [],
      useCases: [],
      inputFields,
      outputType,
      outputFields: [],
      enums,
    };
  }

  /**
   * Parse all nodes from the metadata JSON, grouped by module name.
   *
   * Module name is derived from namespace by stripping the "replicate." prefix
   * and replacing dots with dashes: "replicate.image.generate" → "image-generate"
   */
  parseAll(metadata: PackageMetadata): Map<string, NodeSpec[]> {
    const modules = new Map<string, NodeSpec[]>();

    for (const entry of metadata.nodes) {
      const moduleName = this._namespaceToModuleName(entry.namespace);
      const spec = this.parseNode(entry);

      let specs = modules.get(moduleName);
      if (!specs) {
        specs = [];
        modules.set(moduleName, specs);
      }
      // Deduplicate by className within a module (Python metadata can have
      // duplicate entries for the same model, e.g. kandinsky-2.2)
      if (!specs.some((s) => s.className === spec.className)) {
        specs.push(spec);
      }
    }

    return modules;
  }

  /**
   * Convert namespace to module name.
   * "replicate.image.generate" → "image-generate"
   */
  private _namespaceToModuleName(namespace: string): string {
    const stripped = namespace.replace(/^replicate\./, "");
    return stripped.replace(/\./g, "-");
  }

  /**
   * Parse metadata properties into FieldDef[].
   */
  private _parseProperties(
    properties: MetadataProperty[],
    enums: EnumDef[],
  ): FieldDef[] {
    const fields: FieldDef[] = [];

    for (const prop of properties) {
      const typeStr = prop.type.type;

      let enumRef: string | undefined;
      let enumValues: string[] | undefined;

      // Handle enum type
      if (typeStr === "enum" && prop.type.values) {
        const enumName = this._generateEnumName(prop.name);
        const rawValues = prop.type.values;
        const enumDef: EnumDef = {
          name: enumName,
          values: rawValues.map((v) => [
            this.schemaParser.toEnumKey(String(v)),
            String(v),
          ]),
          description: prop.description ?? "",
        };
        enums.push(enumDef);
        enumRef = enumName;
        enumValues = rawValues.map(String);
      }

      const { tsType, propType } = enumRef
        ? { tsType: "enum", propType: "enum" }
        : mapType(typeStr);

      // Determine default value
      const defaultVal = this._getDefault(prop.default, propType, prop.type.optional);

      fields.push({
        name: prop.name,
        tsType,
        propType,
        default: defaultVal,
        description: prop.description ?? "",
        fieldType: "input",
        required: !prop.type.optional,
        enumRef,
        enumValues,
      });
    }

    return fields;
  }

  /**
   * Get a suitable default value.
   */
  private _getDefault(
    rawDefault: unknown,
    propType: string,
    optional?: boolean,
  ): unknown {
    // Asset refs always default to null
    if (propType === "image" || propType === "video" || propType === "audio") {
      return null;
    }

    // If the metadata provides an explicit default, use it (but handle object refs)
    if (rawDefault !== undefined && rawDefault !== null) {
      if (typeof rawDefault === "object" && !Array.isArray(rawDefault)) {
        // Object defaults (like image refs) → null
        return null;
      }
      return rawDefault;
    }

    if (optional) return null;

    // Sensible defaults by type
    if (propType === "str") return "";
    if (propType === "int") return 0;
    if (propType === "float") return 0.0;
    if (propType === "bool") return false;

    return null;
  }

  /**
   * Generate PascalCase enum name from field name.
   */
  private _generateEnumName(fieldName: string): string {
    const words = fieldName.replace(/-/g, "_").split("_");
    return words
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join("");
  }
}
