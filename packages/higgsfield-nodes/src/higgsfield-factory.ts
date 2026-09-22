import { loadPackageAssetJson } from "@nodetool-ai/config";
import { applyContentCardBody, BaseNode, classifyFields, defaultForPropType, propertyOf, registerDeclaredProperty } from "@nodetool-ai/node-sdk";
import type { NodeClass, NodeValue, PropOptions } from "@nodetool-ai/node-sdk";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { higgsfieldAwaitResult, higgsfieldDownloadResult, higgsfieldOutputUrls, higgsfieldSubmit } from "@nodetool-ai/runtime";
import { getCredentials, resolveHiggsfieldMedia } from "./higgsfield-base.js";

export type HiggsfieldFieldType = "str" | "int" | "float" | "bool" | "enum" | "image" | "video" | "audio" | "list[image]" | "list[video]" | "list[audio]";
export interface HiggsfieldField { name: string; type: HiggsfieldFieldType; title?: string; description?: string; default?: unknown; values?: Array<string | number>; min?: number; max?: number; maxItems?: number; required?: boolean; }
export interface HiggsfieldManifestEntry { configVersion: number; modelId: string; className: string; moduleName: string; task: string; outputType: "image" | "video"; outputCardinality?: "single" | "many"; title: string; description: string; sourceUrl: string; schemaFixture: string; pollIntervalMs: number; timeoutSeconds: number; fields: HiggsfieldField[]; }
type Context = ProcessingContext & { storage?: { store?: (key: string, bytes: Uint8Array, mime?: string) => Promise<string> } };
type MediaOutput = { type: "image" | "video"; uri: string; data?: string };
type Output = { output: MediaOutput | MediaOutput[] };

function mime(type: "image" | "video" | "audio"): string { return type === "video" ? "video/mp4" : type === "audio" ? "audio/wav" : "image/png"; }
function outputMime(type: "image" | "video", input: Record<string, NodeValue>): string {
  return type === "video" && input.output_format === "mov" ? "video/quicktime" : mime(type);
}
function scalar(value: NodeValue, type: HiggsfieldFieldType): NodeValue { if (type === "int" && typeof value === "number") return Math.trunc(value); return value; }
function validateNumericRange(value: NodeValue, field: HiggsfieldField): void {
  if (typeof value !== "number") return;
  if (field.min !== undefined && value < field.min) throw new Error(`${field.name} must be at least ${field.min}`);
  if (field.max !== undefined && value > field.max) throw new Error(`${field.name} must be at most ${field.max}`);
}
function isEmptyMediaRef(value: NodeValue): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, NodeValue>;
  return record.uri === "" && record.data === null && record.asset_id === null;
}

export function createHiggsfieldNodeClass(spec: HiggsfieldManifestEntry): NodeClass {
  const Node = class extends BaseNode {
    async process(context?: Context): Promise<Output> {
      const credentials = getCredentials(this._secrets);
      const input: Record<string, NodeValue> = {};
      for (const field of spec.fields) {
        const value = propertyOf(this, field.name);
        if (value === undefined || value === null || value === "" || isEmptyMediaRef(value) || (Array.isArray(value) && value.length === 0 && !field.required)) { if (field.required) throw new Error(`${spec.title}: ${field.name} is required`); continue; }
        if (field.type === "image" || field.type === "video" || field.type === "audio") {
          input[field.name] = await resolveHiggsfieldMedia(value, context, credentials, mime(field.type));
        } else if (field.type === "list[image]" || field.type === "list[video]" || field.type === "list[audio]") {
          if (!Array.isArray(value)) throw new Error(`${spec.title}: ${field.name} must be a list`);
          if (field.maxItems !== undefined && value.length > field.maxItems) throw new Error(`${spec.title}: ${field.name} accepts at most ${field.maxItems} items`);
          input[field.name] = await Promise.all(value.map((item) => resolveHiggsfieldMedia(item, context, credentials, mime(field.type === "list[video]" ? "video" : field.type === "list[audio]" ? "audio" : "image"))));
        } else if (field.type === "enum" && field.values && !field.values.some((allowed) => allowed === value)) {
          throw new Error(`${spec.title}: ${field.name} has an unsupported value`);
        } else {
          const normalized = scalar(value, field.type);
          validateNumericRange(normalized, field);
          input[field.name] = normalized;
        }
      }
      const submission = await higgsfieldSubmit(credentials, spec.modelId, input);
      const result = await higgsfieldAwaitResult(credentials, submission.status_url, { timeoutMs: spec.timeoutSeconds * 1000 });
      const mediaType = spec.outputType;
      const mediaMime = outputMime(mediaType, input);
      const urls = higgsfieldOutputUrls(result);
      if (urls.length === 0) throw new Error(`${spec.title}: completed without a media output`);
      const outputs = await Promise.all(urls.map(async (url, index) => {
        const bytes = await higgsfieldDownloadResult(url);
        if (context?.storage?.store) {
          const uri = await context.storage.store(`higgsfield-${mediaType}-${submission.request_id}-${index}`, bytes, mediaMime);
          return { type: mediaType, uri } satisfies MediaOutput;
        }
        return { type: mediaType, uri: "", data: Buffer.from(bytes).toString("base64") } satisfies MediaOutput;
      }));
      return { output: spec.outputCardinality === "many" ? outputs : outputs[0] };
    }
  };
  Object.defineProperties(Node, {
    name: { value: spec.className }, nodeType: { value: `higgsfield.${spec.moduleName}.${spec.className}` }, title: { value: spec.title }, description: { value: spec.description }, requiredSettings: { value: ["HIGGSFIELD_API_KEY_ID", "HIGGSFIELD_API_KEY_SECRET"] }, autoSaveAsset: { value: true }, metadataOutputTypes: { value: { output: spec.outputCardinality === "many" ? `list[${spec.outputType}]` : spec.outputType } }
  });
  applyContentCardBody(Node);
  const classification = classifyFields(spec.fields.map((field) => ({ name: field.name, propType: field.type })));
  Object.defineProperties(Node, { inlineFields: { value: classification.inlineFields }, inputFields: { value: classification.inputFields } });
  for (const field of spec.fields) {
    const options: PropOptions = { type: field.type, default: Object.prototype.hasOwnProperty.call(field, "default") ? field.default : defaultForPropType(field.type) };
    if (field.title) options.title = field.title;
    if (field.description) options.description = field.description;
    if (field.values) options.values = field.values;
    if (field.min !== undefined) options.min = field.min;
    if (field.max !== undefined) options.max = field.max;
    registerDeclaredProperty(Node, field.name, options);
  }
  return Node as NodeClass;
}

export function loadHiggsfieldNodesFromManifest(manifest: HiggsfieldManifestEntry[]): readonly NodeClass[] { return manifest.map(createHiggsfieldNodeClass); }
export function loadHiggsfieldManifest(): HiggsfieldManifestEntry[] { return loadPackageAssetJson<HiggsfieldManifestEntry[]>({ pkg: "@nodetool-ai/higgsfield-nodes", path: "higgsfield-manifest.json" }, import.meta.url); }
