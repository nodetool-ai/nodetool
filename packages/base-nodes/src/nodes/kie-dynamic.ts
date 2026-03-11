/**
 * Dynamic Kie.ai node that creates inputs/outputs from pasted API documentation.
 */
import { BaseNode, prop } from "@nodetool/node-sdk";
import type { NodeClass } from "@nodetool/node-sdk";
import { getApiKey, kieExecuteTask } from "./kie-base.js";

interface KieParamInfo {
  name: string;
  type: string;
  required: boolean;
  description: string;
  default?: unknown;
  options?: string[];
  minVal?: number;
  maxVal?: number;
  isFileUrl: boolean;
  isFileUrlArray: boolean;
  acceptedFileTypes: string[];
}

interface KieSchemaBundle {
  modelId: string;
  params: KieParamInfo[];
  outputType: string; // "image" | "video" | "audio"
}

const HIDDEN_PARAMS = new Set(["upload_method", "callBackUrl", "callback_url"]);

function extractModelId(text: string): string | null {
  let m = text.match(/\*\*Format\*\*\s*\|\s*`([^`]+)`/);
  if (m) return m[1].trim();
  m = text.match(/[Mm]odel\s+name,?\s*format:\s*`([^`]+)`/);
  if (m) return m[1].trim();
  m = text.match(/"model"\s*:\s*"([^"]+)"/);
  if (m) return m[1].trim();
  return null;
}

function inferOutputType(modelId: string, _text: string): string {
  const lower = modelId.toLowerCase();
  const videoKws = ["video", "storyboard", "avatar", "seedance", "kling", "hailuo", "sora", "wan", "infinitalk"];
  if (videoKws.some((kw) => lower.includes(kw))) return "video";
  const audioKws = ["audio", "music", "suno", "speech", "tts"];
  if (audioKws.some((kw) => lower.includes(kw))) return "audio";
  return "image";
}

function parseInputParams(text: string): KieParamInfo[] {
  const sectionMatch = text.match(
    /###\s*input\s+Object\s+Parameters(.*?)(?=\n##\s|\n---|$)/is
  );
  if (!sectionMatch) return [];
  const section = sectionMatch[1];
  const blocks = section.split(/\n####\s+/);
  const params: KieParamInfo[] = [];

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;
    const nameMatch = trimmed.match(/^(\w+)/);
    if (!nameMatch) continue;
    const name = nameMatch[1];
    if (HIDDEN_PARAMS.has(name)) continue;

    const typeMatch = trimmed.match(/\*\*Type\*\*:\s*`([^`]+)`/);
    const paramType = typeMatch ? typeMatch[1].trim() : "string";

    const reqMatch = trimmed.match(/\*\*Required\*\*:\s*(Yes|No)/i);
    const required = reqMatch ? reqMatch[1].toLowerCase() === "yes" : false;

    const descMatch = trimmed.match(/\*\*Description\*\*:\s*(.+?)(?=\n\s*-\s*\*\*|$)/s);
    const description = descMatch ? descMatch[1].trim() : "";

    let defaultVal: unknown = undefined;
    const defMatch = trimmed.match(/\*\*Default Value\*\*:\s*`([^`]*)`/);
    if (defMatch) defaultVal = coerceDefault(defMatch[1], paramType);

    let options: string[] | undefined;
    const optMatch = trimmed.match(/\*\*Options\*\*:\s*\n((?:\s*-\s*`[^`]+`.*\n?)+)/);
    if (optMatch) {
      options = [...optMatch[1].matchAll(/`([^`]+)`/g)].map((m) => m[1]);
    }

    let minVal: number | undefined;
    let maxVal: number | undefined;
    const rangeMatch = trimmed.match(/\*\*Range\*\*:\s*`(\d+)`\s*to\s*`(\d+)`/);
    if (rangeMatch) {
      minVal = Number(rangeMatch[1]);
      maxVal = Number(rangeMatch[2]);
    }

    let isFileUrl = false;
    let isFileUrlArray = false;
    const acceptedFileTypes: string[] = [];
    const ftMatch = trimmed.match(/\*\*Accepted File Types\*\*:\s*(.+)/);
    if (ftMatch) acceptedFileTypes.push(...ftMatch[1].split(",").map((t) => t.trim()));

    if (acceptedFileTypes.length || description.includes("Upload") || description.includes("URL")) {
      if (paramType === "array") isFileUrlArray = true;
      else isFileUrl = true;
    }
    if (name.endsWith("_url") && paramType === "string") isFileUrl = true;
    if (name.endsWith("_urls") && paramType === "array") isFileUrlArray = true;

    params.push({
      name,
      type: paramType,
      required,
      description,
      default: defaultVal,
      options,
      minVal,
      maxVal,
      isFileUrl,
      isFileUrlArray,
      acceptedFileTypes,
    });
  }
  return params;
}

function coerceDefault(raw: string, paramType: string): unknown {
  if (paramType === "integer") { const n = parseInt(raw, 10); return isNaN(n) ? raw : n; }
  if (paramType === "number") { const n = parseFloat(raw); return isNaN(n) ? raw : n; }
  if (paramType === "boolean") return ["true", "1", "yes"].includes(raw.toLowerCase());
  try { return JSON.parse(raw); } catch { return raw; }
}

function parseKieDocs(text: string): KieSchemaBundle {
  const modelId = extractModelId(text);
  if (!modelId) throw new Error("Could not find model ID in documentation");
  return {
    modelId,
    params: parseInputParams(text),
    outputType: inferOutputType(modelId, text),
  };
}

export class KieAINode extends BaseNode {
  static readonly nodeType = "kie.dynamic_schema.KieAI";
            static readonly title = "Kie AI";
            static readonly description = "Dynamic Kie.ai node for running any kie.ai model.\n    kie, dynamic, schema, api, inference, runtime, model\n\n    Use cases:\n    - Call any kie.ai model without a dedicated Python node\n    - Prototype workflows with new models as they appear\n    - Run models by pasting their API documentation\n    - Access the full kie.ai catalog dynamically";
          static readonly basicFields = [
  "model_info"
];
          static readonly requiredSettings = [
  "KIE_API_KEY"
];
          static readonly isDynamic = true;
          static readonly supportsDynamicOutputs = true;
  
  @prop({ type: "int", default: 0, title: "Timeout Seconds", description: "Timeout in seconds for API calls (0 = use default)", min: 0, max: 3600 })
  declare timeout_seconds: any;

  @prop({ type: "str", default: "", title: "Model Info", description: "Paste the full API documentation from the kie.ai model page." })
  declare model_info: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const modelInfo = String(inputs.model_info ?? "").trim();
    if (!modelInfo) throw new Error("model_info is empty. Paste kie.ai API documentation.");
    const apiKey = getApiKey(inputs);
    const bundle = parseKieDocs(modelInfo);

    // Build input params from dynamic properties
    const apiInput: Record<string, unknown> = {};
    for (const p of bundle.params) {
      const val = inputs[p.name];
      if (val === undefined || val === null) {
        if (p.required) throw new Error(`Missing required input: ${p.name}`);
        continue;
      }
      if (p.isFileUrl || p.isFileUrlArray) {
        // Pass through URLs directly; upload would need context
        apiInput[p.name] = val;
      } else {
        apiInput[p.name] = val;
      }
    }

    const result = await kieExecuteTask(apiKey, bundle.modelId, apiInput, 2000, 300);

    if (bundle.outputType === "video") return { video: { data: result.data } };
    if (bundle.outputType === "audio") return { audio: { data: result.data } };
    return { image: { data: result.data } };
  }
}

export const KIE_DYNAMIC_NODES: readonly NodeClass[] = [KieAINode];
