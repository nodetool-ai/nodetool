/**
 * Node-level validation.
 *
 * Validates that a node descriptor has all of its required properties set
 * before a workflow is executed. Properties supplied via incoming edges are
 * skipped (the value will be produced at runtime by an upstream node).
 *
 * Three checks are run for each declared property:
 *
 *   1. `required: true` — the value must be present and non-empty.
 *   2. Model fields (`type` ending in `_model`) — if the value carries a
 *      `provider`, it must not be the sentinel `"empty"` and `id` must be
 *      a non-empty string. This catches the very common "user forgot to
 *      pick a model" case for LLM/agent nodes.
 *   3. Required asset fields (`audio`, `image`, `video`, `document`,
 *      `dataframe`, `model_3d`, `folder`, `font`, `text`, `asset`) — when
 *      `required: true`, the value must carry a `uri`, `asset_id`,
 *      `temp_id`, or inline `data`. The default placeholder
 *      (`{ type: "audio", uri: "", asset_id: null, data: null }`) otherwise
 *      looks "non-empty" to the generic emptiness check, so without this
 *      branch a `required: true` audio/image input would slip through.
 *
 * The validator works against the @prop metadata on a node class, so any
 * node that uses `@prop({ required: true, ... })`, a model-typed field, or
 * an asset-typed field gets validation for free with no per-node code.
 */
import type { DeclaredPropertyMetadata } from "./decorators.js";

/** A single validation issue tied to a node property. */
export interface NodePropertyValidationIssue {
  /** Node id, when known. */
  nodeId?: string;
  /** Node type, when known. */
  nodeType?: string;
  /** Property name that failed validation. */
  property: string;
  /** Human-readable message describing the failure. */
  message: string;
}

export interface ValidateNodePropertiesOptions {
  /**
   * Set of property names that are connected to incoming data edges. These
   * properties are produced at runtime, so their default value (often empty)
   * should not be flagged as missing.
   */
  connectedHandles?: ReadonlySet<string> | ReadonlyArray<string>;
  /** Node id to attach to issues. */
  nodeId?: string;
  /** Node type to attach to issues. */
  nodeType?: string;
}

const MODEL_TYPE_SUFFIX = "_model";
const EMPTY_PROVIDER = "empty";

const ASSET_TYPES: ReadonlySet<string> = new Set([
  "asset",
  "audio",
  "image",
  "video",
  "text",
  "document",
  "dataframe",
  "model_3d",
  "folder",
  "font"
]);

function isModelType(typeStr: string | undefined): boolean {
  if (!typeStr) return false;
  return typeStr.endsWith(MODEL_TYPE_SUFFIX);
}

function isAssetType(typeStr: string | undefined): boolean {
  if (!typeStr) return false;
  return ASSET_TYPES.has(typeStr);
}

function isUnsetAsset(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  const uri = v.uri;
  const assetId = v.asset_id;
  const tempId = v.temp_id;
  const data = v.data;
  const hasUri = typeof uri === "string" && uri.length > 0;
  const hasAssetId = typeof assetId === "string" && assetId.length > 0;
  const hasTempId = typeof tempId === "string" && tempId.length > 0;
  const hasData =
    data != null &&
    !(typeof data === "string" && data.length === 0) &&
    !(Array.isArray(data) && data.length === 0);
  return !hasUri && !hasAssetId && !hasTempId && !hasData;
}

function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.length === 0;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function isUnsetModel(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  const provider = v.provider;
  const id = v.id;
  // A bare placeholder like `{ type: "language_model" }` (no provider, no id)
  // is exactly the unselected default we want to flag.
  if (provider == null) return true;
  if (typeof provider === "string" && provider === EMPTY_PROVIDER) return true;
  if (id == null) return true;
  if (typeof id === "string" && id.length === 0) return true;
  return false;
}

function toSet(
  handles: ReadonlySet<string> | ReadonlyArray<string> | undefined
): ReadonlySet<string> {
  if (!handles) return new Set();
  if (handles instanceof Set) return handles;
  return new Set(handles as ReadonlyArray<string>);
}

/**
 * Validate property values against declared @prop metadata.
 *
 * Properties whose name appears in `connectedHandles` are skipped because
 * they will receive a value from an upstream node at runtime.
 */
export function validateNodeProperties(
  declared: ReadonlyArray<DeclaredPropertyMetadata>,
  properties: Record<string, unknown>,
  options: ValidateNodePropertiesOptions = {}
): NodePropertyValidationIssue[] {
  const connected = toSet(options.connectedHandles);
  const issues: NodePropertyValidationIssue[] = [];

  for (const { name, options: meta } of declared) {
    if (connected.has(name)) continue;
    const value = properties[name];
    const typeStr = meta.type;

    if (meta.required) {
      // Asset-typed fields hold object placeholders that pass the generic
      // emptiness check, so route them through the asset-specific check.
      const isAsset = isAssetType(typeStr);
      const empty = isAsset ? isUnsetAsset(value) : isEmptyValue(value);
      if (empty) {
        issues.push({
          nodeId: options.nodeId,
          nodeType: options.nodeType,
          property: name,
          message: isAsset
            ? `Property "${name}" requires a ${typeStr} (asset, uri, or inline data)`
            : `Required property "${name}" is not set`
        });
        continue;
      }
    }

    if (isModelType(typeStr) && isUnsetModel(value)) {
      issues.push({
        nodeId: options.nodeId,
        nodeType: options.nodeType,
        property: name,
        message: `Property "${name}" requires a ${typeStr} to be selected (provider and model id)`
      });
    }
  }

  return issues;
}

/**
 * Format a list of validation issues into a single human-readable message.
 * Used by GraphValidationError when validation fails.
 */
export function formatValidationIssues(
  issues: ReadonlyArray<NodePropertyValidationIssue>
): string {
  if (issues.length === 0) return "";
  const lines = issues.map((issue) => {
    const where = issue.nodeId
      ? ` on node "${issue.nodeId}"${issue.nodeType ? ` (${issue.nodeType})` : ""}`
      : issue.nodeType
        ? ` on ${issue.nodeType}`
        : "";
    return `  - ${issue.message}${where}`;
  });
  return `Graph validation failed with ${issues.length} issue(s):\n${lines.join("\n")}`;
}
