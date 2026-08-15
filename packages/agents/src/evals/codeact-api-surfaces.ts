/**
 * CodeAct eval cases for the `nodetool.*` object model — data and creative
 * namespaces: collections, memory, shared, web, documents, email, style, apps,
 * timelines, sketches, scripts, storyboards.
 *
 * The fakes here are named EXACTLY like the belt tools those namespaces wrap
 * (`NODETOOL_API_NAMESPACE_TOOLS`), so the real guest prelude loads and every
 * `nodetool.<ns>.<method>()` call lands on one of them with the argument names
 * the prelude sends. The world behind them is small, in-memory, deterministic
 * and internally consistent: an indexed chunk becomes findable, a voiced line
 * becomes assemblable, a rendered still unblocks a clip, a planted validation
 * issue is fixable by an edit. Cases score the outcome, never one working
 * order.
 */

import { Tool } from "../tools/base-tool.js";
import {
  RecordingTool,
  type CodeActEvalCase,
  type CodeActToolRecorder
} from "./codeact-cases.js";

// ---------------------------------------------------------------------------
// param coercion
// ---------------------------------------------------------------------------

const str = (value: unknown, fallback = ""): string =>
  typeof value === "string" ? value : fallback;

const num = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const rec = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const recList = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? value.map(rec) : [];

const strList = (value: unknown): string[] => {
  if (typeof value === "string") return [value];
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
};

/** Words, with a dotted run kept whole so "4.2" and "example.dev" survive. */
const words = (text: string): string[] =>
  text.toLowerCase().match(/[a-z0-9]+(?:\.[a-z0-9]+)*/g) ?? [];

/** Fake relevance: how many distinct query words the text repeats. */
const overlap = (query: string, text: string): number => {
  const haystack = new Set(words(text));
  let score = 0;
  for (const word of new Set(words(query))) {
    if (haystack.has(word)) score++;
  }
  return score;
};

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const obj = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: "object",
  properties,
  ...(required.length > 0 ? { required } : {})
});

const S = { type: "string" };
const N = { type: "number" };
const B = { type: "boolean" };
const ANY_ARRAY = { type: "array" };

// ---------------------------------------------------------------------------
// world
// ---------------------------------------------------------------------------

interface CollectionDoc {
  id: string;
  text: string;
}

interface IndexedChunk {
  source_id: string;
  text: string;
  metadata: Record<string, unknown>;
}

interface MemoryEntry {
  memory_id: string;
  title: string;
  content: string;
  kind: string;
  resources: unknown[];
}

interface ChatMessage {
  id: string;
  thread_id: string;
  role: string;
  text: string;
  created_at: string;
  tool_calls?: Array<{ id: string; name: string; args: Record<string, unknown> }>;
}

interface ChatThread {
  id: string;
  title: string;
  updated_at: string;
}

interface SharedEntry {
  key: string;
  kind: string;
  title: string;
  value: unknown;
}

interface WebPage {
  url: string;
  title: string;
  snippet: string;
  text: string;
}

interface EmailMessage {
  message_id: string;
  subject: string;
  from: string;
  hours_ago: number;
  labels: string[];
  archived: boolean;
}

interface TimelineTrack {
  id: string;
  type: string;
  name: string;
}

interface TimelineClip {
  id: string;
  trackId: string;
  name: string;
  startMs: number;
  durationMs: number;
  animations: Array<{ role: string; preset: string }>;
}

interface TimelineDoc {
  id: string;
  name: string;
  tracks: TimelineTrack[];
  clips: TimelineClip[];
}

interface SketchLayer {
  id: string;
  name: string;
  opacity: number;
  blendMode: string;
  visible: boolean;
}

interface SketchDoc {
  id: string;
  name: string;
  layers: SketchLayer[];
  activeLayerId: string;
}

interface DocVersion {
  version: number;
  name: string;
  save_type: string;
  document: unknown;
}

interface ScriptLine {
  id: string;
  speaker: string;
  text: string;
  status: "draft" | "stale" | "voiced";
  take: string | null;
  duration_seconds: number;
}

interface ScriptDoc {
  script_id: string;
  name: string;
  cast: Array<{ name: string; provider: string; model: string; voice: string }>;
  lines: ScriptLine[];
}

interface Shot {
  id: string;
  slug: string;
  action: string;
  duration_seconds: number;
  still: string | null;
  clip: string | null;
  revision: number;
}

interface StoryboardDoc {
  storyboard_id: string;
  name: string;
  image_model: { provider: string; model: string };
  video_model: { provider: string; model: string };
  shots: Shot[];
}

const HANDBOOK: CollectionDoc[] = [
  {
    id: "policy-refunds",
    text: "The refund window is 30 days. A refund is issued to the original card."
  },
  {
    id: "policy-shipping",
    text: "Standard shipping takes 5 business days after dispatch."
  },
  {
    id: "policy-warranty",
    text: "Hardware carries a 24 month warranty against manufacturing defects."
  }
];

const WEB_PAGES: WebPage[] = [
  {
    url: "https://example.dev/nodetool/release-notes",
    title: "NodeTool 4.2 release notes",
    snippet: "Everything that shipped in the NodeTool 4.2 release.",
    text:
      "NodeTool 4.2 release notes. Agent actions now run inside a QuickJS " +
      "sandbox. The release ships 58 packages and one desktop app."
  },
  {
    url: "https://example.dev/nodetool/pricing",
    title: "NodeTool pricing",
    snippet: "Plans and per-seat prices.",
    text: "The team plan costs 20 euro per seat per month."
  },
  {
    url: "https://example.dev/blog/codeact",
    title: "Why CodeAct",
    snippet: "Acting by writing code instead of JSON tool calls.",
    text: "CodeAct lets one action chain many tool calls in a loop."
  }
];

const PDF_TEXT =
  "Q3 revenue reached 4.2 million euro across 1,280 accounts. " +
  "Churn held at 1.1 percent.";

const STYLE_PROFILE =
  "Terse copy. High-contrast dark surfaces. No exclamation marks. " +
  "Prefers one accent colour over a palette.";

/** Fresh, isolated world state — one per `createSurfaceApiTools` call. */
function createWorld() {
  return {
    indexed: [] as IndexedChunk[],
    memories: [
      {
        memory_id: "mem_seed_1",
        title: "workspace layout",
        content: "Reports live under reports/ in the workspace.",
        kind: "note",
        resources: []
      }
    ] as MemoryEntry[],
    memorySeq: 1,
    // Two past conversations. What was actually generated is only in a tool
    // call's arguments, which the thread listing summarizes away — so the
    // case has to read the message itself rather than the transcript.
    threads: [
      {
        id: "th_banner",
        title: "Launch banner images",
        updated_at: "2026-02-10T09:00:00.000Z"
      },
      {
        id: "th_refunds",
        title: "Refund policy wording",
        updated_at: "2026-01-05T09:00:00.000Z"
      }
    ] as ChatThread[],
    chatMessages: [
      {
        id: "msg_refunds_1",
        thread_id: "th_refunds",
        role: "user",
        text: "How long is the refund window?",
        created_at: "2026-01-05T08:59:00.000Z"
      },
      {
        id: "msg_refunds_2",
        thread_id: "th_refunds",
        role: "assistant",
        text: "Thirty days from delivery.",
        created_at: "2026-01-05T09:00:00.000Z"
      },
      {
        id: "msg_banner_1",
        thread_id: "th_banner",
        role: "user",
        text: "Make the launch banner.",
        created_at: "2026-02-10T08:59:00.000Z"
      },
      {
        id: "msg_banner_2",
        thread_id: "th_banner",
        role: "assistant",
        text: "Generated the banner.",
        created_at: "2026-02-10T09:00:00.000Z",
        tool_calls: [
          {
            id: "call_1",
            name: "generate_image",
            args: { model: "fal_ai/flux/dev", prompt: "launch banner" }
          }
        ]
      }
    ] as ChatMessage[],
    // Run-scoped agent memory, seeded with what upstream steps left behind:
    // the numbers are only here, so the case has to read them.
    shared: [
      {
        key: "task:pricing",
        kind: "task_result",
        title: "Pricing research",
        value: { tier: "pro", monthly_usd: 49 }
      },
      {
        key: "step:draft",
        kind: "step_result",
        title: "Announcement draft",
        value: "The pro tier is our best value."
      }
    ] as SharedEntry[],
    emails: [
      {
        message_id: "msg_1",
        subject: "Invoice 8841 due",
        from: "billing@vendor.example",
        hours_ago: 3,
        labels: [],
        archived: false
      },
      {
        message_id: "msg_2",
        subject: "Invoice 8842 due",
        from: "billing@vendor.example",
        hours_ago: 11,
        labels: [],
        archived: false
      },
      {
        message_id: "msg_3",
        subject: "Team lunch on Friday",
        from: "office@acme.example",
        hours_ago: 5,
        labels: [],
        archived: false
      },
      {
        message_id: "msg_4",
        subject: "Invoice 8840 paid",
        from: "billing@vendor.example",
        hours_ago: 100,
        labels: [],
        archived: false
      }
    ] as EmailMessage[],
    preferences: [
      "Chose the terse headline over the playful one.",
      "Rejected the pastel palette."
    ] as string[],
    apps: new Set<string>(["app_notes"]),
    timelines: new Map<string, TimelineDoc>([
      [
        "tl_promo",
        {
          id: "tl_promo",
          name: "Promo cut",
          tracks: [{ id: "track_video", type: "video", name: "Video" }],
          clips: [
            {
              id: "clip_shot",
              trackId: "track_video",
              name: "shot",
              startMs: 0,
              durationMs: 6000,
              animations: []
            },
            // Planted: this clip names a track the document does not have.
            {
              id: "clip_title",
              trackId: "track_text",
              name: "Title",
              startMs: 0,
              durationMs: 2000,
              animations: []
            }
          ]
        }
      ]
    ]),
    sketches: new Map<string, SketchDoc>([
      [
        "img_cover",
        {
          id: "img_cover",
          name: "Cover",
          layers: [
            {
              id: "layer_bg",
              name: "Background",
              opacity: 1,
              blendMode: "normal",
              visible: true
            },
            {
              id: "layer_art",
              name: "Art",
              opacity: 0.9,
              blendMode: "normal",
              visible: true
            }
          ],
          // Planted: no layer carries this id.
          activeLayerId: "layer_ghost"
        }
      ]
    ]),
    versions: new Map<string, DocVersion[]>(),
    scripts: new Map<string, ScriptDoc>([
      [
        "scr_intro",
        {
          script_id: "scr_intro",
          name: "Intro voiceover",
          cast: [
            {
              name: "Narrator",
              provider: "openai",
              model: "tts-1",
              voice: "alloy"
            }
          ],
          lines: [
            {
              id: "line_1",
              speaker: "Narrator",
              text: "Welcome to NodeTool.",
              status: "voiced",
              take: "asset://take_line_1",
              duration_seconds: 2
            },
            {
              id: "line_2",
              speaker: "Narrator",
              text: "Everything here is a graph.",
              status: "draft",
              take: null,
              duration_seconds: 0
            },
            {
              id: "line_3",
              speaker: "Narrator",
              text: "Let us begin.",
              status: "stale",
              take: "asset://take_line_3_old",
              duration_seconds: 2
            }
          ]
        }
      ]
    ]),
    storyboards: new Map<string, StoryboardDoc>([
      [
        "sb_lighthouse",
        {
          storyboard_id: "sb_lighthouse",
          name: "Lighthouse",
          image_model: { provider: "fal_ai", model: "fal-ai/flux/schnell" },
          video_model: { provider: "fal_ai", model: "fal-ai/ltx" },
          shots: [
            {
              id: "shot_1",
              slug: "wide-lighthouse",
              action: "Wide of the lighthouse at dusk",
              duration_seconds: 4,
              still: "asset://still_shot_1",
              clip: null,
              revision: 1
            },
            {
              id: "shot_2",
              slug: "keeper-door",
              action: "The keeper closes the door",
              duration_seconds: 3,
              still: null,
              clip: null,
              revision: 1
            },
            {
              id: "shot_3",
              slug: "beam-sweep",
              action: "The beam sweeps across the water",
              duration_seconds: 5,
              still: null,
              clip: null,
              revision: 1
            }
          ]
        }
      ]
    ])
  };
}

type World = ReturnType<typeof createWorld>;

// ---------------------------------------------------------------------------
// document helpers
// ---------------------------------------------------------------------------

const ANIMATION_PRESETS = ["fade", "slide", "zoom", "wipe"];
const BLEND_MODES = ["normal", "multiply", "screen", "overlay", "add"];

const slug = (text: string): string =>
  text.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "item";

function needTimeline(world: World, id: string): TimelineDoc {
  const doc = world.timelines.get(id);
  if (!doc) throw new Error(`no timeline sequence with id "${id}"`);
  return doc;
}

function needSketch(world: World, id: string): SketchDoc {
  const doc = world.sketches.get(id);
  if (!doc) throw new Error(`no image document with id "${id}"`);
  return doc;
}

interface Issue {
  severity: string;
  code: string;
  message: string;
  clip?: string;
  track?: string;
  layer?: string;
}

function timelineIssues(doc: TimelineDoc): Issue[] {
  const issues: Issue[] = [];
  const trackIds = new Set(doc.tracks.map((t) => t.id));
  for (const clip of doc.clips) {
    if (!trackIds.has(clip.trackId)) {
      issues.push({
        severity: "error",
        code: "missing_track",
        message: `clip "${clip.name}" sits on track "${clip.trackId}", which the document does not have`,
        clip: clip.id,
        track: clip.trackId
      });
    }
    if (clip.durationMs <= 0) {
      issues.push({
        severity: "error",
        code: "zero_duration",
        message: `clip "${clip.name}" has no duration`,
        clip: clip.id
      });
    }
    for (const animation of clip.animations) {
      if (!ANIMATION_PRESETS.includes(animation.preset)) {
        issues.push({
          severity: "error",
          code: "unknown_preset",
          message: `clip "${clip.name}" uses animation preset "${animation.preset}", which does not exist`,
          clip: clip.id
        });
      }
    }
  }
  return issues;
}

function sketchIssues(doc: SketchDoc): Issue[] {
  const issues: Issue[] = [];
  const layerIds = new Set(doc.layers.map((l) => l.id));
  if (!layerIds.has(doc.activeLayerId)) {
    issues.push({
      severity: "error",
      code: "dangling_active_layer",
      message: `activeLayerId "${doc.activeLayerId}" names no layer in this document`,
      layer: doc.activeLayerId
    });
  }
  if (layerIds.size !== doc.layers.length) {
    issues.push({
      severity: "error",
      code: "duplicate_layer_id",
      message: "two layers share one id"
    });
  }
  for (const layer of doc.layers) {
    if (layer.opacity < 0 || layer.opacity > 1) {
      issues.push({
        severity: "error",
        code: "opacity_out_of_range",
        message: `layer "${layer.name}" has opacity ${layer.opacity}`,
        layer: layer.id
      });
    }
    if (!BLEND_MODES.includes(layer.blendMode)) {
      issues.push({
        severity: "error",
        code: "unknown_blend_mode",
        message: `layer "${layer.name}" uses blend mode "${layer.blendMode}", which no compositor ships`,
        layer: layer.id
      });
    }
  }
  return issues;
}

function snapshotVersion(
  world: World,
  key: string,
  name: string,
  saveType: string,
  document: unknown
): DocVersion {
  const list = world.versions.get(key) ?? [];
  const entry: DocVersion = {
    version: list.length + 1,
    name,
    save_type: saveType,
    document: clone(document)
  };
  list.push(entry);
  world.versions.set(key, list);
  return entry;
}

function findClip(doc: TimelineDoc, target: string): TimelineClip {
  const found = doc.clips.find((c) => c.id === target || c.name === target);
  if (!found) {
    throw new Error(
      `no clip matching "${target}" (have ${doc.clips.map((c) => c.id).join(", ")})`
    );
  }
  return found;
}

function findLayer(doc: SketchDoc, target: string): SketchLayer {
  const found = doc.layers.find((l) => l.id === target || l.name === target);
  if (!found) {
    throw new Error(
      `no layer matching "${target}" (have ${doc.layers.map((l) => l.id).join(", ")})`
    );
  }
  return found;
}

/** Apply one timeline edit op; throws with the op named when it cannot. */
function applyTimelineOp(doc: TimelineDoc, op: Record<string, unknown>): void {
  const kind = str(op["op"]);
  switch (kind) {
    case "get_state":
      return;
    case "add_track": {
      const type = str(op["type"], "video");
      let id = str(op["id"]) || `track_${type}`;
      let n = 2;
      while (doc.tracks.some((t) => t.id === id)) id = `track_${type}_${n++}`;
      doc.tracks.push({ id, type, name: str(op["name"], type) });
      return;
    }
    case "add_text_clip": {
      const track = doc.tracks.find((t) => t.type === "text");
      if (!track) throw new Error("the document has no text track to add to");
      const text = str(op["text"], "Text");
      doc.clips.push({
        id: `clip_${slug(text)}`,
        trackId: track.id,
        name: text,
        startMs: num(op["startMs"], 0),
        durationMs: num(op["durationMs"], 2000),
        animations: []
      });
      return;
    }
    case "split_clip": {
      const clip = findClip(doc, str(op["target"]));
      const atMs = num(op["atMs"], Math.round(clip.durationMs / 2));
      const offset = atMs - clip.startMs;
      if (offset <= 0 || offset >= clip.durationMs) {
        throw new Error(`atMs ${atMs} is outside clip "${clip.id}"`);
      }
      const tail: TimelineClip = {
        id: `${clip.id}_b`,
        trackId: clip.trackId,
        name: `${clip.name} (b)`,
        startMs: atMs,
        durationMs: clip.durationMs - offset,
        animations: []
      };
      clip.durationMs = offset;
      doc.clips.push(tail);
      return;
    }
    case "animate_clip": {
      const clip = findClip(doc, str(op["target"]));
      clip.animations = recList(op["animations"]).map((a) => ({
        role: str(a["role"], "in"),
        preset: str(a["preset"], "fade")
      }));
      return;
    }
    case "move_clip": {
      const clip = findClip(doc, str(op["target"]));
      clip.startMs = num(op["startMs"], clip.startMs);
      return;
    }
    case "remove_clip": {
      const clip = findClip(doc, str(op["target"]));
      doc.clips = doc.clips.filter((c) => c.id !== clip.id);
      return;
    }
    default:
      throw new Error(
        `unknown op "${kind}" — try get_state, add_track, add_text_clip, ` +
          "split_clip, animate_clip, move_clip, remove_clip"
      );
  }
}

function applySketchOp(doc: SketchDoc, op: Record<string, unknown>): void {
  const kind = str(op["op"]);
  switch (kind) {
    case "get_state":
      return;
    case "add_layer": {
      const name = str(op["name"], "Layer");
      let id = str(op["id"]) || `layer_${slug(name)}`;
      let n = 2;
      while (doc.layers.some((l) => l.id === id)) id = `layer_${slug(name)}_${n++}`;
      doc.layers.push({
        id,
        name,
        opacity: num(op["opacity"], 1),
        blendMode: str(op["blendMode"], "normal"),
        visible: true
      });
      return;
    }
    case "set_layer_props": {
      const layer = findLayer(doc, str(op["target"]));
      if (op["opacity"] !== undefined) layer.opacity = num(op["opacity"], layer.opacity);
      if (op["blendMode"] !== undefined) layer.blendMode = str(op["blendMode"], layer.blendMode);
      if (op["visible"] !== undefined) layer.visible = op["visible"] !== false;
      if (op["name"] !== undefined) layer.name = str(op["name"], layer.name);
      return;
    }
    case "set_active_layer": {
      const layer = findLayer(doc, str(op["target"]));
      doc.activeLayerId = layer.id;
      return;
    }
    case "remove_layer": {
      const layer = findLayer(doc, str(op["target"]));
      doc.layers = doc.layers.filter((l) => l.id !== layer.id);
      return;
    }
    default:
      throw new Error(
        `unknown op "${kind}" — try get_state, add_layer, set_layer_props, ` +
          "set_active_layer, remove_layer"
      );
  }
}

function applyScriptOp(doc: ScriptDoc, op: Record<string, unknown>): void {
  const kind = str(op["op"]);
  switch (kind) {
    case "get_state":
      return;
    case "add_speaker": {
      const name = str(op["name"], "Speaker");
      doc.cast.push({
        name,
        provider: str(op["provider"], "openai"),
        model: str(op["model"], "tts-1"),
        voice: str(op["voice"], "alloy")
      });
      return;
    }
    case "add_line": {
      doc.lines.push({
        id: `line_${doc.lines.length + 1}`,
        speaker: str(op["speaker"], doc.cast[0]?.name ?? "Narrator"),
        text: str(op["text"]),
        status: "draft",
        take: null,
        duration_seconds: 0
      });
      return;
    }
    case "set_line_text": {
      const target = str(op["target"]);
      const line = doc.lines.find((l) => l.id === target);
      if (!line) throw new Error(`no line with id "${target}"`);
      line.text = str(op["text"], line.text);
      if (line.status === "voiced") line.status = "stale";
      return;
    }
    default:
      throw new Error(
        `unknown op "${kind}" — try get_state, add_speaker, add_line, set_line_text`
      );
  }
}

function applyStoryboardOp(
  doc: StoryboardDoc,
  op: Record<string, unknown>
): void {
  const kind = str(op["op"]);
  switch (kind) {
    case "get_state":
      return;
    case "add_shot": {
      const action = str(op["action"], "Shot");
      doc.shots.push({
        id: `shot_${doc.shots.length + 1}`,
        slug: slug(action).slice(0, 24),
        action,
        duration_seconds: num(op["duration_seconds"], 3),
        still: null,
        clip: null,
        revision: 1
      });
      return;
    }
    case "reorder_shot": {
      const target = str(op["target"]);
      const from = doc.shots.findIndex((s) => s.id === target || s.slug === target);
      if (from < 0) throw new Error(`no shot matching "${target}"`);
      const [shot] = doc.shots.splice(from, 1);
      doc.shots.splice(Math.max(0, num(op["index"], 0)), 0, shot);
      return;
    }
    case "set_shot": {
      const target = str(op["target"]);
      const shot = doc.shots.find((s) => s.id === target || s.slug === target);
      if (!shot) throw new Error(`no shot matching "${target}"`);
      if (op["action"] !== undefined) shot.action = str(op["action"], shot.action);
      if (op["duration_seconds"] !== undefined) {
        shot.duration_seconds = num(op["duration_seconds"], shot.duration_seconds);
      }
      return;
    }
    default:
      throw new Error(
        `unknown op "${kind}" — try get_state, add_shot, reorder_shot, set_shot`
      );
  }
}

/** Resolve `targets` (ids, slugs, or indexes) against a shot list. */
function resolveShots(doc: StoryboardDoc, targets: unknown): Shot[] {
  const wanted = Array.isArray(targets) ? targets : [];
  if (wanted.length === 0) return [];
  return wanted.map((entry) => {
    if (typeof entry === "number") {
      const shot = doc.shots[entry];
      if (!shot) throw new Error(`no shot at index ${entry}`);
      return shot;
    }
    const key = String(entry);
    const shot = doc.shots.find((s) => s.id === key || s.slug === key);
    if (!shot) throw new Error(`no shot matching "${key}"`);
    return shot;
  });
}

// ---------------------------------------------------------------------------
// the belt
// ---------------------------------------------------------------------------

/**
 * Instrumented fakes for the data + creative belt tools, over a fresh world.
 * `web_search` is the one search entry point — the real tool routes across
 * its configured backends host-side, so the belt carries no per-provider
 * search duplicates.
 */
export function createSurfaceApiTools(recorder: CodeActToolRecorder): Tool[] {
  const world = createWorld();
  const tool = (
    name: string,
    description: string,
    schema: Record<string, unknown>,
    impl: (params: Record<string, unknown>) => unknown
  ): Tool => new RecordingTool(name, description, schema, recorder, impl);

  return [
    // -- collections ------------------------------------------------------
    tool("list_collections", "List vector collections.", obj({}), () => ({
      collections: [
        { name: "handbook", count: HANDBOOK.length },
        { name: "scratch", count: 0 }
      ]
    })),
    tool(
      "query_collection",
      "Semantic search over a named collection.",
      obj({ collection: S, query: S, n_results: N }, ["collection"]),
      (params) => {
        const name = str(params["collection"]);
        if (name !== "handbook") {
          throw new Error(`no collection named "${name}" — try handbook`);
        }
        const query = str(params["query"]);
        const limit = num(params["n_results"], 5);
        const ranked = HANDBOOK.map((doc) => ({
          id: doc.id,
          text: doc.text,
          score: overlap(query, doc.text)
        })).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
        return { collection: name, results: ranked.slice(0, limit) };
      }
    ),
    tool(
      "vector_index",
      "Index one chunk of text under a source id.",
      obj({ text: S, source_id: S, metadata: obj({}) }, ["text", "source_id"]),
      (params) => {
        const sourceId = str(params["source_id"]);
        const text = str(params["text"]);
        if (!sourceId || !text) {
          throw new Error("vector_index needs both text and source_id");
        }
        world.indexed = world.indexed.filter((c) => c.source_id !== sourceId);
        world.indexed.push({
          source_id: sourceId,
          text,
          metadata: rec(params["metadata"])
        });
        return { indexed: 1, source_id: sourceId, total: world.indexed.length };
      }
    ),
    tool(
      "vector_batch_index",
      "Index many chunks at once.",
      obj({ chunks: ANY_ARRAY, base_metadata: obj({}) }, ["chunks"]),
      (params) => {
        const chunks = recList(params["chunks"]);
        for (const chunk of chunks) {
          const sourceId = str(chunk["source_id"]);
          if (!sourceId) throw new Error("every chunk needs a source_id");
          world.indexed = world.indexed.filter((c) => c.source_id !== sourceId);
          world.indexed.push({
            source_id: sourceId,
            text: str(chunk["text"]),
            metadata: {
              ...rec(params["base_metadata"]),
              ...rec(chunk["metadata"])
            }
          });
        }
        return { indexed: chunks.length, total: world.indexed.length };
      }
    ),
    tool(
      "vector_text_search",
      "Semantic search over the indexed chunks.",
      obj({ text: S, n_results: N }, ["text"]),
      (params) => {
        const query = str(params["text"]);
        const limit = num(params["n_results"], 5);
        const ranked = world.indexed
          .map((chunk) => ({
            source_id: chunk.source_id,
            text: chunk.text,
            metadata: chunk.metadata,
            score: overlap(query, chunk.text)
          }))
          .filter((hit) => hit.score > 0)
          .sort(
            (a, b) => b.score - a.score || a.source_id.localeCompare(b.source_id)
          );
        return { query, results: ranked.slice(0, limit) };
      }
    ),
    tool(
      "vector_hybrid_search",
      "Semantic + keyword search fused by reciprocal rank.",
      obj({ text: S, n_results: N, k_constant: N }, ["text"]),
      (params) => {
        const query = str(params["text"]);
        const limit = num(params["n_results"], 5);
        const ranked = world.indexed
          .map((chunk) => ({
            source_id: chunk.source_id,
            text: chunk.text,
            // Keyword half nudges exact-substring hits up.
            score:
              overlap(query, chunk.text) +
              (chunk.text.toLowerCase().includes(query.toLowerCase()) ? 1 : 0)
          }))
          .filter((hit) => hit.score > 0)
          .sort(
            (a, b) => b.score - a.score || a.source_id.localeCompare(b.source_id)
          );
        return { query, results: ranked.slice(0, limit) };
      }
    ),

    // -- memory -----------------------------------------------------------
    tool(
      "thread_memory_save",
      "Remember something durably in this conversation.",
      obj({ content: S, title: S, kind: S, resources: ANY_ARRAY }, ["content"]),
      (params) => {
        const content = str(params["content"]);
        if (!content) throw new Error("thread_memory_save needs content");
        const entry: MemoryEntry = {
          memory_id: `mem_${++world.memorySeq}`,
          title: str(params["title"], content.slice(0, 40)),
          content,
          kind: str(params["kind"], "note"),
          resources: Array.isArray(params["resources"]) ? params["resources"] : []
        };
        world.memories.push(entry);
        return { saved: true, memory_id: entry.memory_id };
      }
    ),
    tool(
      "thread_memory_list",
      "List this conversation's memories.",
      obj({ limit: N }),
      (params) => ({
        memories: world.memories.slice(0, num(params["limit"], 50)).map(clone)
      })
    ),
    tool(
      "thread_memory_update",
      "Update a memory by id.",
      obj({ memory_id: S, content: S, title: S, resources: ANY_ARRAY }, [
        "memory_id"
      ]),
      (params) => {
        const id = str(params["memory_id"]);
        const entry = world.memories.find((m) => m.memory_id === id);
        if (!entry) throw new Error(`no memory with id "${id}"`);
        if (params["content"] !== undefined) entry.content = str(params["content"], entry.content);
        if (params["title"] !== undefined) entry.title = str(params["title"], entry.title);
        if (Array.isArray(params["resources"])) entry.resources = params["resources"];
        return { updated: true, memory_id: id };
      }
    ),
    tool(
      "thread_memory_delete",
      "Delete a memory by id.",
      obj({ memory_id: S }, ["memory_id"]),
      (params) => {
        const id = str(params["memory_id"]);
        const before = world.memories.length;
        world.memories = world.memories.filter((m) => m.memory_id !== id);
        if (world.memories.length === before) {
          throw new Error(`no memory with id "${id}"`);
        }
        return { deleted: true, memory_id: id };
      }
    ),

    // -- threads ----------------------------------------------------------
    tool(
      "list_threads",
      "List past chat threads, most recently updated first.",
      obj({ limit: N, workflow_id: S, cursor: S, preview: B }),
      (params) => {
        const wanted = num(params["limit"], 20);
        const rows = [...world.threads]
          .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1))
          .slice(0, wanted);
        return {
          threads: rows.map((thread) => {
            const last = [...world.chatMessages]
              .filter((m) => m.thread_id === thread.id)
              .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0];
            return {
              ...clone(thread),
              last_message:
                params["preview"] === false || !last
                  ? undefined
                  : { id: last.id, role: last.role, text: last.text }
            };
          })
        };
      }
    ),
    tool(
      "get_thread",
      "Read one thread and a page of its messages.",
      obj(
        {
          thread_id: S,
          limit: N,
          newest_first: B,
          cursor: S,
          max_chars: N
        },
        ["thread_id"]
      ),
      (params) => {
        const id = str(params["thread_id"]);
        const thread = world.threads.find((t) => t.id === id);
        if (!thread) throw new Error(`no thread with id "${id}"`);
        const ordered = world.chatMessages
          .filter((m) => m.thread_id === id)
          .sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
        const rows = params["newest_first"] === true
          ? ordered.reverse()
          : ordered;
        return {
          ...clone(thread),
          // Tool calls come back named but without their arguments — the
          // summary the real capability returns.
          messages: rows.slice(0, num(params["limit"], 50)).map((m) => ({
            id: m.id,
            role: m.role,
            text: m.text,
            created_at: m.created_at,
            tool_calls: m.tool_calls?.map((c) => ({ id: c.id, name: c.name }))
          }))
        };
      }
    ),
    tool(
      "get_message",
      "Read one chat message in full, arguments and all.",
      obj({ message_id: S }, ["message_id"]),
      (params) => {
        const id = str(params["message_id"]);
        const message = world.chatMessages.find((m) => m.id === id);
        if (!message) throw new Error(`no message with id "${id}"`);
        return clone(message);
      }
    ),

    // -- shared -----------------------------------------------------------
    tool(
      "list_shared",
      "List entries in shared agent memory (metadata only).",
      obj({ kind: ANY_ARRAY, key_prefix: S, sources: ANY_ARRAY }),
      (params) => {
        const kinds = strList(params["kind"]);
        const prefix = str(params["key_prefix"]);
        const entries = world.shared
          .filter((e) => kinds.length === 0 || kinds.includes(e.kind))
          .filter((e) => !prefix || e.key.startsWith(prefix))
          .map((e) => ({
            key: e.key,
            kind: e.kind,
            title: e.title,
            valueBytes: JSON.stringify(e.value).length
          }));
        return { total: entries.length, returned: entries.length, entries };
      }
    ),
    tool(
      "read_shared",
      "Read full values from shared agent memory by key.",
      obj({ keys: ANY_ARRAY }, ["keys"]),
      (params) => {
        const entries: Record<string, unknown> = {};
        const missing: string[] = [];
        for (const key of strList(params["keys"])) {
          // A bare suffix falls back to the `shared:` namespace, the way the
          // real capability does.
          const hit =
            world.shared.find((e) => e.key === key) ??
            (key.includes(":")
              ? undefined
              : world.shared.find((e) => e.key === `shared:${key}`));
          if (hit) entries[key] = clone(hit);
          else missing.push(key);
        }
        return { entries, missing };
      }
    ),
    tool(
      "share_result",
      "Publish a value under the `shared:` namespace.",
      obj({ key: S, value: {}, title: S, description: S }, ["key", "value"]),
      (params) => {
        const raw = str(params["key"]);
        if (!raw) throw new Error("share_result needs a key");
        const suffix = raw.startsWith("shared:")
          ? raw.slice("shared:".length)
          : raw;
        const key = `shared:${suffix}`;
        const entry: SharedEntry = {
          key,
          kind: "shared",
          title: str(params["title"], suffix),
          value: params["value"]
        };
        const existing = world.shared.findIndex((e) => e.key === key);
        if (existing >= 0) world.shared[existing] = entry;
        else world.shared.push(entry);
        return { ok: true, key, kind: "shared" };
      }
    ),

    // -- web --------------------------------------------------------------
    tool(
      "web_search",
      "Search the web (routes across configured backends host-side).",
      obj({ query: S, backend: S, max_results: N }, ["query"]),
      (params) => {
        const query = str(params["query"]);
        const ranked = WEB_PAGES.map((page) => ({
          title: page.title,
          url: page.url,
          snippet: page.snippet,
          score: overlap(query, `${page.title} ${page.snippet} ${page.url}`)
        }))
          .sort((a, b) => b.score - a.score || a.url.localeCompare(b.url))
          .slice(0, num(params["max_results"], 5));
        return { query, results: ranked };
      }
    ),
    tool(
      "google_news",
      "News search.",
      obj({ keyword: S }, ["keyword"]),
      (params) => ({
        keyword: str(params["keyword"]),
        results: [
          {
            title: "NodeTool 4.2 lands the CodeAct sandbox",
            url: "https://news.example.dev/nodetool-4-2",
            published: "2026-07-02"
          }
        ]
      })
    ),
    tool(
      "http_request",
      "One HTTP request; returns the body as text.",
      obj({ url: S, method: S, headers: obj({}), body: S }, ["url"]),
      (params) => {
        const url = str(params["url"]);
        const page = WEB_PAGES.find((p) => p.url === url);
        return page
          ? { status: 200, url, body: page.text }
          : { status: 404, url, body: "" };
      }
    ),
    tool(
      "browser",
      "Fetch a page and return its readable text.",
      obj({ url: S }, ["url"]),
      (params) => {
        const url = str(params["url"]);
        const page = WEB_PAGES.find((p) => p.url === url);
        if (!page) throw new Error(`nothing served at ${url}`);
        return { url, title: page.title, text: page.text };
      }
    ),
    tool(
      "download_file",
      "Save a URL's bytes into the workspace.",
      obj({ url: S, output_file: S }, ["url", "output_file"]),
      (params) => {
        const url = str(params["url"]);
        const page = WEB_PAGES.find((p) => p.url === url);
        if (!page) throw new Error(`nothing served at ${url}`);
        return {
          output_file: str(params["output_file"]),
          bytes: page.text.length
        };
      }
    ),

    // -- documents --------------------------------------------------------
    tool(
      "extract_pdf_text",
      "Extract text from a PDF in the workspace.",
      obj({ path: S, start_page: N, end_page: N }, ["path"]),
      (params) => {
        const path = str(params["path"]);
        if (path !== "reports/q3.pdf") {
          throw new Error(`no such file: ${path} (the workspace has reports/q3.pdf)`);
        }
        return { path, pages: 1, text: PDF_TEXT };
      }
    ),
    tool(
      "extract_pdf_tables",
      "Extract a PDF's tables to a JSON file.",
      obj({ path: S, output_file: S }, ["path", "output_file"]),
      (params) => {
        const path = str(params["path"]);
        if (path !== "reports/q3.pdf") throw new Error(`no such file: ${path}`);
        return {
          path,
          output_file: str(params["output_file"], "tables.json"),
          tables: 1,
          rows: 3
        };
      }
    ),
    tool(
      "convert_pdf_to_markdown",
      "Convert a PDF to markdown.",
      obj({ input_file: S, output_file: S }, ["input_file", "output_file"]),
      (params) => {
        const input = str(params["input_file"]);
        if (input !== "reports/q3.pdf") throw new Error(`no such file: ${input}`);
        const output = str(params["output_file"], "out.md");
        return { output_file: output, characters: PDF_TEXT.length + 8 };
      }
    ),
    tool(
      "convert_markdown_to_pdf",
      "Convert markdown to a PDF.",
      obj({ input_file: S, output_file: S }, ["input_file", "output_file"]),
      (params) => ({
        output_file: str(params["output_file"], "out.pdf"),
        pages: 1
      })
    ),
    tool(
      "convert_document",
      "Convert a document from one format to another.",
      obj(
        {
          input_file: S,
          output_file: S,
          from_format: S,
          to_format: S,
          extra_args: ANY_ARRAY
        },
        ["input_file", "output_file"]
      ),
      (params) => ({
        input_file: str(params["input_file"]),
        output_file: str(params["output_file"]),
        converted: true
      })
    ),

    // -- email ------------------------------------------------------------
    tool(
      "search_email",
      "Search the mailbox.",
      obj({
        subject: S,
        text: S,
        from: S,
        since_hours_ago: N,
        max_results: N,
        include_archived: B
      }),
      (params) => {
        const subject = str(params["subject"]).toLowerCase();
        const text = str(params["text"]).toLowerCase();
        const from = str(params["from"]).toLowerCase();
        const since = num(params["since_hours_ago"], Number.POSITIVE_INFINITY);
        const includeArchived = params["include_archived"] === true;
        const matched = world.emails.filter((message) => {
          if (!includeArchived && message.archived) return false;
          if (message.hours_ago > since) return false;
          const haystack = `${message.subject} ${message.from}`.toLowerCase();
          if (subject && !message.subject.toLowerCase().includes(subject)) return false;
          if (from && !message.from.toLowerCase().includes(from)) return false;
          if (text && !haystack.includes(text)) return false;
          return true;
        });
        return {
          messages: matched
            .slice(0, num(params["max_results"], 25))
            .map((message) => ({
              message_id: message.message_id,
              subject: message.subject,
              from: message.from,
              hours_ago: message.hours_ago,
              labels: [...message.labels]
            }))
        };
      }
    ),
    tool(
      "add_label_to_email",
      "Add one label to one message.",
      obj({ message_id: S, label: S }, ["message_id", "label"]),
      (params) => {
        const id = str(params["message_id"]);
        const label = str(params["label"]);
        const message = world.emails.find((m) => m.message_id === id);
        if (!message) throw new Error(`no message with id "${id}"`);
        if (!label) throw new Error("add_label_to_email needs a label");
        if (!message.labels.includes(label)) message.labels.push(label);
        return { message_id: id, labels: [...message.labels] };
      }
    ),
    tool(
      "archive_email",
      "Archive messages by id.",
      obj({ message_ids: ANY_ARRAY }, ["message_ids"]),
      (params) => {
        const ids = strList(params["message_ids"]);
        let archived = 0;
        for (const id of ids) {
          const message = world.emails.find((m) => m.message_id === id);
          if (!message) throw new Error(`no message with id "${id}"`);
          if (!message.archived) {
            message.archived = true;
            archived++;
          }
        }
        return { archived, message_ids: ids };
      }
    ),

    // -- style ------------------------------------------------------------
    tool(
      "get_style_profile",
      "The user's accumulated taste as a prompt-ready block.",
      obj({ query: S, k: N }),
      () => ({
        profile: STYLE_PROFILE,
        items: world.preferences.map((takeaway, i) => ({
          id: `pref_${i + 1}`,
          takeaway
        }))
      })
    ),
    tool(
      "record_style_preference",
      "Record one preference learned from a choice or a correction.",
      obj({ takeaway: S, chosen: S, rejected: S, brief: S }, ["takeaway"]),
      (params) => {
        const takeaway = str(params["takeaway"]);
        if (!takeaway) throw new Error("record_style_preference needs a takeaway");
        world.preferences.push(takeaway);
        return {
          recorded: true,
          id: `pref_${world.preferences.length}`,
          total: world.preferences.length
        };
      }
    ),

    // -- apps -------------------------------------------------------------
    tool(
      "debug_app",
      "Validate and simulate a saved app.",
      obj({ application_id: S, params: obj({}), interact: ANY_ARRAY, run: B }, [
        "application_id"
      ]),
      (params) => {
        const id = str(params["application_id"]);
        if (!world.apps.has(id)) throw new Error(`no application with id "${id}"`);
        return {
          application_id: id,
          verdict: { ok: true, issues: [] },
          ran: params["run"] !== false,
          widgets: [
            { id: "Input-1", type: "TextInput" },
            { id: "Button-1", type: "Button" },
            { id: "Text-1", type: "Text" }
          ]
        };
      }
    ),

    // -- timelines --------------------------------------------------------
    tool("list_timelines", "List saved timeline sequences.", obj({ limit: N }), () => ({
      timelines: [...world.timelines.values()].map((doc) => ({
        timeline_id: doc.id,
        name: doc.name,
        tracks: doc.tracks.length,
        clips: doc.clips.length
      }))
    })),
    tool(
      "validate_timeline",
      "Statically check a timeline sequence.",
      obj({ timeline_id: S, document: obj({}) }),
      (params) => {
        const id = str(params["timeline_id"]);
        const doc = id
          ? needTimeline(world, id)
          : (rec(params["document"]) as unknown as TimelineDoc);
        const issues = timelineIssues({
          id: str((doc as TimelineDoc).id, "inline"),
          name: str((doc as TimelineDoc).name, "inline"),
          tracks: (doc as TimelineDoc).tracks ?? [],
          clips: (doc as TimelineDoc).clips ?? []
        });
        return { ok: issues.length === 0, issues, warnings: [] };
      }
    ),
    tool(
      "edit_timeline",
      "Apply document edits to a saved sequence.",
      obj({ timeline_id: S, ops: ANY_ARRAY }, ["timeline_id", "ops"]),
      (params) => {
        const doc = needTimeline(world, str(params["timeline_id"]));
        const ops = recList(params["ops"]);
        if (ops.length === 0) throw new Error("edit_timeline needs at least one op");
        ops.forEach((op, index) => {
          try {
            applyTimelineOp(doc, op);
          } catch (e) {
            throw new Error(
              `edit_timeline: op ${index + 1} (${str(op["op"], "?")}): ` +
                (e instanceof Error ? e.message : String(e))
            );
          }
        });
        return { ok: true, applied: ops.length, document: clone(doc) };
      }
    ),
    tool(
      "list_timeline_versions",
      "List a sequence's snapshot history.",
      obj({ timeline_id: S, save_type: S, limit: N }, ["timeline_id"]),
      (params) => {
        const id = str(params["timeline_id"]);
        needTimeline(world, id);
        return {
          timeline_id: id,
          versions: (world.versions.get(`timeline:${id}`) ?? []).map((v) => ({
            version: v.version,
            name: v.name,
            save_type: v.save_type
          }))
        };
      }
    ),
    tool(
      "get_timeline_version",
      "Read one snapshot without restoring it.",
      obj({ timeline_id: S, version: N }, ["timeline_id", "version"]),
      (params) => {
        const id = str(params["timeline_id"]);
        const version = num(params["version"], 0);
        const found = (world.versions.get(`timeline:${id}`) ?? []).find(
          (v) => v.version === version
        );
        if (!found) throw new Error(`no version ${version} for timeline "${id}"`);
        return { timeline_id: id, version, document: clone(found.document) };
      }
    ),
    tool(
      "create_timeline_version",
      "Snapshot a sequence's current document.",
      obj({ timeline_id: S, name: S }, ["timeline_id"]),
      (params) => {
        const id = str(params["timeline_id"]);
        const doc = needTimeline(world, id);
        const entry = snapshotVersion(
          world,
          `timeline:${id}`,
          str(params["name"], "manual save"),
          "manual",
          doc
        );
        return { timeline_id: id, version: entry.version, name: entry.name };
      }
    ),
    tool(
      "restore_timeline_version",
      "Restore a snapshot, snapshotting the current state first.",
      obj({ timeline_id: S, version: N }, ["timeline_id", "version"]),
      (params) => {
        const id = str(params["timeline_id"]);
        const doc = needTimeline(world, id);
        const version = num(params["version"], 0);
        const found = (world.versions.get(`timeline:${id}`) ?? []).find(
          (v) => v.version === version
        );
        if (!found) throw new Error(`no version ${version} for timeline "${id}"`);
        snapshotVersion(world, `timeline:${id}`, "before restore", "restore", doc);
        const restored = clone(found.document) as TimelineDoc;
        world.timelines.set(id, restored);
        const issues = timelineIssues(restored);
        return {
          timeline_id: id,
          restored: version,
          validation: { ok: issues.length === 0, issues }
        };
      }
    ),

    // -- sketches ---------------------------------------------------------
    tool("list_sketches", "List saved image documents.", obj({ limit: N }), () => ({
      sketches: [...world.sketches.values()].map((doc) => ({
        image_document_id: doc.id,
        name: doc.name,
        layers: doc.layers.length
      }))
    })),
    tool(
      "validate_sketch",
      "Statically check an image document.",
      obj({ image_document_id: S, document: obj({}) }),
      (params) => {
        const id = str(params["image_document_id"]);
        const raw = id
          ? needSketch(world, id)
          : (rec(params["document"]) as unknown as SketchDoc);
        const issues = sketchIssues({
          id: str(raw.id, "inline"),
          name: str(raw.name, "inline"),
          layers: raw.layers ?? [],
          activeLayerId: str(raw.activeLayerId)
        });
        return { ok: issues.length === 0, issues, warnings: [] };
      }
    ),
    tool(
      "edit_sketch",
      "Apply layer-structure edits to a saved sketch.",
      obj({ image_document_id: S, ops: ANY_ARRAY }, ["image_document_id", "ops"]),
      (params) => {
        const doc = needSketch(world, str(params["image_document_id"]));
        const ops = recList(params["ops"]);
        if (ops.length === 0) throw new Error("edit_sketch needs at least one op");
        ops.forEach((op, index) => {
          try {
            applySketchOp(doc, op);
          } catch (e) {
            throw new Error(
              `edit_sketch: op ${index + 1} (${str(op["op"], "?")}): ` +
                (e instanceof Error ? e.message : String(e))
            );
          }
        });
        return { ok: true, applied: ops.length, document: clone(doc) };
      }
    ),
    tool(
      "list_sketch_versions",
      "List an image document's snapshot history.",
      obj({ image_document_id: S, limit: N }, ["image_document_id"]),
      (params) => {
        const id = str(params["image_document_id"]);
        needSketch(world, id);
        return {
          image_document_id: id,
          versions: (world.versions.get(`sketch:${id}`) ?? []).map((v) => ({
            version: v.version,
            name: v.name,
            save_type: v.save_type
          }))
        };
      }
    ),
    tool(
      "get_sketch_version",
      "Read one sketch snapshot without restoring it.",
      obj({ image_document_id: S, version: N }, ["image_document_id", "version"]),
      (params) => {
        const id = str(params["image_document_id"]);
        const version = num(params["version"], 0);
        const found = (world.versions.get(`sketch:${id}`) ?? []).find(
          (v) => v.version === version
        );
        if (!found) throw new Error(`no version ${version} for sketch "${id}"`);
        return { image_document_id: id, version, document: clone(found.document) };
      }
    ),
    tool(
      "create_sketch_version",
      "Snapshot a sketch's current document.",
      obj({ image_document_id: S, name: S }, ["image_document_id"]),
      (params) => {
        const id = str(params["image_document_id"]);
        const doc = needSketch(world, id);
        const entry = snapshotVersion(
          world,
          `sketch:${id}`,
          str(params["name"], "manual save"),
          "manual",
          doc
        );
        return { image_document_id: id, version: entry.version, name: entry.name };
      }
    ),
    tool(
      "restore_sketch_version",
      "Restore a sketch snapshot, snapshotting the current state first.",
      obj({ image_document_id: S, version: N }, ["image_document_id", "version"]),
      (params) => {
        const id = str(params["image_document_id"]);
        const doc = needSketch(world, id);
        const version = num(params["version"], 0);
        const found = (world.versions.get(`sketch:${id}`) ?? []).find(
          (v) => v.version === version
        );
        if (!found) throw new Error(`no version ${version} for sketch "${id}"`);
        snapshotVersion(world, `sketch:${id}`, "before restore", "restore", doc);
        const restored = clone(found.document) as SketchDoc;
        world.sketches.set(id, restored);
        const issues = sketchIssues(restored);
        return {
          image_document_id: id,
          restored: version,
          validation: { ok: issues.length === 0, issues }
        };
      }
    ),

    // -- scripts ----------------------------------------------------------
    tool("list_scripts", "List saved scripts.", obj({ limit: N }), () => ({
      scripts: [...world.scripts.values()].map((doc) => ({
        script_id: doc.script_id,
        name: doc.name,
        lines: doc.lines.length,
        voiced: doc.lines.filter((l) => l.status === "voiced").length
      }))
    })),
    tool(
      "get_script",
      "One script: cast, lines, and each line's voicing status.",
      obj({ script_id: S }, ["script_id"]),
      (params) => {
        const id = str(params["script_id"]);
        const doc = world.scripts.get(id);
        if (!doc) throw new Error(`no script with id "${id}"`);
        return clone(doc);
      }
    ),
    tool(
      "voice_script_lines",
      "Synthesize a take per line; defaults to every draft or stale line.",
      obj({
        script_id: S,
        targets: ANY_ARRAY,
        provider: S,
        model: S,
        voice: S,
        transcribe: B
      }, ["script_id"]),
      (params) => {
        const id = str(params["script_id"]);
        const doc = world.scripts.get(id);
        if (!doc) throw new Error(`no script with id "${id}"`);
        const requested = strList(params["targets"]);
        const targets =
          requested.length > 0
            ? requested.map((target) => {
                const line = doc.lines.find((l) => l.id === target);
                if (!line) throw new Error(`no line with id "${target}"`);
                return line;
              })
            : doc.lines.filter((l) => l.status !== "voiced");
        const voiced: string[] = [];
        const skipped: string[] = [];
        for (const line of targets) {
          if (line.status === "voiced" && requested.length === 0) {
            skipped.push(line.id);
            continue;
          }
          line.status = "voiced";
          line.take = `asset://take_${line.id}`;
          line.duration_seconds = Math.max(1, Math.round(line.text.length / 10));
          voiced.push(line.id);
        }
        return { script_id: id, voiced, skipped };
      }
    ),
    tool(
      "assemble_script_timeline",
      "Lay the voiced takes end to end into a saved timeline sequence.",
      obj({ script_id: S, name: S }, ["script_id"]),
      (params) => {
        const id = str(params["script_id"]);
        const doc = world.scripts.get(id);
        if (!doc) throw new Error(`no script with id "${id}"`);
        const voiced = doc.lines.filter((l) => l.status === "voiced");
        if (voiced.length === 0) {
          throw new Error(`script "${id}" has no voiced takes to assemble`);
        }
        const timelineId = `tl_${id}`;
        let startMs = 0;
        const clips: TimelineClip[] = voiced.map((line) => {
          const clip: TimelineClip = {
            id: `clip_${line.id}`,
            trackId: "track_voiceover",
            name: line.text.slice(0, 24),
            startMs,
            durationMs: line.duration_seconds * 1000,
            animations: []
          };
          startMs += clip.durationMs;
          return clip;
        });
        world.timelines.set(timelineId, {
          id: timelineId,
          name: `${doc.name} voiceover`,
          tracks: [{ id: "track_voiceover", type: "audio", name: "Voiceover" }],
          clips
        });
        return {
          timeline_id: timelineId,
          clips: clips.length,
          skipped: doc.lines.length - voiced.length,
          duration_seconds: startMs / 1000
        };
      }
    ),
    tool(
      "edit_script",
      "Apply cast/line edits to a saved script.",
      obj({ script_id: S, ops: ANY_ARRAY }, ["script_id", "ops"]),
      (params) => {
        const id = str(params["script_id"]);
        const doc = world.scripts.get(id);
        if (!doc) throw new Error(`no script with id "${id}"`);
        const ops = recList(params["ops"]);
        if (ops.length === 0) throw new Error("edit_script needs at least one op");
        ops.forEach((op, index) => {
          try {
            applyScriptOp(doc, op);
          } catch (e) {
            throw new Error(
              `edit_script: op ${index + 1} (${str(op["op"], "?")}): ` +
                (e instanceof Error ? e.message : String(e))
            );
          }
        });
        return { ok: true, applied: ops.length, document: clone(doc) };
      }
    ),

    // -- storyboards ------------------------------------------------------
    tool("list_storyboards", "List saved storyboards.", obj({ limit: N }), () => ({
      storyboards: [...world.storyboards.values()].map((doc) => ({
        storyboard_id: doc.storyboard_id,
        name: doc.name,
        shots: doc.shots.length,
        stills: doc.shots.filter((s) => s.still !== null).length,
        clips: doc.shots.filter((s) => s.clip !== null).length
      }))
    })),
    tool(
      "get_storyboard",
      "One board: its shots, their status, and its models.",
      obj({ storyboard_id: S }, ["storyboard_id"]),
      (params) => {
        const id = str(params["storyboard_id"]);
        const doc = world.storyboards.get(id);
        if (!doc) throw new Error(`no storyboard with id "${id}"`);
        return {
          storyboard_id: doc.storyboard_id,
          name: doc.name,
          image_model: doc.image_model,
          video_model: doc.video_model,
          shots: doc.shots.map((shot) => ({
            id: shot.id,
            slug: shot.slug,
            action: shot.action,
            duration_seconds: shot.duration_seconds,
            has_still: shot.still !== null,
            has_clip: shot.clip !== null,
            revision: shot.revision
          }))
        };
      }
    ),
    tool(
      "render_storyboard_stills",
      "Render a keyframe per shot; defaults to every shot without one.",
      obj({ storyboard_id: S, targets: ANY_ARRAY, provider: S, model: S }, [
        "storyboard_id"
      ]),
      (params) => {
        const id = str(params["storyboard_id"]);
        const doc = world.storyboards.get(id);
        if (!doc) throw new Error(`no storyboard with id "${id}"`);
        const requested = resolveShots(doc, params["targets"]);
        const targets =
          requested.length > 0 ? requested : doc.shots.filter((s) => s.still === null);
        const rendered: string[] = [];
        for (const shot of targets) {
          shot.still = `asset://still_${shot.id}`;
          rendered.push(shot.id);
        }
        return {
          storyboard_id: id,
          rendered,
          model: str(params["model"], doc.image_model.model)
        };
      }
    ),
    tool(
      "render_storyboard_clips",
      "Animate each shot's keyframe into a clip; a shot without a still is skipped.",
      obj({ storyboard_id: S, targets: ANY_ARRAY, provider: S, model: S }, [
        "storyboard_id"
      ]),
      (params) => {
        const id = str(params["storyboard_id"]);
        const doc = world.storyboards.get(id);
        if (!doc) throw new Error(`no storyboard with id "${id}"`);
        const requested = resolveShots(doc, params["targets"]);
        const targets =
          requested.length > 0 ? requested : doc.shots.filter((s) => s.clip === null);
        const rendered: string[] = [];
        const skipped: Array<{ id: string; reason: string }> = [];
        for (const shot of targets) {
          if (shot.still === null) {
            skipped.push({ id: shot.id, reason: "no keyframe — render its still first" });
            continue;
          }
          shot.clip = `asset://clip_${shot.id}`;
          rendered.push(shot.id);
        }
        return {
          storyboard_id: id,
          rendered,
          skipped,
          model: str(params["model"], doc.video_model.model)
        };
      }
    ),
    tool(
      "revise_storyboard_clip",
      "Revise one shot's clip.",
      obj({ storyboard_id: S, target: S, instruction: S }, [
        "storyboard_id",
        "target",
        "instruction"
      ]),
      (params) => {
        const id = str(params["storyboard_id"]);
        const doc = world.storyboards.get(id);
        if (!doc) throw new Error(`no storyboard with id "${id}"`);
        const [shot] = resolveShots(doc, [str(params["target"])]);
        if (shot.clip === null) throw new Error(`shot "${shot.id}" has no clip to revise`);
        shot.revision++;
        shot.clip = `asset://clip_${shot.id}_r${shot.revision}`;
        return { storyboard_id: id, revised: shot.id, revision: shot.revision };
      }
    ),
    tool(
      "assemble_storyboard_timeline",
      "Lay the rendered clips into a saved timeline sequence.",
      obj({ storyboard_id: S, name: S }, ["storyboard_id"]),
      (params) => {
        const id = str(params["storyboard_id"]);
        const doc = world.storyboards.get(id);
        if (!doc) throw new Error(`no storyboard with id "${id}"`);
        const shots = doc.shots.filter((s) => s.clip !== null);
        if (shots.length === 0) {
          throw new Error(`board "${id}" has no rendered clips to assemble`);
        }
        const timelineId = `tl_${id}`;
        let startMs = 0;
        const clips: TimelineClip[] = shots.map((shot) => {
          const clip: TimelineClip = {
            id: `clip_${shot.id}`,
            trackId: "track_video",
            name: shot.slug,
            startMs,
            durationMs: shot.duration_seconds * 1000,
            animations: []
          };
          startMs += clip.durationMs;
          return clip;
        });
        world.timelines.set(timelineId, {
          id: timelineId,
          name: `${doc.name} cut`,
          tracks: [{ id: "track_video", type: "video", name: "Video" }],
          clips
        });
        return {
          timeline_id: timelineId,
          clips: clips.length,
          skipped: doc.shots.length - shots.length,
          duration_seconds: startMs / 1000
        };
      }
    ),
    tool(
      "edit_storyboard",
      "Apply shot-list edits to a saved board.",
      obj({ storyboard_id: S, ops: ANY_ARRAY }, ["storyboard_id", "ops"]),
      (params) => {
        const id = str(params["storyboard_id"]);
        const doc = world.storyboards.get(id);
        if (!doc) throw new Error(`no storyboard with id "${id}"`);
        const ops = recList(params["ops"]);
        if (ops.length === 0) throw new Error("edit_storyboard needs at least one op");
        ops.forEach((op, index) => {
          try {
            applyStoryboardOp(doc, op);
          } catch (e) {
            throw new Error(
              `edit_storyboard: op ${index + 1} (${str(op["op"], "?")}): ` +
                (e instanceof Error ? e.message : String(e))
            );
          }
        });
        return { ok: true, applied: ops.length, document: clone(doc) };
      }
    )
  ];
}

// ---------------------------------------------------------------------------
// cases
// ---------------------------------------------------------------------------

const field = (result: unknown, key: string): unknown => rec(result)[key];

const asNumber = (value: unknown): number =>
  typeof value === "number" ? value : Number.NaN;

const asString = (value: unknown): string =>
  typeof value === "string" ? value : "";

export const CODEACT_API_SURFACE_CASES: readonly CodeActEvalCase[] = [
  {
    id: "rag-index-and-answer",
    description: "Index a collection's documents, then answer from vector search",
    namespaces: ["collections"],
    objective:
      "The `handbook` collection holds our support policy, one document per " +
      "topic. Put those documents into the vector index — each under its own " +
      "document id as the source id — then use vector search to find how many " +
      "days the refund window is. Finish with {sourceId, days}: the source id " +
      "of the chunk that answered it, and the number of days as a number.",
    outputSchema: obj({ sourceId: S, days: N }, ["sourceId", "days"]),
    expect: {
      requiredTools: ["query_collection", "vector_text_search"],
      maxActions: 5,
      resultCheck: (r: unknown) =>
        asString(field(r, "sourceId")) === "policy-refunds" &&
        asNumber(field(r, "days")) === 30,
      resultCheckLabel: "sourceId=policy-refunds days=30"
    }
  },
  {
    id: "memory-lifecycle",
    description: "Save a memory, correct it in place, and read it back",
    namespaces: ["memory"],
    objective:
      'Remember for this conversation, under the title "preferred image ' +
      'model", that the house image model is fal_ai/flux/schnell. Then the ' +
      "user corrects you: it is really fal_ai/flux/dev. Update the note you " +
      "just saved in place — do not delete it or add a second one. Finish " +
      "with {memoryId, content, " +
      "total} — the id of that note, its content as the memory list now " +
      "reports it, and the FULL count of memories the list holds, unrelated " +
      "notes included.",
    outputSchema: obj({ memoryId: S, content: S, total: N }, [
      "memoryId",
      "content",
      "total"
    ]),
    expect: {
      requiredTools: [
        "thread_memory_save",
        "thread_memory_update",
        "thread_memory_list"
      ],
      maxActions: 4,
      resultCheck: (r: unknown) => {
        const content = asString(field(r, "content"));
        return (
          asString(field(r, "memoryId")).startsWith("mem_") &&
          content.includes("flux/dev") &&
          !content.includes("schnell") &&
          asNumber(field(r, "total")) === 2
        );
      },
      resultCheckLabel: "corrected note, 2 memories total"
    }
  },
  {
    id: "threads-recall",
    description: "Find a past conversation and read what it actually did",
    namespaces: ["threads"],
    objective:
      "In an earlier conversation we made the launch banner. Find that " +
      "thread among the past ones, read it, and report which image model the " +
      "banner was really generated with — the model id is in the arguments " +
      "of the tool call that made it, not in the text, so read that message " +
      "in full rather than guessing from the transcript. Finish with " +
      "{threadId, model}.",
    outputSchema: obj({ threadId: S, model: S }, ["threadId", "model"]),
    expect: {
      requiredTools: ["list_threads", "get_thread", "get_message"],
      maxActions: 4,
      resultCheck: (r: unknown) =>
        asString(field(r, "threadId")) === "th_banner" &&
        asString(field(r, "model")) === "fal_ai/flux/dev",
      resultCheckLabel: "th_banner generated with fal_ai/flux/dev"
    }
  },
  {
    id: "shared-handoff",
    description: "Read what upstream steps shared, then publish a derived value",
    namespaces: ["shared"],
    objective:
      "Earlier steps of this run left their results in shared memory. Find " +
      "the pricing result among them and read it — the numbers are only " +
      "there, so do not invent them. Work out the annual price at twelve " +
      "times the monthly one, and publish it into shared memory under the " +
      'key "annual_price" so later steps can use it. Finish with ' +
      "{monthlyUsd, annualUsd, publishedKey} — the monthly price you read, " +
      "the annual price you worked out, and the FULL key the publish call " +
      "reported back.",
    outputSchema: obj({ monthlyUsd: N, annualUsd: N, publishedKey: S }, [
      "monthlyUsd",
      "annualUsd",
      "publishedKey"
    ]),
    expect: {
      requiredTools: ["list_shared", "read_shared", "share_result"],
      maxActions: 4,
      resultCheck: (r: unknown) =>
        asNumber(field(r, "monthlyUsd")) === 49 &&
        asNumber(field(r, "annualUsd")) === 588 &&
        asString(field(r, "publishedKey")) === "shared:annual_price",
      resultCheckLabel: "49/588 published as shared:annual_price"
    }
  },
  {
    id: "web-research-brief",
    description: "Search the web, open the page, and report facts only the page carries",
    namespaces: ["web"],
    objective:
      "Find our NodeTool 4.2 release-notes page on the web and read it. " +
      "Finish with {url, version, sandbox}: the page's URL, the release " +
      "version, and the name of the JavaScript engine the release runs agent " +
      "actions in. The engine is not in the search snippet — you have to open " +
      "the page.",
    outputSchema: obj({ url: S, version: S, sandbox: S }, [
      "url",
      "version",
      "sandbox"
    ]),
    expect: {
      requiredTools: ["web_search"],
      maxActions: 4,
      resultCheck: (r: unknown) =>
        asString(field(r, "url")) ===
          "https://example.dev/nodetool/release-notes" &&
        String(field(r, "version")) === "4.2" &&
        asString(field(r, "sandbox")).toLowerCase().includes("quickjs"),
      resultCheckLabel: "release-notes url, 4.2, QuickJS"
    }
  },
  {
    id: "document-extraction-pipeline",
    description: "PDF → text, tables, and markdown in one pass",
    namespaces: ["documents"],
    objective:
      "The workspace holds reports/q3.pdf. Pull its tables out to " +
      "reports/q3-tables.json, convert the PDF itself to markdown at " +
      "reports/q3.md, and read the report's text. Finish with {accounts, " +
      "tableRows, markdownFile}: how many accounts the quarter's revenue " +
      "spanned (a number, no separators), how many table rows were " +
      "extracted, and the markdown file you wrote.",
    outputSchema: obj({ accounts: N, tableRows: N, markdownFile: S }, [
      "accounts",
      "tableRows",
      "markdownFile"
    ]),
    expect: {
      requiredTools: [
        "extract_pdf_text",
        "extract_pdf_tables",
        "convert_pdf_to_markdown"
      ],
      maxActions: 4,
      resultCheck: (r: unknown) =>
        asNumber(field(r, "accounts")) === 1280 &&
        asNumber(field(r, "tableRows")) === 3 &&
        asString(field(r, "markdownFile")) === "reports/q3.md",
      resultCheckLabel: "accounts=1280 rows=3 reports/q3.md"
    }
  },
  {
    id: "timeline-fix-and-validate",
    description: "Snapshot, repair a failing timeline, and re-validate clean",
    namespaces: ["timelines"],
    objective:
      "The timeline sequence tl_promo does not pass validation. Snapshot it " +
      "first so the repair is undoable, then fix what validation complains " +
      "about with a document edit, and check it again. Finish with " +
      "{issuesBefore, issuesAfter, trackCount, snapshotVersion}: the issue " +
      "counts before and after your edit, how many tracks the document ends " +
      "up with, and the version number your snapshot got.",
    outputSchema: obj(
      { issuesBefore: N, issuesAfter: N, trackCount: N, snapshotVersion: N },
      ["issuesBefore", "issuesAfter", "trackCount", "snapshotVersion"]
    ),
    expect: {
      requiredTools: [
        "validate_timeline",
        "create_timeline_version",
        "edit_timeline"
      ],
      maxActions: 5,
      resultCheck: (r: unknown) =>
        asNumber(field(r, "issuesBefore")) === 1 &&
        asNumber(field(r, "issuesAfter")) === 0 &&
        asNumber(field(r, "trackCount")) === 2 &&
        asNumber(field(r, "snapshotVersion")) === 1,
      resultCheckLabel: "1 issue → 0, 2 tracks, snapshot v1"
    }
  },
  {
    id: "sketch-layer-repair",
    description: "Fix a dangling active layer and add a styled layer",
    namespaces: ["sketches"],
    objective:
      "The image document img_cover does not pass validation. Fix it, and " +
      'while you are in there add a layer named "Glow" at 0.4 opacity in the ' +
      "multiply blend mode and leave it as the document's active layer. " +
      "Finish with {issuesBefore, issuesAfter, layerCount, glowOpacity, " +
      "activeLayerId} read back from the document.",
    outputSchema: obj(
      {
        issuesBefore: N,
        issuesAfter: N,
        layerCount: N,
        glowOpacity: N,
        activeLayerId: S
      },
      ["issuesBefore", "issuesAfter", "layerCount", "glowOpacity", "activeLayerId"]
    ),
    expect: {
      requiredTools: ["validate_sketch", "edit_sketch"],
      maxActions: 5,
      resultCheck: (r: unknown) =>
        asNumber(field(r, "issuesBefore")) === 1 &&
        asNumber(field(r, "issuesAfter")) === 0 &&
        asNumber(field(r, "layerCount")) === 3 &&
        asNumber(field(r, "glowOpacity")) === 0.4 &&
        asString(field(r, "activeLayerId")).length > 0 &&
        asString(field(r, "activeLayerId")) !== "layer_ghost",
      resultCheckLabel: "1 issue → 0, 3 layers, glow active at 0.4"
    }
  },
  {
    id: "script-voice-and-assemble",
    description: "Voice only the lines that need it, then assemble the voiceover",
    namespaces: ["scripts", "timelines"],
    objective:
      "Script scr_intro has lines that still need recording. Record exactly " +
      "those — leave the ones already voiced alone — then assemble the " +
      "voiceover timeline. Finish with {voiced, clips, timelineId}: the ids " +
      "you recorded (sorted), how many clips the assembled sequence holds, " +
      "and its timeline id.",
    outputSchema: obj({ voiced: ANY_ARRAY, clips: N, timelineId: S }, [
      "voiced",
      "clips",
      "timelineId"
    ]),
    expect: {
      requiredTools: ["voice_script_lines", "assemble_script_timeline"],
      maxActions: 4,
      resultCheck: (r: unknown) => {
        const voiced = strList(field(r, "voiced")).slice().sort().join(",");
        return (
          voiced === "line_2,line_3" &&
          asNumber(field(r, "clips")) === 3 &&
          asString(field(r, "timelineId")) === "tl_scr_intro"
        );
      },
      resultCheckLabel: "voiced line_2,line_3; 3 clips in tl_scr_intro"
    }
  },
  {
    id: "storyboard-render-and-assemble",
    description: "Stills, then clips, then a cut — in the order the board allows",
    namespaces: ["storyboards", "timelines"],
    objective:
      "Board sb_lighthouse is directed but unfinished. Every shot needs a " +
      "still and then a clip, and a clip can only be animated from a shot's " +
      "still. Get all three shots to a clip and assemble the cut. Finish " +
      "with {shotsWithClips, timelineId, durationSeconds} read back from the " +
      "board and the assembled sequence.",
    outputSchema: obj(
      { shotsWithClips: N, timelineId: S, durationSeconds: N },
      ["shotsWithClips", "timelineId", "durationSeconds"]
    ),
    expect: {
      requiredTools: [
        "render_storyboard_stills",
        "render_storyboard_clips",
        "assemble_storyboard_timeline"
      ],
      maxActions: 5,
      resultCheck: (r: unknown) =>
        asNumber(field(r, "shotsWithClips")) === 3 &&
        asString(field(r, "timelineId")) === "tl_sb_lighthouse" &&
        asNumber(field(r, "durationSeconds")) === 12,
      resultCheckLabel: "3 clips, tl_sb_lighthouse, 12s"
    }
  },
  {
    id: "email-triage",
    description: "Search, label, and archive the matching messages",
    namespaces: ["email"],
    objective:
      "Triage the mailbox: every message from the last 48 hours whose " +
      'subject mentions an invoice gets the label "billing" and is then ' +
      "archived. Finish with {labeled, archived, remaining}: the ids you " +
      "labeled (sorted), how many messages you archived, and how many " +
      "matching messages are still sitting in the inbox afterwards.",
    outputSchema: obj({ labeled: ANY_ARRAY, archived: N, remaining: N }, [
      "labeled",
      "archived",
      "remaining"
    ]),
    expect: {
      requiredTools: ["search_email", "add_label_to_email", "archive_email"],
      maxActions: 4,
      resultCheck: (r: unknown) => {
        const labeled = strList(field(r, "labeled")).slice().sort().join(",");
        return (
          labeled === "msg_1,msg_2" &&
          asNumber(field(r, "archived")) === 2 &&
          asNumber(field(r, "remaining")) === 0
        );
      },
      resultCheckLabel: "msg_1+msg_2 labeled and archived, inbox clear"
    }
  },
  {
    id: "style-aware-app-check",
    description: "Check a saved app's wiring for free, and record the user's taste",
    namespaces: ["style", "apps"],
    objective:
      "The app \"app_notes\" drafts a short note from a prompt. Read the " +
      "user's recorded style first, then run the FREE wiring check on that " +
      "app — no run, it costs nothing and spends nothing. Record that the " +
      "user liked the dark, high-contrast variant with the style recorder. " +
      "Finish with {verdictOk, ran, widgets, preferences} — the check's " +
      "verdict, whether it executed the app, how many widgets it reported, " +
      "and the preference count the style profile's details report after " +
      "your recording.",
    outputSchema: obj(
      { verdictOk: B, ran: B, widgets: N, preferences: N },
      ["verdictOk", "ran", "widgets", "preferences"]
    ),
    expect: {
      requiredTools: [
        "get_style_profile",
        "debug_app",
        "record_style_preference"
      ],
      maxActions: 5,
      resultCheck: (r: unknown) =>
        field(r, "verdictOk") === true &&
        field(r, "ran") === false &&
        asNumber(field(r, "widgets")) === 3 &&
        asNumber(field(r, "preferences")) === 3,
      resultCheckLabel: "free check ran, 3 widgets, 3 preferences"
    }
  }
].map((entry) => ({ ...entry, createTools: createSurfaceApiTools }));
