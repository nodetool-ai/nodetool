/**
 * Property values for manifest-driven node factories: atlascloud, fal, kie,
 * replicate, together, topaz. Sibling of `classifyFields` in
 * `field-classification.ts`, which the same factories share.
 */

import type { BaseNode } from "./base-node.js";
import {
  mapPromptAssetsToInputs,
  type PromptAssetInputField,
  type PromptAssetTextField
} from "@nodetool-ai/runtime";

/**
 * A value held by a node property or by a prompt-asset override: NodeTool's
 * property types are scalars, media refs, and lists or dicts of those.
 */
export type NodeValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | Uint8Array
  | NodeValue[]
  | { [key: string]: NodeValue };

/**
 * The empty media ref a media property starts at before the user picks an
 * asset. `duration` and `format` are carried by video only.
 */
export type EmptyMediaRef = {
  type: "image" | "video" | "audio";
  uri: string;
  asset_id: null;
  data: null;
  metadata: null;
  duration?: null;
  format?: null;
};

/** What a property starts at when the manifest names no default. */
export type FieldDefault =
  | boolean
  | number
  | string
  | null
  | never[]
  | EmptyMediaRef;

/**
 * The default for a declared property whose manifest field carries none.
 *
 * Container types are matched by prefix: the manifests between them name
 * hundreds of element types (`list[Image]`, `list[list[TrackPoint]]`), and the
 * element type never changes what the container starts at.
 */
export function defaultForPropType(propType: string): FieldDefault {
  switch (propType) {
    case "bool":
      return false;
    case "int":
    case "float":
      return 0;
    case "image":
      return {
        type: "image",
        uri: "",
        asset_id: null,
        data: null,
        metadata: null
      };
    case "audio":
      return {
        type: "audio",
        uri: "",
        asset_id: null,
        data: null,
        metadata: null
      };
    case "video":
      return {
        type: "video",
        uri: "",
        asset_id: null,
        data: null,
        metadata: null,
        duration: null,
        format: null
      };
    default:
      if (propType.startsWith("list[")) return [];
      if (propType.startsWith("dict[")) return null;
      return "";
  }
}

/** A manifest-built node indexed by the field names the manifest gave it. */
type ManifestNodeProperties = BaseNode & { [property: string]: NodeValue };

export function propertyOf(instance: BaseNode, name: string): NodeValue {
  // SAFETY: every declared property is registered from a manifest field, whose
  // declared types are exactly the scalars, media refs, and lists or dicts of
  // those that `NodeValue` names.
  const properties = instance as ManifestNodeProperties;
  return properties[name];
}

// ---------------------------------------------------------------------------
// Manifest field helpers shared by the provider factories
// ---------------------------------------------------------------------------

/** The media kinds a manifest field can name. */
export type ManifestAssetKind = "image" | "video" | "audio";

/**
 * The media kind a prop type names, or `null` when it names none.
 * `list[image]` answers `"image"` — {@link isListAssetPropType} tells the two apart.
 */
export function assetKindOf(propType: string): ManifestAssetKind | null {
  switch (propType.toLowerCase()) {
    case "image":
    case "list[image]":
      return "image";
    case "video":
    case "list[video]":
      return "video";
    case "audio":
    case "list[audio]":
      return "audio";
    default:
      return null;
  }
}

/** True for `list[image]` / `list[video]` / `list[audio]`. */
export function isListAssetPropType(propType: string): boolean {
  const lower = propType.toLowerCase();
  return lower.startsWith("list[") && assetKindOf(lower) !== null;
}

/**
 * How to decide that an enum's API argument must be sent as a number.
 *
 * `"declared"` reads the manifest's own option types: fal, kie, topaz, together
 * and atlascloud manifests keep the JSON type the provider's schema declared, so
 * `texture_size: [1024, 2048]` is an integer enum and FAL's
 * `safety_tolerance: ["1", "2", …]` is a string enum that must stay a string.
 *
 * `"parsed"` is for replicate, whose manifest stringifies every option
 * (`values: [string, string][]`). There an integer enum is indistinguishable by
 * type, so every option parsing as a finite number is the only signal left.
 */
export type ManifestEnumPolicy = "declared" | "parsed";

/**
 * Whether an enum's API argument must be sent as a number under `policy`.
 * Exported because replicate also needs it at property-registration time, to
 * register numeric options and a numeric default.
 */
export function manifestEnumIsNumeric(
  values: readonly (string | number)[] | undefined,
  policy: ManifestEnumPolicy = "declared"
): boolean {
  if (!Array.isArray(values) || values.length === 0) return false;
  if (policy === "declared") {
    return values.every((v) => typeof v === "number");
  }
  return values.every((v) => v !== "" && Number.isFinite(Number(v)));
}

/**
 * Coerce a stored property value to the type a manifest-driven API expects.
 *
 * A non-numeric value in an `int`/`float` field answers `null` rather than
 * `NaN`: the factories all strip `null` args before sending, and `NaN` survives
 * that strip and reaches the provider as an invalid number.
 *
 * `list[...]` / `dict[...]` values pass through untouched — they are the user's
 * own structure, not a scalar to reshape.
 */
export function coerceManifestScalar(
  value: NodeValue,
  propType: string,
  enumValues?: readonly (string | number)[],
  enumPolicy: ManifestEnumPolicy = "declared"
): NodeValue {
  if (value === null || value === undefined) return value;
  const type = propType.toLowerCase();
  if (type.startsWith("list[") || type.startsWith("dict[")) return value;
  switch (type) {
    case "int": {
      const n = typeof value === "number" ? value : parseInt(String(value), 10);
      return Number.isFinite(n) ? Math.trunc(n) : null;
    }
    case "float": {
      const n =
        typeof value === "number" ? value : parseFloat(String(value));
      return Number.isFinite(n) ? n : null;
    }
    case "bool": {
      if (typeof value === "boolean") return value;
      if (typeof value === "string") return value.toLowerCase() === "true";
      return Boolean(value);
    }
    default:
      return manifestEnumIsNumeric(enumValues, enumPolicy)
        ? Number(value)
        : String(value);
  }
}

/** The field shape {@link promptAssetOverridesFor} reads. */
export interface ManifestPromptField {
  name: string;
  propType: string;
  /** API parameter name, used as the mention token written back into the text. */
  apiParamName?: string;
  /** Set on a sub-field of a nested object input; those are never mention targets. */
  parentField?: string;
}

/**
 * Route `asset://` media mentioned inline in a node's text inputs onto its empty
 * image/audio/video inputs, and strip the mentions from the text.
 *
 * `hasSource` is the caller's own "this ref already points at bytes" test —
 * the providers disagree about whether an `asset_id`-only ref counts, so the
 * decision stays with them.
 */
export async function promptAssetOverridesFor(
  instance: BaseNode,
  fields: readonly ManifestPromptField[],
  hasSource: (value: NodeValue) => boolean,
  context?: Parameters<BaseNode["process"]>[0]
): Promise<Record<string, NodeValue>> {
  const textFields: PromptAssetTextField[] = [];
  const assetFields: PromptAssetInputField[] = [];
  for (const field of fields) {
    if (field.parentField) continue;
    const kind = assetKindOf(field.propType);
    if (kind) {
      const list = isListAssetPropType(field.propType);
      const value = propertyOf(instance, field.name);
      assetFields.push({
        name: field.name,
        label: field.apiParamName ?? field.name,
        kind,
        list,
        hasSource: list
          ? Array.isArray(value) && value.some(hasSource)
          : hasSource(value)
      });
    } else if (field.propType.toLowerCase() === "str") {
      textFields.push({
        name: field.name,
        value: String(propertyOf(instance, field.name) ?? "")
      });
    }
  }
  // SAFETY: the overrides are asset refs this call injected from `asset://`
  // mentions, so they are node property values like the ones they replace.
  return mapPromptAssetsToInputs(textFields, assetFields, context) as Promise<
    Record<string, NodeValue>
  >;
}
