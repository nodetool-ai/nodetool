/**
 * @nodetool-ai/protocol – Graph Types
 *
 * TypeScript equivalents of graph structures from:
 *   src/nodetool/types/api_graph.py (Edge)
 *   src/nodetool/workflows/graph.py (Graph)
 *   src/nodetool/workflows/control_events.py
 */

import type { EdgeType } from "./messages.js";
import type { TypeMetadata } from "./type-metadata.js";
import { isString } from "./predicates.js";

// ---------------------------------------------------------------------------
// Edge
// ---------------------------------------------------------------------------

export interface Edge {
  id?: string | null;
  source: string;
  sourceHandle: string;
  target: string;
  targetHandle: string;
  ui_properties?: Record<string, string> | null;
  edge_type?: EdgeType;
  [key: string]: unknown;
}

export function isControlEdge(edge: Edge): boolean {
  return edge.edge_type === "control";
}

export function isDataEdge(edge: Edge): boolean {
  return edge.edge_type !== "control";
}

// ---------------------------------------------------------------------------
// Control Events
// ---------------------------------------------------------------------------

export interface RunEvent {
  event_type: "run";
  properties: Record<string, unknown>;
}

export interface StopEvent {
  event_type: "stop";
}

export type ControlEvent = RunEvent | StopEvent;

// ---------------------------------------------------------------------------
// Node descriptor (minimal shape for the kernel layer)
// ---------------------------------------------------------------------------

export type InputMode = "buffered" | "stream" | "controlled";

export type OutputKind =
  | "single"
  | "iteration"
  | "chunk"
  | "forward"
  | "aggregate";

export type CollapseSpec = "innermost";

export interface OutputCorrelation {
  kind: OutputKind;
  source: string;
  group?: string;
  collapse?: CollapseSpec;
}

/**
 * One correlation token per iteration root in a message's lineage.
 *
 * See docs/correlation-design.md §2.
 */
export interface CorrelationToken {
  index: number;
}

/**
 * Map from iteration-root id to its current token.
 *
 * Empty for source-node and constant outputs. Iteration nodes add one entry
 * per minted root. Lineage is preserved by `forward` outputs, extended by
 * `iteration` outputs, and trimmed by `aggregate` outputs.
 */
export type CorrelationLineage = Readonly<Record<string, CorrelationToken>>;

export const EMPTY_LINEAGE: CorrelationLineage = Object.freeze({});

/**
 * Control-plane signal emitted by a source edge announcing that it will not
 * produce a value for `lineage` on `output`. Correlated joins waiting for that
 * key learn the key is unavailable before source EOS. See §6.
 */
export interface LineageDone {
  type: "lineage_done";
  source_edge_id: string;
  output: string;
  lineage: CorrelationLineage;
}

/**
 * Control-plane signal emitted by a source edge announcing that no more
 * descendant tokens of `closed_root` will arrive under `parent_lineage`. Sent
 * even when no child token was minted. See §6.
 */
export interface LineageScopeClosed {
  type: "lineage_scope_closed";
  source_edge_id: string;
  output: string;
  parent_lineage: CorrelationLineage;
  closed_root: string;
}

/** Any of the correlation control-plane signals. */
export type LineageControlSignal = LineageDone | LineageScopeClosed;

/**
 * Declaration of one user-added dynamic input slot.
 *
 * Types and values live in separate maps: `NodeDescriptor.dynamic_inputs`
 * holds the declarations, `NodeDescriptor.dynamic_properties` holds the
 * current inline values. A property with no declaration is an untyped legacy
 * slot and behaves as `any`.
 */
export interface DynamicSlotMeta {
  /**
   * Wire shape matches `dynamic_outputs`: either a parsed `TypeMetadata` or
   * the JSON form (`{ type, type_args, optional }`) that crosses the wire.
   */
  type: TypeMetadata | Record<string, unknown>;
  description?: string;
  default?: unknown;
  required?: boolean;
  min?: number;
  max?: number;
}

/**
 * Minimal node descriptor for graph operations.
 * The full BaseNode equivalent lives in the node-sdk package.
 */
export interface NodeDescriptor {
  id: string;
  type: string;
  name?: string;

  /** Declared input property names and their types. */
  properties?: Record<string, unknown>;

  /** Declared output slot names and their types. */
  outputs?: Record<string, string>;

  /** Parent node ID for sub-graph nodes. */
  parent_id?: string | null;

  /** UI-only metadata carried through graph transport. */
  ui_properties?: Record<string, unknown>;

  /** Dynamic runtime properties accepted by dynamic nodes. */
  dynamic_properties?: Record<string, unknown>;

  /**
   * Typed slot declarations for dynamic inputs. Slots without a declaration
   * are untyped (`any`), which is how every workflow saved before typed slots
   * existed behaves.
   */
  dynamic_inputs?: Record<string, DynamicSlotMeta>;

  /** Dynamic runtime outputs declared by dynamic nodes. */
  dynamic_outputs?: Record<string, TypeMetadata | Record<string, unknown>>;

  /**
   * Whether re-running this node with identical inputs is safe. An opt-in, not
   * an opt-out: cost tracking cannot see external writes, so a node nobody
   * classified must lose a safe retry rather than gain an unsafe one. The
   * supervisor offers `retry` only for a node that declares this.
   * See docs/workflow-supervisor-design.md §5.3.
   */
  retry_safe?: boolean;

  /** Whether this node consumes streaming input. */
  is_streaming_input?: boolean;

  /** Whether this node produces streaming output. */
  is_streaming_output?: boolean;

  /**
   * Emit output_update for this node's handles even when they have outgoing
   * data edges. The runner suppresses output_update for connected handles by
   * default (downstream receives the value on the edge; clients display only
   * terminal handles). Nodes whose output_updates feed a UI surface
   * regardless of patching — e.g. the realtime audio monitor — set this.
   */
  always_emit_output_updates?: boolean;

  /** Correlation-aware input execution mode. */
  input_mode?: InputMode;

  /** Per-output correlation metadata. */
  output_correlation?: Record<string, OutputCorrelation>;

  /** Whether this node is controlled via control edges. */
  is_controlled?: boolean;

  /**
   * Whether this node is a trigger (registration + run-time entry point).
   * When a run carries a `trigger_event` targeting this node, the kernel
   * calls the node's `emitTriggerEvent` entry point instead of its
   * live-listening `genProcess` loop. See
   * docs/superpowers/specs/2026-07-10-trigger-wakeup-redesign.md.
   */
  is_trigger?: boolean;

  /** Whether this node accepts user-named dynamic input properties. */
  supports_dynamic_inputs?: boolean;

  /**
   * If true, this node is an explicit join (`Zip` or `Cross`) and is allowed
   * to receive inputs whose scopes are pairwise incomparable. Static
   * correlation analysis emits the joined output at
   * `commonParentPrefix + [iterationRoot]`. §7.
   */
  is_join_node?: boolean;

  /** Property type strings keyed by property name (e.g. { values: "list[int]" }). */
  propertyTypes?: Record<string, string>;

  /** Per-property metadata (description, min, max) for control context enrichment. */
  propertyMeta?: Record<
    string,
    { description?: string; min?: number; max?: number }
  >;
}

/**
 * A node descriptor whose behavior-critical flags have been resolved — the
 * kernel trusts these flags to pick the execution mode (streaming run() vs
 * one-shot process(), controlled mode, join semantics), so a runner must
 * never receive a descriptor where they are merely absent. Produced by the
 * hydration helpers (`Graph.loadFromDict`, node-sdk's `hydrateGraphNodeFlags`,
 * kernel's `withExplicitNodeFlags`); raw wire graphs (`NodeDescriptor`) are
 * deliberately not assignable.
 */
export interface HydratedNodeDescriptor extends NodeDescriptor {
  is_streaming_input: boolean;
  is_streaming_output: boolean;
  is_controlled: boolean;
  is_join_node: boolean;
  /**
   * Resolved from the registry only. Hydration never carries a saved
   * `retry_safe` through, so a graph file cannot claim redo-safety a node's
   * class never declared.
   */
  retry_safe: boolean;
}

// ---------------------------------------------------------------------------
// Graph
// ---------------------------------------------------------------------------

export interface GraphData {
  nodes: NodeDescriptor[];
  edges: Edge[];
}

/** GraphData whose nodes carry resolved behavior flags. See {@link HydratedNodeDescriptor}. */
export interface HydratedGraphData {
  nodes: HydratedNodeDescriptor[];
  edges: Edge[];
}

// ---------------------------------------------------------------------------
// Backward-compat node-type migrations
// ---------------------------------------------------------------------------

/** A removed node type and the replacement it is rewritten to on load. */
export interface NodeTypeMigration {
  /** Deprecated node_type to match. */
  from: string;
  /** Replacement node_type. */
  to: string;
  /**
   * Static property (and connection handle) renames, old name -> new name.
   * Applied to the node's `data`/`properties` and to any incoming edge whose
   * `targetHandle` matches an old name.
   */
  renameProperties?: Record<string, string>;
  /**
   * Move every remaining `data`/`properties` entry (after `renameProperties`
   * runs) into `dynamic_properties` — used when `to` is a node that reads its
   * configuration through a dynamic `inputs` bag rather than declared static
   * fields, e.g. the Code node. The old node's saved values survive the
   * migration as dynamic inputs under their (possibly renamed) keys, wired to
   * the same edges since edge `targetHandle`s are renamed alongside.
   */
  moveRemainingPropertiesToDynamic?: boolean;
  /**
   * Static properties merged onto the migrated node's `data`/`properties`
   * unconditionally, applied after `moveRemainingPropertiesToDynamic` — e.g.
   * the Code node's `code` and `packages`.
   */
  setProperties?: Record<string, unknown>;
}

/**
 * Node types removed in favor of a replacement. Old workflows keep loading
 * because {@link migrateGraphNodeTypes} rewrites these on every graph load
 * (server-side in `Graph.fromDict`, client-side when a workflow enters the
 * editor store).
 */
const CODE_NODE_TYPE = "nodetool.code.Code";

/**
 * Build a `nodetool.text.*` → Code node migration. The removed node classes
 * in Tier 1 of docs/CODE_NODE_COVERAGE.md are pure functions with an
 * equivalent snippet already shipping in `web/src/config/codeSnippets.ts`;
 * migrating a saved graph means pointing the node at `nodetool.code.Code`
 * with that snippet's body preloaded as `code` and the old node's saved
 * values carried forward as dynamic inputs (renamed where the snippet's
 * `inputs.*` names differ from the old property names).
 */
function textToCodeMigration(
  from: string,
  code: string,
  renameProperties?: Record<string, string>
): NodeTypeMigration {
  return {
    from,
    to: CODE_NODE_TYPE,
    renameProperties,
    moveRemainingPropertiesToDynamic: true,
    setProperties: { code, packages: [] }
  };
}

const PDF_PACK = "@nodetool-ai/sandbox-pdf";

const PDF_PAGE_RANGE = `const start = Math.max(0, Number(inputs.start_page ?? 0));
const requestedEnd = Number(inputs.end_page ?? -1);
const end = requestedEnd === -1 ? pages.length - 1 : Math.min(requestedEnd, pages.length - 1);`;

function pdfToCodeMigration(from: string, code: string): NodeTypeMigration {
  return {
    from,
    to: CODE_NODE_TYPE,
    moveRemainingPropertiesToDynamic: true,
    setProperties: {
      code: `import { extractPages } from "${PDF_PACK}";
const pages = await extractPages(await media.bytes(inputs.pdf));
${code}`,
      packages: [PDF_PACK]
    }
  };
}

export const NODE_TYPE_MIGRATIONS: readonly NodeTypeMigration[] = [
  // FormatText was identical to Prompt apart from its input field name.
  {
    from: "nodetool.text.FormatText",
    to: "nodetool.text.Prompt",
    renameProperties: { template: "prompt" }
  },

  // Tier 1 of docs/CODE_NODE_COVERAGE.md — hand-written nodes whose behavior
  // is already covered by a shipping Code node snippet. See
  // `web/src/config/codeSnippets.ts` for the snippet source of truth; the
  // code strings below are copied from there (kept in sync by
  // `packages/protocol/tests/node-migrations.test.ts`).
  textToCodeMigration(
    "nodetool.text.Split",
    // Split's delimiter was a real per-instance property, not a demo
    // constant — read it from the dynamic input.
    'return { output: inputs.text.split(inputs.delimiter ?? ",") };'
  ),
  textToCodeMigration(
    "nodetool.text.Extract",
    // end=0 meant "unset" (props default to 0) and sliced to the end of the
    // text — honor that instead of always slicing to end=0.
    `const end = Number(inputs.end ?? 0);
return { output: inputs.text.slice(inputs.start, end === 0 ? undefined : end) };`
  ),
  textToCodeMigration(
    "nodetool.text.Chunk",
    // Chunk's length/overlap/separator were real per-instance properties, not
    // demo constants — read them from the dynamic inputs the shared "Chunk
    // Text" snippet only hardcodes as a starting example.
    `const chunkSize = Number(inputs.length ?? 100);
const overlap = Number(inputs.overlap ?? 0);
const separator = String(inputs.separator ?? " ");
const words = String(inputs.text ?? "").split(separator);
const step = chunkSize - overlap;
const chunks = [];
for (let i = 0; i < words.length; i += step) {
  chunks.push(words.slice(i, i + chunkSize).join(separator));
}
return { output: chunks };`
  ),
  textToCodeMigration(
    "nodetool.text.ExtractRegex",
    // dotall/ignorecase/multiline were real per-instance properties — build
    // the flag string from them rather than always matching plain.
    `let flags = "";
if (inputs.ignorecase) flags += "i";
if (inputs.multiline) flags += "m";
if (inputs.dotall) flags += "s";
const match = new RegExp(inputs.pattern, flags).exec(inputs.text);
return { output: match ? match.slice(1) : [] };`,
    { regex: "pattern" }
  ),
  textToCodeMigration(
    "nodetool.text.FindAllRegex",
    // dotall/ignorecase/multiline were real per-instance properties — build
    // the flag string from them rather than always matching plain.
    `let flags = "g";
if (inputs.ignorecase) flags += "i";
if (inputs.multiline) flags += "m";
if (inputs.dotall) flags += "s";
const matches = [...inputs.text.matchAll(new RegExp(inputs.pattern, flags))].map(m => m[0]);
return { output: matches };`,
    { regex: "pattern" }
  ),
  textToCodeMigration(
    "nodetool.text.ParseJSON",
    "return { output: JSON.parse(inputs.text) };"
  ),
  textToCodeMigration(
    "nodetool.text.ExtractJSON",
    // The shared "Get JSON Path" snippet in codeSnippets.ts references a bare
    // \`data\` global that the Code node sandbox never provides (pre-existing
    // bug, out of this migration's scope) — parse \`inputs.text\` locally
    // instead so the migrated node actually runs.
    `const data = JSON.parse(inputs.text);
const value = String(inputs.path).split(".").reduce(
  (acc, k) => (acc == null ? acc : acc[k]),
  data
);
return { output: value };`,
    { json_path: "path" }
  ),
  textToCodeMigration(
    "nodetool.text.RegexMatch",
    // RegexMatch's `group` picked which capture to return (0 = full match),
    // and defaulted to the full match when unset — read it from the dynamic
    // input rather than the shared snippet's hardcoded example group.
    `const group = inputs.group ?? 0;
const matches = [...inputs.text.matchAll(new RegExp(inputs.pattern, "g"))]
  .map(m => m[group])
  .filter(v => v !== undefined);
return { output: matches };`
  ),
  textToCodeMigration(
    "nodetool.text.RegexReplace",
    // count was a real per-instance property that capped how many matches
    // got replaced (0 = unlimited) — honor it instead of always replacing
    // every match.
    `const text = String(inputs.text ?? "");
const pattern = new RegExp(inputs.pattern, "g");
const replacement = String(inputs.replacement ?? "");
const count = Number(inputs.count ?? 0);
if (count <= 0) {
  return { output: text.replace(pattern, replacement) };
}
let remaining = count;
const output = text.replace(pattern, (matched) => {
  if (remaining <= 0) return matched;
  remaining--;
  return matched.replace(new RegExp(inputs.pattern), replacement);
});
return { output };`
  ),
  textToCodeMigration(
    "nodetool.text.RegexSplit",
    // maxsplit was a real per-instance property that capped how many splits
    // happened (0 = unlimited) — honor it instead of always splitting on
    // every match.
    `const text = String(inputs.text ?? "");
const pattern = String(inputs.pattern ?? "");
const maxsplit = Number(inputs.maxsplit ?? 0);
if (maxsplit <= 0) {
  return { output: text.split(new RegExp(pattern)) };
}
const result = [];
let remaining = text;
let count = 0;
const re = new RegExp(pattern);
let match;
while (count < maxsplit && (match = re.exec(remaining)) !== null) {
  result.push(remaining.slice(0, match.index));
  remaining = remaining.slice(match.index + match[0].length);
  count++;
}
result.push(remaining);
return { output: result };`
  ),
  textToCodeMigration(
    "nodetool.text.RegexValidate",
    "return { output: new RegExp(inputs.pattern).test(inputs.text) };"
  ),
  textToCodeMigration(
    "nodetool.text.Compare",
    `const result = inputs.a < inputs.b ? "less" : inputs.a > inputs.b ? "greater" : "equal";
return { output: result, equal: inputs.a === inputs.b };`,
    { text_a: "a", text_b: "b" }
  ),
  textToCodeMigration(
    "nodetool.text.Equals",
    // Equals always exposed a boolean `output`, unlike Compare's ordering
    // string — reuse Compare's a/b naming but keep the boolean contract.
    "return { output: inputs.a === inputs.b };",
    { text_a: "a", text_b: "b" }
  ),
  textToCodeMigration(
    "nodetool.text.ToUppercase",
    // The shared "Upper / Lower Case" snippet returns both cases on separate
    // handles; ToUppercase only ever exposed a single `output`, so keep that
    // contract for old edges wired to it rather than the two-handle snippet.
    "return { output: inputs.text.toUpperCase() };"
  ),
  textToCodeMigration(
    "nodetool.text.ToLowercase",
    "return { output: inputs.text.toLowerCase() };"
  ),
  textToCodeMigration(
    "nodetool.text.ToTitlecase",
    `return { output: inputs.text.replace(/\\w\\S*/g, w =>
  w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
) };`
  ),
  textToCodeMigration(
    "nodetool.text.CapitalizeText",
    "return { output: inputs.text.charAt(0).toUpperCase() + inputs.text.slice(1).toLowerCase() };"
  ),
  textToCodeMigration(
    "nodetool.text.Slice",
    // Python-style slice(start:stop:step) on code points — stop=0 meant
    // "unset" (slice to the end), and a negative step reversed the text.
    // Read the real per-instance properties rather than a plain slice.
    `const text = String(inputs.text ?? "");
const start = Number(inputs.start ?? 0);
const stop = Number(inputs.end ?? 0);
const step = Number(inputs.step ?? 1);
if (step === 0) throw new Error("slice step cannot be zero");
const chars = [...text];
if (step === 1) {
  const effectiveStop = stop === 0 ? undefined : stop;
  return { output: chars.slice(start, effectiveStop).join("") };
}
const result = [];
const len = chars.length;
if (step > 0) {
  const normStart = start < 0 ? len + start : start;
  const effectiveStop = stop === 0 ? len : stop;
  const normStop = effectiveStop < 0 ? len + effectiveStop : effectiveStop;
  for (let i = Math.max(0, normStart); i < Math.min(len, normStop); i += step) {
    result.push(chars[i]);
  }
} else {
  const normStart = start === 0 ? len - 1 : start < 0 ? len + start : start;
  const normStop = stop === 0 ? -1 : stop < 0 ? len + stop : stop;
  for (let i = Math.min(len - 1, normStart); i > Math.max(-1, normStop); i += step) {
    if (i >= 0 && i < len) result.push(chars[i]);
  }
}
return { output: result.join("") };`,
    { stop: "end" }
  ),
  textToCodeMigration(
    "nodetool.text.StartsWith",
    "return { output: inputs.text.startsWith(inputs.prefix) };"
  ),
  textToCodeMigration(
    "nodetool.text.EndsWith",
    "return { output: inputs.text.endsWith(inputs.suffix) };"
  ),
  textToCodeMigration(
    "nodetool.text.Contains",
    // search_values/case_sensitive/match_mode were real per-instance
    // properties — honor them instead of a plain case-sensitive includes.
    `const text = String(inputs.text ?? "");
const substring = String(inputs.substring ?? "");
const searchValues = Array.isArray(inputs.search_values) ? inputs.search_values.map(v => String(v)) : [];
const caseSensitive = inputs.case_sensitive === undefined ? true : Boolean(inputs.case_sensitive);
const matchMode = String(inputs.match_mode ?? "any");
const targets = searchValues.length > 0 ? searchValues : substring ? [substring] : [];
if (targets.length === 0) return { output: false };
const haystack = caseSensitive ? text : text.toLowerCase();
const needles = caseSensitive ? targets : targets.map(n => n.toLowerCase());
if (matchMode === "all") return { output: needles.every(needle => haystack.includes(needle)) };
if (matchMode === "none") return { output: needles.every(needle => !haystack.includes(needle)) };
return { output: needles.some(needle => haystack.includes(needle)) };`
  ),
  textToCodeMigration(
    "nodetool.text.TrimWhitespace",
    "return { output: inputs.text.trim() };"
  ),
  textToCodeMigration(
    "nodetool.text.CollapseWhitespace",
    // preserve_newlines/replacement/trim_edges were real per-instance
    // properties — read them from the dynamic inputs rather than the shared
    // snippet's hardcoded defaults.
    `const text = String(inputs.text ?? "");
const preserveNewlines = Boolean(inputs.preserve_newlines ?? false);
const replacement = String(inputs.replacement ?? " ");
const trimEdges = inputs.trim_edges === undefined ? true : Boolean(inputs.trim_edges);
const value = trimEdges ? text.trim() : text;
const pattern = preserveNewlines ? /[^\\S\\r\\n]+/g : /\\s+/g;
return { output: value.replace(pattern, replacement) };`
  ),
  textToCodeMigration(
    "nodetool.text.IsEmpty",
    // trim_whitespace was a real per-instance property, default true — honor
    // it rather than always trimming.
    `const text = String(inputs.text ?? "");
const trimWhitespace = inputs.trim_whitespace === undefined ? true : Boolean(inputs.trim_whitespace);
return { output: (trimWhitespace ? text.trim() : text).length === 0 };`
  ),
  textToCodeMigration(
    "nodetool.text.RemovePunctuation",
    'return { output: inputs.text.replace(/[!"#$%&\'()*+,\\-./:;<=>?@[\\\\\\]^_`{|}~]/g, "") };'
  ),
  textToCodeMigration(
    "nodetool.text.StripAccents",
    'return { output: inputs.text.normalize("NFKD").replace(/[\\u0300-\\u036f]/g, "") };'
  ),
  textToCodeMigration(
    "nodetool.text.Slugify",
    // separator/lowercase/allow_unicode were real per-instance properties —
    // read them from the dynamic inputs rather than the shared snippet's
    // hardcoded defaults.
    `const text = String(inputs.text ?? "");
const separator = String(inputs.separator ?? "-");
const lowercase = inputs.lowercase === undefined ? true : Boolean(inputs.lowercase);
const allowUnicode = Boolean(inputs.allow_unicode ?? false);
let value = text.normalize("NFKD");
if (!allowUnicode) {
  value = value.replace(/[^\\x00-\\x7F]/g, "");
}
value = value.replace(/[^\\w\\s-]/g, "");
value = value.replace(/[\\s_-]+/g, separator).replace(/^[-_]+|[-_]+$/g, "");
if (lowercase) value = value.toLowerCase();
return { output: value };`
  ),
  textToCodeMigration(
    "nodetool.text.HasLength",
    // min_length/max_length/exact_length were real per-instance properties —
    // read them from the dynamic inputs rather than the shared snippet's demo
    // bounds (0 means unset; an exact length wins over min/max).
    `const minLength = Number(inputs.min_length ?? 0);
const maxLength = Number(inputs.max_length ?? 0);
const exactLength = Number(inputs.exact_length ?? 0);
const len = String(inputs.text ?? "").length;
if (exactLength > 0) return { output: len === exactLength };
if (minLength > 0 && len < minLength) return { output: false };
if (maxLength > 0 && len > maxLength) return { output: false };
return { output: true };`
  ),
  textToCodeMigration(
    "nodetool.text.TruncateText",
    // max_length/ellipsis were real per-instance properties — read them from
    // the dynamic inputs rather than the shared snippet's demo values.
    `const text = String(inputs.text ?? "");
const maxLen = Number(inputs.max_length ?? 100);
const ellipsis = String(inputs.ellipsis ?? "");
if (text.length <= maxLen) return { output: text };
return { output: text.slice(0, maxLen - ellipsis.length) + ellipsis };`
  ),
  textToCodeMigration(
    "nodetool.text.PadText",
    // The shared "Pad String" snippet returns padStart/padEnd separately;
    // PadText picked one via a `direction` property and exposed it as a
    // single `output`, so keep that contract for old edges wired to it.
    `const text = String(inputs.text ?? "");
const len = Number(inputs.length ?? 0);
const ch = String(inputs.pad_character ?? " ");
const dir = String(inputs.direction ?? "right");
let output = text;
if (len > text.length) {
  if (dir === "left") output = text.padStart(len, ch);
  else if (dir === "both") {
    const total = len - text.length;
    const left = Math.floor(total / 2);
    output = ch.repeat(left) + text + ch.repeat(total - left);
  } else output = text.padEnd(len, ch);
}
return { output };`
  ),
  textToCodeMigration(
    "nodetool.text.Length",
    // The shared "Measure Length" snippet returns chars/words/lines
    // separately; Length picked one via a `measure` property and exposed it
    // as a single `output`, so keep that contract for old edges wired to it.
    `const text = String(inputs.text ?? "");
const measure = String(inputs.measure ?? "characters");
let output = text.length;
if (measure === "words") output = text.split(/\\s+/).filter(Boolean).length;
else if (measure === "lines") output = text.split(/\\r?\\n/).length;
return { output };`
  ),
  textToCodeMigration(
    "nodetool.text.IndexOf",
    "return { output: inputs.text.indexOf(inputs.substring) };"
  ),
  textToCodeMigration(
    "nodetool.text.SurroundWith",
    "return { output: inputs.prefix + inputs.text + inputs.suffix };"
  ),
  textToCodeMigration(
    "nodetool.text.Replace",
    "return { output: inputs.text.replaceAll(inputs.search, inputs.replacement) };",
    { old: "search", new_value: "replacement" }
  ),
  textToCodeMigration(
    "nodetool.text.ToString",
    // mode was a real per-instance property ("str" for a plain string, "repr"
    // for a JSON-quoted one) — honor it instead of always JSON-stringifying,
    // which would wrap every already-string value in extra quotes.
    `const v = inputs.value;
const mode = String(inputs.mode ?? "str");
const toJsonString = (value) => {
  if (value === undefined) return "";
  try {
    const json = JSON.stringify(value);
    return json === undefined ? "" : json;
  } catch (_error) {
    return String(value);
  }
};
if (mode === "repr") return { output: toJsonString(v) };
if (v === null || v === undefined) return { output: "" };
if (typeof v === "object") return { output: toJsonString(v) };
return { output: String(v) };`
  ),

  // PageCount and SearchText stay as Code rewrites. ExtractTextBlocks and
  // PageMetadata have no text-layer equivalent, so they stay unmigrated.
  pdfToCodeMigration("lib.pdf.PageCount", "return { output: pages.length };"),
  pdfToCodeMigration(
    "lib.pdf.SearchText",
    `${PDF_PAGE_RANGE}
const phrase = String(inputs.phrase ?? "");
const caseSensitive = Boolean(inputs.case_sensitive ?? false);
const matches = [];
if (phrase !== "") {
  const needle = caseSensitive ? phrase : phrase.toLowerCase();
  for (let i = start; i <= end; i++) {
    const page = pages[i];
    if (!page) continue;
    const haystack = caseSensitive ? page.text : page.text.toLowerCase();
    let at = haystack.indexOf(needle);
    while (at !== -1) {
      matches.push({ page: i, text: page.text.slice(at, at + phrase.length) });
      at = haystack.indexOf(needle, at + needle.length);
    }
  }
}
return { output: matches };`
  )
];

const MIGRATION_BY_FROM: ReadonlyMap<string, NodeTypeMigration> = new Map(
  NODE_TYPE_MIGRATIONS.map((m) => [m.from, m])
);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Return a renamed copy of `container`, or undefined if nothing changed. */
function renameKeys(
  container: unknown,
  renames: Record<string, string>
): Record<string, unknown> | undefined {
  if (!isPlainObject(container)) return undefined;
  let next: Record<string, unknown> | undefined;
  for (const [from, to] of Object.entries(renames)) {
    if (from in container && !(to in container)) {
      next ??= { ...container };
      next[to] = next[from];
      delete next[from];
    }
  }
  return next;
}

/** A raw workflow graph shape loose enough for migration before validation. */
export interface MigratableGraph {
  nodes?: unknown;
  edges?: unknown;
}

/**
 * Rewrite removed node types in a raw workflow graph to their replacements
 * (see {@link NODE_TYPE_MIGRATIONS}). Pure and non-mutating: returns the same
 * reference when nothing matched, otherwise a shallow copy with only the
 * changed nodes, edges, and their `data`/`properties` cloned. Cheap enough to
 * call on every load.
 */
export function migrateGraphNodeTypes<T extends MigratableGraph>(graph: T): T {
  if (!isPlainObject(graph) || !Array.isArray(graph.nodes)) return graph;

  const handleRenamesByNodeId = new Map<string, Record<string, string>>();
  let changed = false;

  const nodes = graph.nodes.map((node) => {
    if (!isPlainObject(node) || !isString(node.type)) return node;
    const migration = MIGRATION_BY_FROM.get(node.type);
    if (!migration) return node;
    changed = true;
    const next: Record<string, unknown> = { ...node, type: migration.to };
    if (migration.renameProperties) {
      const renamedData = renameKeys(next.data, migration.renameProperties);
      if (renamedData) next.data = renamedData;
      const renamedProps = renameKeys(
        next.properties,
        migration.renameProperties
      );
      if (renamedProps) next.properties = renamedProps;
      if (isString(next.id)) {
        handleRenamesByNodeId.set(next.id, migration.renameProperties);
      }
    }

    if (migration.moveRemainingPropertiesToDynamic) {
      const moved: Record<string, unknown> = {};
      if (isPlainObject(next.data)) {
        Object.assign(moved, next.data);
        next.data = {};
      }
      if (isPlainObject(next.properties)) {
        Object.assign(moved, next.properties);
        next.properties = {};
      }
      if (Object.keys(moved).length > 0) {
        const existing = isPlainObject(next.dynamic_properties)
          ? next.dynamic_properties
          : {};
        next.dynamic_properties = { ...existing, ...moved };
      }
    }

    if (migration.setProperties) {
      if (isPlainObject(next.data) || "data" in next) {
        const existing = isPlainObject(next.data) ? next.data : {};
        next.data = { ...existing, ...migration.setProperties };
      }
      if (isPlainObject(next.properties) || "properties" in next) {
        const existing = isPlainObject(next.properties) ? next.properties : {};
        next.properties = { ...existing, ...migration.setProperties };
      }
      if (!("data" in next) && !("properties" in next)) {
        next.properties = { ...migration.setProperties };
      }
    }

    return next;
  });

  if (!changed) return graph;

  let edges = graph.edges;
  if (handleRenamesByNodeId.size > 0 && Array.isArray(edges)) {
    edges = edges.map((edge) => {
      if (!isPlainObject(edge) || !isString(edge.target)) return edge;
      const renames = handleRenamesByNodeId.get(edge.target);
      if (
        renames &&
        isString(edge.targetHandle) &&
        edge.targetHandle in renames
      ) {
        return { ...edge, targetHandle: renames[edge.targetHandle] };
      }
      return edge;
    });
  }

  return { ...graph, nodes, edges } as T;
}
