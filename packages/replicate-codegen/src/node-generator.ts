/**
 * Node code generator for Replicate.
 *
 * Generates TypeScript node classes from NodeSpec objects using template literals.
 * Each generated class extends ReplicateNode (alias for BaseNode) and uses @prop() decorators.
 */

import type { NodeSpec, NodeConfig, ModuleConfig, FieldDef } from "./types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Insert a space before each capital letter: "FluxDev" -> "Flux Dev" */
function toTitle(className: string): string {
  return className.replace(/([A-Z])/g, " $1").trim();
}

/** module name used in nodeType: dashes -> dots (matches Python namespace convention) */
function moduleNameToId(moduleName: string): string {
  return moduleName.replace(/-/g, ".");
}

/** Reserved names that collide with process() parameters or JS keywords */
const RESERVED_VAR_NAMES = new Set([
  "inputs",
  "args",
  "res",
  "apiKey",
  "output"
]);

/** Convert a snake_case field name to lowerCamelCase variable name */
function fieldToVarName(name: string): string {
  let varName = name.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
  if (RESERVED_VAR_NAMES.has(varName)) {
    varName = `field_${varName}`;
  }
  return varName;
}

/** Return a cast expression for the given propType */
function castFn(propType: string): string {
  switch (propType) {
    case "int":
    case "float":
      return "Number";
    case "bool":
      return "Boolean";
    default:
      return "String";
  }
}

/** Return a sensible TS default literal for a field default value */
function defaultLiteral(def: unknown, propType: string): string {
  if (def === null || def === undefined) {
    return propType === "bool" ? "false" : '""';
  }
  if (typeof def === "string") return JSON.stringify(def);
  if (typeof def === "boolean") return String(def);
  if (typeof def === "number") return String(def);
  return JSON.stringify(def);
}

/** Build a @prop({...}) decorator string for a field */
function buildPropDecorator(field: FieldDef): string {
  const parts: string[] = [];
  parts.push(`type: ${JSON.stringify(field.propType)}`);

  const defLit = defaultLiteral(field.default, field.propType);
  parts.push(`default: ${defLit}`);

  // enum values (inline array of raw values)
  if (
    field.propType === "enum" &&
    field.enumValues &&
    field.enumValues.length > 0
  ) {
    const vals = field.enumValues.map((v) => JSON.stringify(v)).join(", ");
    parts.push(`values: [${vals}]`);
  }

  if (field.description) {
    const safeDesc = field.description.replace(/`/g, "'");
    parts.push(`description: ${JSON.stringify(safeDesc)}`);
  }

  if (field.min !== undefined) parts.push(`min: ${field.min}`);
  if (field.max !== undefined) parts.push(`max: ${field.max}`);

  return `  @prop({ ${parts.join(", ")} })`;
}

/** Determine what kind of asset a field is based on its propType */
function assetKind(field: FieldDef): "image" | "video" | "audio" | "none" {
  if (field.propType === "image" || field.propType === "list[image]")
    return "image";
  if (field.propType === "video" || field.propType === "list[video]")
    return "video";
  if (field.propType === "audio" || field.propType === "list[audio]")
    return "audio";
  return "none";
}

// ---------------------------------------------------------------------------
// NodeGenerator
// ---------------------------------------------------------------------------

export class NodeGenerator {
  /**
   * Generate a single node class string.
   */
  generate(spec: NodeSpec, moduleName: string, config?: NodeConfig): string {
    if (config) {
      spec = this.applyConfig(spec, config);
    }
    return this._renderClass(spec, moduleName, config);
  }

  /**
   * Generate complete module file with imports, all classes, and exports array.
   */
  generateModule(
    moduleName: string,
    specs: NodeSpec[],
    moduleConfig?: ModuleConfig
  ): string {
    const lines: string[] = [];

    // Imports
    lines.push(
      `import { BaseNode, prop } from "@nodetool-ai/node-sdk";`,
      `import type { NodeClass } from "@nodetool-ai/node-sdk";`,
      `import {`,
      `  getReplicateApiKey,`,
      `  replicateSubmit,`,
      `  removeNulls,`,
      `  isRefSet,`,
      `  assetToUrl,`,
      `  outputToImageRef,`,
      `  outputToVideoRef,`,
      `  outputToAudioRef,`,
      `  outputToString,`,
      `} from "../replicate-base.js";`,
      ``,
      `const ReplicateNode = BaseNode;`,
      ``
    );

    // Apply configs and render classes
    const classNames: string[] = [];
    for (const spec of specs) {
      const endpointConfig = moduleConfig?.configs?.[spec.endpointId];
      const finalSpec = endpointConfig
        ? this.applyConfig({ ...spec }, endpointConfig)
        : spec;
      lines.push(this._renderClass(finalSpec, moduleName, endpointConfig));
      lines.push(``);
      classNames.push(finalSpec.className);
    }

    // Export array (use underscores for valid JS identifier)
    const moduleUpper = moduleName.replace(/[-. ]/g, "_").toUpperCase();
    lines.push(
      `export const REPLICATE_${moduleUpper}_NODES: readonly NodeClass[] = [`,
      ...classNames.map((n) => `  ${n},`),
      `] as const;`
    );

    return lines.join("\n");
  }

  /**
   * Apply config overrides to a NodeSpec (returns new spec, does not mutate).
   */
  applyConfig(spec: NodeSpec, config: NodeConfig): NodeSpec {
    spec = {
      ...spec,
      inputFields: [...spec.inputFields],
      enums: [...spec.enums]
    };

    if (config.className !== undefined) spec.className = config.className;
    if (config.docstring !== undefined) spec.docstring = config.docstring;
    if (config.tags !== undefined) spec.tags = config.tags;
    if (config.useCases !== undefined) spec.useCases = config.useCases;
    if (config.returnType !== undefined) spec.outputType = config.returnType;

    // Enum overrides (rename enum defs)
    const enumRenameMap: Record<string, string> = {};
    if (config.enumOverrides) {
      for (const enumDef of spec.enums) {
        if (config.enumOverrides[enumDef.name]) {
          const oldName = enumDef.name;
          enumDef.name = config.enumOverrides[oldName];
          enumRenameMap[oldName] = enumDef.name;
        }
      }
    }

    // Enum value overrides
    if (config.enumValueOverrides) {
      for (const enumDef of spec.enums) {
        const origName =
          Object.entries(enumRenameMap).find(
            ([, v]) => v === enumDef.name
          )?.[0] ?? enumDef.name;
        const valueMap =
          config.enumValueOverrides[enumDef.name] ??
          config.enumValueOverrides[origName];
        if (valueMap) {
          enumDef.values = enumDef.values.map(([key, val]) => [
            valueMap[key] ?? key,
            val
          ]);
        }
      }
    }

    // Update field references after enum renames
    if (Object.keys(enumRenameMap).length > 0) {
      spec.inputFields = spec.inputFields.map((f) => {
        if (f.enumRef && enumRenameMap[f.enumRef]) {
          return { ...f, enumRef: enumRenameMap[f.enumRef] };
        }
        return f;
      });
    }

    // Field overrides
    if (config.fieldOverrides) {
      spec.inputFields = spec.inputFields.map((f) => {
        const override = config.fieldOverrides![f.name];
        if (!override) return f;
        const merged = { ...f, ...override };
        if (override.enumRef) {
          const enumDef = spec.enums.find((e) => e.name === override.enumRef);
          if (enumDef) {
            merged.enumValues = enumDef.values.map(([, rawVal]) => rawVal);
          }
        }
        return merged;
      });
    }

    return spec;
  }

  // ---------------------------------------------------------------------------
  // Private rendering methods
  // ---------------------------------------------------------------------------

  private _renderClass(
    spec: NodeSpec,
    moduleName: string,
    config?: NodeConfig
  ): string {
    const moduleId = moduleNameToId(moduleName);
    const nodeType = `replicate.${moduleId}.${spec.className}`;
    const title = toTitle(spec.className);

    // Description: first line docstring, second line tags
    const descFirstLine = spec.docstring || `${spec.className} node`;
    const descSecondLine =
      spec.tags.length > 0 ? spec.tags.join(", ") : "replicate, ai";
    const description = `${descFirstLine}\n${descSecondLine}`;

    const lines: string[] = [];
    lines.push(`export class ${spec.className} extends ReplicateNode {`);
    lines.push(`  static readonly nodeType = ${JSON.stringify(nodeType)};`);
    lines.push(`  static readonly title = ${JSON.stringify(title)};`);
    lines.push(
      `  static readonly description = \`${description.replace(/`/g, "'")}\`;`
    );
    lines.push(`  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];`);

    // Output type declaration based on returnType
    const returnType = config?.returnType ?? spec.outputType;
    const outputTypeStr =
      returnType === "image"
        ? "image"
        : returnType === "video"
          ? "video"
          : returnType === "audio"
            ? "audio"
            : returnType === "str"
              ? "str"
              : "any";
    lines.push(`  static readonly metadataOutputTypes = {`);
    lines.push(`    output: ${JSON.stringify(outputTypeStr)}`);
    lines.push(`  };`);
    lines.push(``);

    // Field declarations
    for (const field of spec.inputFields) {
      if (field.parentField) continue;
      lines.push(buildPropDecorator(field));
      lines.push(`  declare ${field.name}: any;`);
      lines.push(``);
    }

    // process() method
    lines.push(...this._renderProcessMethod(spec, config));

    lines.push(`}`);

    return lines.join("\n");
  }

  private _renderProcessMethod(spec: NodeSpec, config?: NodeConfig): string[] {
    const lines: string[] = [];
    lines.push(`  async process(): Promise<Record<string, unknown>> {`);
    lines.push(`    const apiKey = getReplicateApiKey(this._secrets);`);

    // Separate fields by kind
    const assetFields = spec.inputFields.filter(
      (f) => !f.parentField && assetKind(f) !== "none"
    );
    // Exclude internal template fields that break model behavior when sent with defaults
    const EXCLUDED_FIELDS = new Set(["prompt_template"]);
    const scalarFields = spec.inputFields.filter(
      (f) =>
        !f.parentField &&
        assetKind(f) === "none" &&
        !EXCLUDED_FIELDS.has(f.name)
    );

    // 1. Extract scalar fields from instance properties
    for (const field of scalarFields) {
      const varName = fieldToVarName(field.name);
      const defLit = defaultLiteral(field.default, field.propType);
      const cast = castFn(field.propType);
      lines.push(
        `    const ${varName} = ${cast}(this.${field.name} ?? ${defLit});`
      );
    }

    if (scalarFields.length > 0) lines.push(``);

    // 2. Build args object with scalar fields
    lines.push(`    const args: Record<string, unknown> = {`);
    for (const field of scalarFields) {
      const varName = fieldToVarName(field.name);
      const apiName = field.apiParamName ?? field.name;
      lines.push(`      ${JSON.stringify(apiName)}: ${varName},`);
    }
    lines.push(`    };`);

    // 3. Handle asset inputs
    for (const field of assetFields) {
      const varName = fieldToVarName(field.name);
      const apiName = field.apiParamName ?? field.name;

      lines.push(``);
      lines.push(
        `    const ${varName}Ref = this.${field.name} as Record<string, unknown> | undefined;`
      );
      lines.push(`    if (isRefSet(${varName}Ref)) {`);
      lines.push(
        `      const ${varName}Url = await assetToUrl(${varName}Ref!, apiKey);`
      );
      lines.push(
        `      if (${varName}Url) args[${JSON.stringify(apiName)}] = ${varName}Url;`
      );
      lines.push(`    }`);
    }

    lines.push(`    removeNulls(args);`);
    lines.push(``);

    // Submit to Replicate
    lines.push(
      `    const res = await replicateSubmit(apiKey, ${JSON.stringify(spec.endpointId)}, args);`
    );

    // Output handling based on returnType / outputType
    const returnType = config?.returnType ?? spec.outputType;
    switch (returnType) {
      case "image":
        lines.push(`    return { output: outputToImageRef(res.output) };`);
        break;
      case "video":
        lines.push(`    return { output: outputToVideoRef(res.output) };`);
        break;
      case "audio":
        lines.push(`    return { output: outputToAudioRef(res.output) };`);
        break;
      case "str":
        lines.push(`    return { output: outputToString(res.output) };`);
        break;
      default:
        lines.push(`    return { output: res.output };`);
    }

    lines.push(`  }`);
    return lines;
  }
}
