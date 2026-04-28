/**
 * Node code generator for Kie.ai models.
 *
 * Generates TypeScript node classes from NodeConfig definitions.
 * Each class extends BaseNode and calls Kie.ai API via shared helpers.
 */

import type { NodeConfig, ModuleConfig, FieldDef } from "./types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toTitle(className: string): string {
  return className.replace(/([A-Z])/g, " $1").trim();
}

function castFn(type: string): string {
  switch (type) {
    case "int":
    case "float":
      return "Number";
    case "bool":
      return "Boolean";
    default:
      return "String";
  }
}

function defaultLiteral(def: unknown, type: string): string {
  if (def === null || def === undefined) {
    return type === "bool" ? "false" : '""';
  }
  if (typeof def === "string") return JSON.stringify(def);
  if (typeof def === "boolean") return String(def);
  if (typeof def === "number") return String(def);
  return JSON.stringify(def);
}

function fieldToVarName(name: string): string {
  const reserved = new Set(["apiKey", "result", "params", "args"]);
  let varName = name.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
  if (reserved.has(varName)) varName = `field_${varName}`;
  return varName;
}

function isAssetType(type: string): boolean {
  return ["image", "audio", "video", "list[image]"].includes(type);
}

// ---------------------------------------------------------------------------
// Generator
// ---------------------------------------------------------------------------

export class KieNodeGenerator {
  generateModule(config: ModuleConfig): string {
    const lines: string[] = [];

    // Imports
    lines.push(
      `import { BaseNode, prop } from "@nodetool/node-sdk";`,
      `import type { NodeClass } from "@nodetool/node-sdk";`,
      `import {`,
      `  getApiKey,`,
      `  kieExecuteTask,`,
      ...(config.nodes.some((n) => n.useSuno) ? [`  kieExecuteSunoTask,`] : []),
      `  isRefSet,`,
      ...(config.nodes.some((n) => n.uploads?.some((u) => u.kind === "image"))
        ? [`  uploadImageInput,`]
        : []),
      ...(config.nodes.some((n) => n.uploads?.some((u) => u.kind === "audio"))
        ? [`  uploadAudioInput,`]
        : []),
      ...(config.nodes.some((n) => n.uploads?.some((u) => u.kind === "video"))
        ? [`  uploadVideoInput,`]
        : []),
      `} from "../kie-base.js";`,
      ``
    );

    // Node classes
    const classNames: string[] = [];
    for (const node of config.nodes) {
      lines.push(this._renderClass(node, config.moduleName, config));
      lines.push(``);
      classNames.push(`${node.className}Node`);
    }

    // Export array
    const moduleUpper = config.moduleName.replace(/-/g, "_").toUpperCase();
    lines.push(
      `export const KIE_${moduleUpper}_NODES: readonly NodeClass[] = [`,
      ...classNames.map((n) => `  ${n},`),
      `] as const;`
    );

    return lines.join("\n");
  }

  private _renderClass(
    node: NodeConfig,
    moduleName: string,
    moduleConfig: ModuleConfig
  ): string {
    const fullClassName = `${node.className}Node`;
    const nodeType = `kie.${moduleName}.${node.className}`;
    const title = node.title || toTitle(node.className);
    const description = node.description.replace(/`/g, "'");
    const pollInterval =
      node.pollInterval ?? moduleConfig.defaultPollInterval ?? 2000;
    const maxAttempts =
      node.maxAttempts ?? moduleConfig.defaultMaxAttempts ?? 300;

    const lines: string[] = [];
    lines.push(`export class ${fullClassName} extends BaseNode {`);
    lines.push(`  static readonly nodeType = ${JSON.stringify(nodeType)};`);
    lines.push(`  static readonly title = ${JSON.stringify(title)};`);
    lines.push(`  static readonly description = \`${description}\`;`);
    lines.push(
      `  static readonly metadataOutputTypes = { output: ${JSON.stringify(node.outputType)} };`
    );
    lines.push(`  static readonly requiredSettings = ["KIE_API_KEY"];`);
    lines.push(`  static readonly exposeAsTool = true;`);
    lines.push(``);

    // Custom fields
    for (const field of node.fields) {
      lines.push(this._renderProp(field));
      lines.push(`  declare ${field.name}: any;`);
      lines.push(``);
    }

    // Process method
    lines.push(...this._renderProcess(node, pollInterval, maxAttempts));

    lines.push(`}`);
    return lines.join("\n");
  }

  private _renderProp(field: FieldDef): string {
    const parts: string[] = [];
    parts.push(
      `type: ${JSON.stringify(field.type === "list[image]" ? "list[image]" : field.type)}`
    );
    if (field.default !== undefined) {
      if (isAssetType(field.type) && typeof field.default === "object") {
        parts.push(`default: ${JSON.stringify(field.default)}`);
      } else {
        parts.push(`default: ${defaultLiteral(field.default, field.type)}`);
      }
    } else {
      parts.push(`default: ${field.type === "bool" ? "false" : '""'}`);
    }
    if (field.values?.length) {
      parts.push(`values: ${JSON.stringify(field.values)}`);
    }
    if (field.title) parts.push(`title: ${JSON.stringify(field.title)}`);
    if (field.description)
      parts.push(
        `description: ${JSON.stringify(field.description.replace(/`/g, "'"))}`
      );
    if (field.min !== undefined) parts.push(`min: ${field.min}`);
    if (field.max !== undefined) parts.push(`max: ${field.max}`);
    return `  @prop({ ${parts.join(", ")} })`;
  }

  private _renderProcess(
    node: NodeConfig,
    pollInterval: number,
    maxAttempts: number
  ): string[] {
    const lines: string[] = [];
    lines.push(`  async process(): Promise<Record<string, unknown>> {`);
    lines.push(`    const apiKey = getApiKey(this._secrets);`);

    // Validation
    if (node.validation) {
      for (const v of node.validation) {
        if (v.rule === "not_empty") {
          const msg = v.message ?? `${v.field} cannot be empty`;
          lines.push(
            `    if (!String(this.${v.field} ?? "").trim()) throw new Error(${JSON.stringify(msg)});`
          );
        }
      }
    }

    // Upload assets
    const uploadVars: Record<string, string> = {};
    if (node.uploads) {
      // Group uploads by groupKey
      const groups = new Map<string, typeof node.uploads>();
      const ungrouped: typeof node.uploads = [];
      for (const upload of node.uploads) {
        if (upload.groupKey) {
          if (!groups.has(upload.groupKey)) groups.set(upload.groupKey, []);
          groups.get(upload.groupKey)!.push(upload);
        } else {
          ungrouped.push(upload);
        }
      }

      // Emit grouped uploads (multiple fields → one array param)
      for (const [, groupUploads] of groups) {
        const paramName = groupUploads[0].paramName ?? "image_urls";
        const arrayVar = fieldToVarName(paramName);
        const uploadFn =
          groupUploads[0].kind === "image"
            ? "uploadImageInput"
            : groupUploads[0].kind === "audio"
              ? "uploadAudioInput"
              : "uploadVideoInput";
        lines.push(`    const ${arrayVar}: string[] = [];`);
        lines.push(
          `    for (const img of [${groupUploads.map((u) => `this.${u.field}`).join(", ")}]) {`
        );
        lines.push(
          `      if (isRefSet(img)) ${arrayVar}.push(await ${uploadFn}(apiKey, img));`
        );
        lines.push(`    }`);
        uploadVars[paramName] = arrayVar;
      }

      // Emit ungrouped uploads (single field → single param)
      for (const upload of ungrouped) {
        const uploadFn =
          upload.kind === "image"
            ? "uploadImageInput"
            : upload.kind === "audio"
              ? "uploadAudioInput"
              : "uploadVideoInput";

        if (upload.isList) {
          const listVar = `${fieldToVarName(upload.field)}Urls`;
          lines.push(`    const ${listVar}: string[] = [];`);
          lines.push(
            `    const ${fieldToVarName(upload.field)}List = Array.isArray(this.${upload.field}) ? this.${upload.field} : [];`
          );
          lines.push(
            `    for (const item of ${fieldToVarName(upload.field)}List) {`
          );
          lines.push(
            `      if (isRefSet(item)) ${listVar}.push(await ${uploadFn}(apiKey, item));`
          );
          lines.push(`    }`);
          uploadVars[upload.paramName ?? `${upload.field}_urls`] = listVar;
        } else {
          const varName = `${fieldToVarName(upload.field)}Url`;
          lines.push(`    let ${varName} = "";`);
          lines.push(
            `    if (isRefSet(this.${upload.field})) ${varName} = await ${uploadFn}(apiKey, this.${upload.field});`
          );
          uploadVars[upload.paramName ?? `${upload.field}_url`] = varName;
        }
      }
    }

    // Build params
    lines.push(`    const params: Record<string, unknown> = {};`);

    // Scalar fields
    for (const field of node.fields) {
      if (isAssetType(field.type)) continue; // handled by uploads
      const paramName = node.paramNames?.[field.name] ?? field.name;
      const cast = castFn(field.type);
      const defLit = defaultLiteral(field.default, field.type);

      // Check if conditional
      const conditional = node.conditionalFields?.find(
        (c) => c.field === field.name
      );
      if (conditional) {
        const val = `${cast}(this.${field.name} ?? ${defLit})`;
        if (conditional.condition === "gte_zero") {
          lines.push(
            `    if (${val} >= 0) params[${JSON.stringify(paramName)}] = ${val};`
          );
        } else if (conditional.condition === "truthy") {
          lines.push(
            `    if (this.${field.name}) params[${JSON.stringify(paramName)}] = ${val};`
          );
        } else {
          lines.push(`    params[${JSON.stringify(paramName)}] = ${val};`);
        }
      } else {
        lines.push(
          `    params[${JSON.stringify(paramName)}] = ${cast}(this.${field.name} ?? ${defLit});`
        );
      }
    }

    // Add upload vars to params
    for (const [paramName, varName] of Object.entries(uploadVars)) {
      lines.push(
        `    if (${varName}${varName.endsWith("Urls") ? ".length" : ""}) params[${JSON.stringify(paramName)}] = ${varName};`
      );
    }

    lines.push(``);

    // Execute
    if (node.useSuno) {
      lines.push(
        `    const result = await kieExecuteSunoTask(apiKey, params, ${pollInterval}, ${maxAttempts});`
      );
    } else {
      lines.push(
        `    const result = await kieExecuteTask(apiKey, ${JSON.stringify(node.modelId)}, params, ${pollInterval}, ${maxAttempts});`
      );
    }
    lines.push(
      `    return { output: { type: ${JSON.stringify(node.outputType)}, data: result.data } };`
    );
    lines.push(`  }`);
    return lines;
  }
}
