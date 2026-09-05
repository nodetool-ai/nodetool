/**
 * Dynamic Replicate node class factory.
 *
 * Creates node classes from manifest data at runtime instead of codegen.
 * Each class extends BaseNode with the correct static metadata and
 * declared properties, backed by a generic process() that calls Replicate.
 */

import {
  applyContentCardBody,
  assetKindOf,
  BaseNode,
  classifyFields,
  classNameToTitle,
  coerceManifestScalar,
  defaultForPropType,
  isListAssetPropType,
  manifestEnumIsNumeric,
  promptAssetOverridesFor,
  propertyOf,
  registerDeclaredProperty
} from "@nodetool-ai/node-sdk";
import type { NodeClass, NodeValue, PropOptions } from "@nodetool-ai/node-sdk";
import {
  getReplicateApiKey,
  replicateSubmit,
  removeNulls,
  isRefSet,
  assetToUrl,
  outputToImageRef,
  outputToVideoRef,
  outputToAudioRef,
  outputToString
} from "./replicate-base.js";
import type { ReplicateOutput } from "./replicate-base.js";

// ---------------------------------------------------------------------------
// Manifest types — mirrors replicate-codegen types.ts NodeSpec
// ---------------------------------------------------------------------------

interface ReplicateFieldDef {
  name: string;
  apiParamName?: string;
  tsType: string;
  propType: string;
  default: unknown;
  description: string;
  fieldType: "input" | "output";
  required: boolean;
  enumRef?: string;
  enumValues?: string[];
  nestedAssetKey?: string;
  parentField?: string;
  min?: number;
  max?: number;
}

export interface ReplicateManifestEntry {
  endpointId: string;
  className: string;
  moduleName: string;
  docstring: string;
  tags: string[];
  useCases: string[];
  outputType: string;
  inputFields: ReplicateFieldDef[];
  outputFields: ReplicateFieldDef[];
  enums: Array<{ name: string; values: [string, string][] }>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const EXCLUDED_FIELDS = new Set(["prompt_template"]);

// ---------------------------------------------------------------------------
// Field Classification
// ---------------------------------------------------------------------------

/**
 * Compute inlineFields and inputFields from a Replicate field list.
 * Delegates to the shared `classifyFields` rule in node-sdk after stripping
 * sub-fields and Replicate-specific `EXCLUDED_FIELDS`.
 */
function computeFieldClassification(fields: ReplicateFieldDef[]) {
  return classifyFields(
    fields
      .filter((f) => !f.parentField && !EXCLUDED_FIELDS.has(f.name))
      .map((f) => ({ name: f.name, propType: f.propType }))
  );
}

function promptAssetOverrides(
  instance: BaseNode,
  spec: ReplicateManifestEntry,
  context?: Parameters<BaseNode["process"]>[0]
): Promise<Record<string, unknown>> {
  return promptAssetOverridesFor(
    instance,
    spec.inputFields.filter((f) => !EXCLUDED_FIELDS.has(f.name)),
    isRefSet,
    context
  );
}

async function buildArgs(
  instance: BaseNode,
  spec: ReplicateManifestEntry,
  apiKey: string,
  context?: Parameters<BaseNode["process"]>[0]
): Promise<Record<string, unknown>> {
  const args: Record<string, unknown> = {};
  const overrides = await promptAssetOverrides(instance, spec, context);

  for (const field of spec.inputFields) {
    if (field.parentField) continue;
    if (EXCLUDED_FIELDS.has(field.name)) continue;

    // Image-gen nodes always produce a single output — force num_outputs to 1
    // regardless of any saved value, since the field is no longer exposed.
    if (field.name === "num_outputs") {
      const apiName = field.apiParamName ?? field.name;
      args[apiName] = 1;
      continue;
    }

    // SAFETY: both sources hold node property values, and NodeTool restricts
    // those to its own property types — the shapes `NodeValue` names.
    const value = (
      field.name in overrides
        ? overrides[field.name]
        : propertyOf(instance, field.name)
    ) as NodeValue;
    const apiName = field.apiParamName ?? field.name;
    const kind = assetKindOf(field.propType);

    if (kind) {
      if (isListAssetPropType(field.propType)) {
        const refs = Array.isArray(value) ? value : [];
        const urls: string[] = [];
        for (const ref of refs) {
          if (isRefSet(ref)) {
            const url = await assetToUrl(
              ref as Record<string, unknown>,
              apiKey,
              context
            );
            if (url) urls.push(url);
          }
        }
        if (urls.length) args[apiName] = urls;
      } else {
        const ref = value as Record<string, unknown> | undefined;
        if (isRefSet(ref)) {
          const url = await assetToUrl(ref!, apiKey, context);
          if (url) args[apiName] = url;
        }
      }
    } else {
      args[apiName] = coerceManifestScalar(
        value,
        field.propType,
        field.enumValues,
        "parsed"
      );
    }
  }

  removeNulls(args);
  return args;
}

function mapOutput(
  spec: ReplicateManifestEntry,
  output: unknown
) {
  switch (spec.outputType) {
    case "image":
      return { output: outputToImageRef(output) };
    case "video":
      return { output: outputToVideoRef(output) };
    case "audio":
      return { output: outputToAudioRef(output) };
    case "str":
      return { output: outputToString(output) };
    default:
      return { output };
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createReplicateNodeClass(
  spec: ReplicateManifestEntry
): NodeClass {
  const moduleId = spec.moduleName.replace(/-/g, ".");
  const nodeType = `replicate.${moduleId}.${spec.className}`;
  const title = classNameToTitle(spec.className);
  const descFirstLine = spec.docstring || `${spec.className} node`;
  const descSecondLine =
    spec.tags.length > 0 ? spec.tags.join(", ") : "replicate, ai";
  const description = `${descFirstLine}\n${descSecondLine}`;
  // Generative outputs — auto-save assets and auto-show result preview in UI
  const isGenerativeOutput = ["image", "video", "audio"].includes(
    spec.outputType
  );
  const specRef = spec;

  const executePrediction = async (
    instance: BaseNode,
    context?: Parameters<BaseNode["process"]>[0]
  ): Promise<ReplicateOutput> => {
    const apiKey = getReplicateApiKey(instance._secrets);
    const args = await buildArgs(instance, specRef, apiKey, context);
    const res = await replicateSubmit(apiKey, specRef.endpointId, args);
    return res.output;
  };

  const ReplicateNodeClass = class extends BaseNode {
    async process(
      context?: Parameters<BaseNode["process"]>[0]
    ): Promise<Record<string, unknown>> {
      const output = await executePrediction(this, context);
      return mapOutput(specRef, output);
    }
  };

  Object.defineProperty(ReplicateNodeClass, "name", {
    value: spec.className,
    configurable: true
  });
  Object.defineProperty(ReplicateNodeClass, "nodeType", {
    value: nodeType,
    configurable: true
  });
  Object.defineProperty(ReplicateNodeClass, "title", {
    value: title,
    configurable: true
  });
  Object.defineProperty(ReplicateNodeClass, "description", {
    value: description,
    configurable: true
  });
  Object.defineProperty(ReplicateNodeClass, "requiredSettings", {
    value: ["REPLICATE_API_TOKEN"],
    configurable: true
  });
  if (isGenerativeOutput) {
    Object.defineProperty(ReplicateNodeClass, "autoSaveAsset", {
      value: true,
      configurable: true
    });
  }
  Object.defineProperty(ReplicateNodeClass, "metadataOutputTypes", {
    value: { output: spec.outputType === "dict" ? "any" : spec.outputType },
    configurable: true
  });
  // Preview-forward body for anything the editor can display — the media
  // generators plus the text-output models (captioners, transcribers, LLMs).
  applyContentCardBody(ReplicateNodeClass);

  // Compute and set field classification
  const { inlineFields, inputFields } = computeFieldClassification(spec.inputFields);
  Object.defineProperty(ReplicateNodeClass, "inlineFields", {
    value: inlineFields,
    configurable: true
  });
  Object.defineProperty(ReplicateNodeClass, "inputFields", {
    value: inputFields,
    configurable: true
  });

  // Register declared properties. num_outputs is internal-only (pinned to 1)
  // and not exposed in the UI.
  for (const field of spec.inputFields) {
    if (field.parentField) continue;
    if (field.name === "num_outputs") continue;

    // Numeric enums must register numeric options and a numeric default so the
    // value stays an integer end-to-end (UI selection + API arg). Otherwise the
    // numeric default never matches the string options and the API gets a string.
    const numericEnum =
      field.propType === "enum" &&
      manifestEnumIsNumeric(field.enumValues, "parsed");
    let defaultValue: unknown =
      field.default ?? defaultForPropType(field.propType);
    if (numericEnum) {
      defaultValue =
        defaultValue === "" || defaultValue == null
          ? Number(field.enumValues![0])
          : Number(defaultValue);
    }

    const propOptions: PropOptions = {
      type: field.propType,
      default: defaultValue
    };
    if (field.description) propOptions.description = field.description;
    if (field.enumValues?.length) {
      propOptions.values = numericEnum
        ? field.enumValues.map(Number)
        : field.enumValues;
    }
    if (field.min !== undefined) propOptions.min = field.min;
    if (field.max !== undefined) propOptions.max = field.max;

    registerDeclaredProperty(ReplicateNodeClass, field.name, propOptions);
  }

  return ReplicateNodeClass;
}

export function loadReplicateNodesFromManifest(
  manifest: ReplicateManifestEntry[]
): NodeClass[] {
  return manifest.map(createReplicateNodeClass);
}
