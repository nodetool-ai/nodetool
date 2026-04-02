/**
 * Node code generator.
 *
 * Generates TypeScript node classes from NodeSpec objects using template literals.
 * Each generated class extends FalNode and uses @prop() decorators.
 */

import type {
  NodeSpec,
  NodeConfig,
  ModuleConfig,
  FieldDef,
  EnumDef
} from "./types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Insert a space before each capital letter: "FluxDev" → "Flux Dev" */
function toTitle(className: string): string {
  return className.replace(/([A-Z])/g, " $1").trim();
}

/** module name used in nodeType: dashes → underscores */
function moduleNameToId(moduleName: string): string {
  return moduleName.replace(/-/g, "_");
}

/** Reserved names that collide with process() parameters or JS keywords */
const RESERVED_VAR_NAMES = new Set([
  "inputs",
  "args",
  "res",
  "apiKey",
  "output"
]);

/** Convert a camelCase/PascalCase fieldName to lowerCamelCase variable name */
function fieldToVarName(name: string): string {
  // snake_case → camelCase
  let varName = name.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
  // Avoid collisions with process() locals
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

  // default value
  const def = field.default;
  const defLit = defaultLiteral(def, field.propType);
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

  return `  @prop({ ${parts.join(", ")} })`;
}

// ---------------------------------------------------------------------------
// Asset handling code snippets
// ---------------------------------------------------------------------------

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

/** True if field is a list of assets */
function isListAsset(field: FieldDef): boolean {
  return (
    field.propType === "list[image]" ||
    field.propType === "list[video]" ||
    field.propType === "list[audio]"
  );
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
    return this._renderClass(spec, moduleName);
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
      `import { BaseNode, prop } from "@nodetool/node-sdk";`,
      `import type { NodeClass } from "@nodetool/node-sdk";`,
      `import {`,
      `  getFalApiKey,`,
      `  falSubmit,`,
      `  removeNulls,`,
      `  isRefSet,`,
      `  assetToFalUrl,`,
      `  imageToDataUrl,`,
      `} from "../fal-base.js";`,
      ``,
      `// Re-export alias`,
      `const FalNode = BaseNode;`,
      ``
    );

    // Apply configs and render classes
    const classNames: string[] = [];
    for (const spec of specs) {
      const endpointConfig = moduleConfig?.configs?.[spec.endpointId];
      const finalSpec = endpointConfig
        ? this.applyConfig({ ...spec }, endpointConfig)
        : spec;
      lines.push(this._renderClass(finalSpec, moduleName));
      lines.push(``);
      classNames.push(finalSpec.className);
    }

    // Export array
    const moduleUpper = moduleNameToId(moduleName).toUpperCase();
    lines.push(
      `export const FAL_${moduleUpper}_NODES: readonly NodeClass[] = [`,
      ...classNames.map((n) => `  ${n},`),
      `] as const;`
    );

    return lines.join("\n");
  }

  /**
   * Apply config overrides to a NodeSpec (returns new spec, does not mutate).
   */
  applyConfig(spec: NodeSpec, config: NodeConfig): NodeSpec {
    // Shallow clone to avoid mutating caller's spec
    spec = {
      ...spec,
      inputFields: [...spec.inputFields],
      enums: [...spec.enums]
    };

    if (config.className !== undefined) spec.className = config.className;
    if (config.docstring !== undefined) spec.docstring = config.docstring;
    if (config.tags !== undefined) spec.tags = config.tags;
    if (config.useCases !== undefined) spec.useCases = config.useCases;

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
        // Check both original and renamed names
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
        // If a new enumRef is set, update enumValues from enums list
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

  private _renderClass(spec: NodeSpec, moduleName: string): string {
    const moduleId = moduleNameToId(moduleName);
    const nodeType = `fal.${moduleId}.${spec.className}`;
    const title = toTitle(spec.className);

    // Description: first line docstring, second line tags
    const descFirstLine = spec.docstring || `${spec.className} node`;
    const descSecondLine =
      spec.tags.length > 0 ? spec.tags.join(", ") : "fal, ai";
    const description = `${descFirstLine}\n${descSecondLine}`;

    const lines: string[] = [];
    lines.push(`export class ${spec.className} extends FalNode {`);
    lines.push(`  static readonly nodeType = ${JSON.stringify(nodeType)};`);
    lines.push(`  static readonly title = ${JSON.stringify(title)};`);
    lines.push(
      `  static readonly description = \`${description.replace(/`/g, "'")}\`;`
    );
    lines.push(`  static readonly requiredSettings = ["FAL_API_KEY"];`);

    // Output type declaration
    if (spec.outputType === "model_3d") {
      lines.push(`  static readonly outputTypes = { output: "model_3d" };`);
    } else if (spec.outputType === "str") {
      lines.push(`  static readonly outputTypes = { output: "str" };`);
    } else if (spec.outputFields.length > 0) {
      // Emit outputTypes for all nodes that have known output fields (dict, any with fields)
      const entries = spec.outputFields
        .map((f) => `${JSON.stringify(f.name)}: ${JSON.stringify(f.propType)}`)
        .join(", ");
      lines.push(`  static readonly outputTypes = { ${entries} };`);
    } else {
      // No known output fields (empty schema or unresolved refs) - emit a generic dict output
      lines.push(`  static readonly outputTypes = { output: "dict" };`);
    }

    lines.push(``);

    // Field declarations
    for (const field of spec.inputFields) {
      if (field.parentField) continue; // skip sub-fields of nested assets
      lines.push(buildPropDecorator(field));
      lines.push(`  declare ${field.name}: any;`);
      lines.push(``);
    }

    // process() method
    lines.push(...this._renderProcessMethod(spec));

    lines.push(`}`);

    return lines.join("\n");
  }

  private _renderProcessMethod(spec: NodeSpec): string[] {
    const lines: string[] = [];
    lines.push(`  async process(): Promise<Record<string, unknown>> {`);
    lines.push(`    const apiKey = getFalApiKey(this._secrets);`);

    // Separate fields by kind
    const assetFields = spec.inputFields.filter(
      (f) => !f.parentField && assetKind(f) !== "none"
    );
    const scalarFields = spec.inputFields.filter(
      (f) => !f.parentField && assetKind(f) === "none"
    );

    // 1. Extract scalar fields
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
      const kind = assetKind(field);
      const varName = fieldToVarName(field.name);
      const apiName = field.apiParamName ?? field.name;

      if (isListAsset(field)) {
        // List of assets
        lines.push(``);
        lines.push(
          `    const ${varName}List = this.${field.name} as Record<string, unknown>[] | undefined;`
        );
        lines.push(`    if (${varName}List?.length) {`);
        lines.push(`      const ${varName}Urls: string[] = [];`);
        lines.push(`      for (const ref of ${varName}List) {`);
        lines.push(
          `        if (isRefSet(ref)) { const u = await assetToFalUrl(apiKey, ref); if (u) ${varName}Urls.push(u); }`
        );
        lines.push(`      }`);
        lines.push(
          `      if (${varName}Urls.length) args[${JSON.stringify(apiName)}] = ${varName}Urls;`
        );
        lines.push(`    }`);
      } else if (field.nestedAssetKey) {
        // Nested asset with extra sub-fields
        const subFields = spec.inputFields.filter(
          (f) => f.parentField === field.name
        );
        lines.push(``);
        lines.push(
          `    const ${varName}Ref = this.${field.name} as Record<string, unknown> | undefined;`
        );
        lines.push(`    if (isRefSet(${varName}Ref)) {`);
        lines.push(
          `      const ${varName}Url = await assetToFalUrl(apiKey, ${varName}Ref!);`
        );
        lines.push(`      if (${varName}Url) {`);
        const nestedObj: string[] = [
          `          ${JSON.stringify(field.nestedAssetKey)}: ${varName}Url,`
        ];
        for (const sub of subFields) {
          const subVar = fieldToVarName(sub.name);
          const subDefLit = defaultLiteral(sub.default, sub.propType);
          nestedObj.push(
            `          ${JSON.stringify(sub.name)}: ${castFn(sub.propType)}((this as any).${sub.name} ?? ${subDefLit}),`
          );
        }
        lines.push(`        args[${JSON.stringify(apiName)}] = {`);
        lines.push(...nestedObj);
        lines.push(`        };`);
        lines.push(`      }`);
        lines.push(`    }`);
      } else {
        // Plain asset
        lines.push(``);
        lines.push(
          `    const ${varName}Ref = this.${field.name} as Record<string, unknown> | undefined;`
        );
        lines.push(`    if (isRefSet(${varName}Ref)) {`);
        if (kind === "image") {
          lines.push(
            `      const ${varName}Url = await imageToDataUrl(${varName}Ref!) ?? await assetToFalUrl(apiKey, ${varName}Ref!);`
          );
        } else {
          lines.push(
            `      const ${varName}Url = await assetToFalUrl(apiKey, ${varName}Ref!);`
          );
        }
        lines.push(
          `      if (${varName}Url) args[${JSON.stringify(apiName)}] = ${varName}Url;`
        );
        lines.push(`    }`);
      }
    }

    lines.push(`    removeNulls(args);`);
    lines.push(``);
    lines.push(
      `    const res = await falSubmit(apiKey, ${JSON.stringify(spec.endpointId)}, args);`
    );

    // Output handling
    switch (spec.outputType) {
      case "image":
        lines.push(
          `    const images = res.images as { url: string }[];`,
          `    return { output: { type: "image", uri: images[0].url } };`
        );
        break;
      case "video":
        lines.push(
          `    return { output: { type: "video", uri: (res.video as any).url } };`
        );
        break;
      case "audio":
        lines.push(
          `    return { output: { type: "audio", uri: (res.audio as any).url } };`
        );
        break;
      case "model_3d": {
        // model_glb takes priority over model_mesh; extract the URL from the File ref
        lines.push(
          `    const model3dRef = (res as any).model_glb ?? (res as any).model_mesh;`,
          `    return { output: { type: "model_3d", uri: model3dRef?.url ?? "" } };`
        );
        break;
      }
      case "str":
        lines.push(`    return { output: (res as any).output ?? "" };`);
        break;
      case "dict":
        if (spec.outputFields.length > 0) {
          // Known output fields - pass response through so keys match declared outputTypes
          lines.push(`    return res as Record<string, unknown>;`);
        } else {
          // No known fields - wrap entire response as "output" dict
          lines.push(`    return { output: res };`);
        }
        break;
      case "any":
        if (spec.outputFields.length > 0) {
          // Known output fields - pass response through directly
          lines.push(`    return res as Record<string, unknown>;`);
        } else {
          // Unknown output schema - wrap as dict
          lines.push(`    return { output: res };`);
        }
        break;
      default:
        lines.push(`    return { output: res };`);
    }

    lines.push(`  }`);
    return lines;
  }

  /**
   * Select up to 5 basic fields by priority heuristic.
   */
  selectBasicFields(spec: NodeSpec): string[] {
    type Candidate = { priority: number; index: number; name: string };
    const candidates: Candidate[] = [];

    for (let i = 0; i < spec.inputFields.length; i++) {
      const field = spec.inputFields[i];
      if (field.parentField) continue;
      const nameLower = field.name.toLowerCase();
      const kind = assetKind(field);

      if (kind !== "none" && !isListAsset(field)) {
        // P0: primary named assets
        if (["image", "video", "audio", "mask"].includes(nameLower)) {
          candidates.push({ priority: 0, index: i, name: field.name });
        } else {
          candidates.push({ priority: 1, index: i, name: field.name });
        }
      } else if (
        field.propType === "str" &&
        (nameLower.includes("prompt") || nameLower.includes("text"))
      ) {
        candidates.push({ priority: 2, index: i, name: field.name });
      } else if (
        field.propType === "enum" &&
        field.name.match(/resolution|aspect_ratio|duration/i)
      ) {
        candidates.push({ priority: 3, index: i, name: field.name });
      } else if (
        ["int", "float", "bool"].includes(field.propType) &&
        !nameLower.match(/seed$|_id$|_key$|_steps$|_batch$/)
      ) {
        candidates.push({ priority: 4, index: i, name: field.name });
      }
    }

    candidates.sort((a, b) =>
      a.priority !== b.priority ? a.priority - b.priority : a.index - b.index
    );

    return candidates.slice(0, 5).map((c) => c.name);
  }
}
