/**
 * Property values for manifest-driven node factories: atlascloud, fal, kie,
 * replicate, together, topaz. Sibling of `classifyFields` in
 * `field-classification.ts`, which the same factories share.
 */

import type { BaseNode } from "./base-node.js";

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
