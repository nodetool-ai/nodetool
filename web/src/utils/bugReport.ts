/**
 * Helpers for the node "Report this issue" button (see NodeErrors.tsx).
 *
 * The goal is to give maintainers enough context to reproduce a node failure
 * without the reporter having to describe it — the node's configuration
 * (model, provider, settings), how it was wired into the graph, and build
 * provenance — while never leaking secrets (API keys, tokens) or dumping
 * megabytes of inlined media into a public GitHub issue.
 */

const REPORT_LINES = 100;

// Property keys whose values are redacted regardless of content.
const SECRET_KEY_RE =
  /(api[_-]?key|secret|token|password|passwd|credential|bearer|access[_-]?key|private[_-]?key|auth)/i;

// A single property value, once summarized, is capped at this length.
const MAX_VALUE_LEN = 160;

// data: URIs (inlined base64 media) are never worth including verbatim.
const DATA_URI_RE = /^data:([\w/+.-]+)?(;base64)?,/i;

const REDACTED = "«redacted»";

/** Narrow an unknown to an indexable object (excludes null; arrays pass). */
function isObjectLike(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && !!value;
}

/** True for model-selection values like { type: "image_model", provider, id, name }. */
function isModelValue(
  value: unknown
): value is { type: string; provider?: unknown; id?: unknown; name?: unknown } {
  return (
    isObjectLike(value) &&
    typeof value.type === "string" &&
    value.type.endsWith("_model")
  );
}

const ASSET_TYPES = new Set([
  "image",
  "video",
  "audio",
  "document",
  "folder",
  "asset"
]);

/** True for asset refs like { type: "image", uri, asset_id }. */
function isAssetRef(
  value: unknown
): value is { type: string; uri?: unknown; asset_id?: unknown } {
  return (
    isObjectLike(value) &&
    typeof value.type === "string" &&
    ASSET_TYPES.has(value.type)
  );
}

function truncate(str: string, max = MAX_VALUE_LEN): string {
  if (str.length <= max) return str;
  return `${str.slice(0, max)}… (${str.length} chars)`;
}

/**
 * Render a single property value as a short, secret-safe, human-readable
 * string. Models are shown as `provider/id`, asset refs are collapsed to
 * their type (never the inlined bytes), long strings and blobs are truncated.
 */
export function summarizePropertyValue(value: unknown): string {
  if (value === null || value === undefined) return "null";

  if (isModelValue(value)) {
    const provider =
      typeof value.provider === "string" ? value.provider : "unknown";
    const id =
      typeof value.id === "string" && value.id
        ? value.id
        : typeof value.name === "string"
          ? value.name
          : "";
    return id ? `${value.type}: ${provider}/${id}` : `${value.type}: ${provider}`;
  }

  if (isAssetRef(value)) {
    const uri = typeof value.uri === "string" ? value.uri : "";
    const assetId =
      typeof value.asset_id === "string" ? value.asset_id : undefined;
    if (assetId) return `<${value.type} asset ${assetId}>`;
    if (uri && !DATA_URI_RE.test(uri)) return `<${value.type} ${truncate(uri, 80)}>`;
    if (uri) return `<${value.type} (inline data)>`;
    return `<${value.type}>`;
  }

  if (typeof value === "string") {
    if (DATA_URI_RE.test(value)) {
      const mime = value.match(DATA_URI_RE)?.[1] ?? "data";
      return `<inline ${mime} data, ${value.length} chars>`;
    }
    return truncate(value);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return truncate(`array(${value.length}) ${safeJson(value)}`);
  }

  return truncate(safeJson(value));
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * Format a node's properties as `key: value` lines, redacting values whose
 * key name looks secret-bearing. Empty/omitted properties produce a
 * placeholder so the report never looks truncated.
 */
export function formatNodeProperties(
  properties: Record<string, unknown> | undefined | null
): string {
  const entries = Object.entries(properties ?? {});
  if (entries.length === 0) return "(no properties set)";
  return entries
    .map(([key, value]) => {
      const rendered = SECRET_KEY_RE.test(key)
        ? REDACTED
        : summarizePropertyValue(value);
      return `${key}: ${rendered}`;
    })
    .join("\n");
}

export interface InputConnection {
  sourceType: string;
  sourceTitle?: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

/** Format the upstream connections feeding this node, one per line. */
export function formatInputConnections(connections: InputConnection[]): string {
  if (connections.length === 0) return "(no connected inputs)";
  return connections
    .map((c) => {
      const source = c.sourceTitle
        ? `${c.sourceType} ("${c.sourceTitle}")`
        : c.sourceType;
      const out = c.sourceHandle ? `.${c.sourceHandle}` : "";
      const into = c.targetHandle ?? "input";
      return `${source}${out} → ${into}`;
    })
    .join("\n");
}

export interface BuildReportBodyParams {
  nodeType: string;
  nodeTitle?: string;
  errorText: string;
  logLines: string[];
  systemInfo: string;
  properties?: Record<string, unknown> | null;
  inputConnections?: InputConnection[];
}

/** Build the Markdown body of the pre-filled GitHub issue. */
export function buildReportBody({
  nodeType,
  nodeTitle,
  errorText,
  logLines,
  systemInfo,
  properties,
  inputConnections = []
}: BuildReportBodyParams): string {
  const lastLogs =
    logLines.length > 0
      ? logLines.slice(-REPORT_LINES).join("\n")
      : "(no logs captured)";

  const titleLine = nodeTitle ? `\n**Node title:** ${nodeTitle}` : "";

  return `## Node Error Report

**Node type:** \`${nodeType}\`${titleLine}

### Error

\`\`\`
${errorText}
\`\`\`

### Node configuration

\`\`\`
${formatNodeProperties(properties)}
\`\`\`

### Connected inputs

\`\`\`
${formatInputConnections(inputConnections)}
\`\`\`

### System Information

\`\`\`
${systemInfo}
\`\`\`

### Last ${REPORT_LINES} log lines

\`\`\`
${lastLogs}
\`\`\`

---
*Automatically generated by the "Report this issue" button in NodeTool.*
`;
}

/** Build the pre-filled GitHub new-issue URL. */
export function buildReportUrl(
  baseUrl: string,
  params: BuildReportBodyParams
): string {
  const title = `[Bug] Node "${params.nodeType}" error: ${params.errorText
    .split("\n")[0]
    .slice(0, 80)}`;

  const search = new URLSearchParams({
    title,
    body: buildReportBody(params),
    labels: "bug"
  });

  return `${baseUrl}?${search.toString()}`;
}
