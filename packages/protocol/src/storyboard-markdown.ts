/**
 * A storyboard document written as Markdown, and read back.
 *
 * The Markdown is a view of {@link StoryboardDocumentSchema}. Every line maps
 * to a key the schema already has, and references use the encodings NodeTool
 * already stores:
 *
 * ```
 * # Title {#screenplay-id}         screenplay.title, screenplay.id
 * Text under the title             document.brief
 * - **Style:** …                   document.style (board fields: BOARD_FIELDS)
 * # Act I (Exposition) {#act-id}   screenplay.acts[]; text under it is the objective
 * ## Slugline {#scene-id}          screenplay.scenes[], with the act above as act_id
 * - **Lighting:** …                scene.lighting
 * ### Slug {#shot-id}              a shot: slug, id; index is its position
 * ![Still](asset://<id>.png)       shot.keyframe (a video file: shot.clip)
 * Text under a shot                shot.action
 * - **Motion:** …                  shot.motion (shot fields: SHOT_FIELDS)
 * [Nova](entity://<id>)            an entity mention: the id joins shot.entity_ids
 * [Shot 4](#<shot-id>)             a shot reference, used by transitions and continuities
 * ```
 *
 * `{#id}` is the Pandoc heading attribute. It is the join key with the stored
 * document: what the text does not show (takes, render records, status,
 * models, script links) is kept from `base` by id. Shot numbers are computed.
 *
 * Pure and dependency-free, so the web editor and the server read the text the
 * same way. The native editor uses a C++ port,
 * native/storyboard/src/StoryboardMarkdown.cpp. Its oracle test runs both on
 * the same boards and fails on any difference, so change them together.
 */

import type { StoryboardDocumentSchema } from "./api-schemas/storyboards.js";
import { isNumber, isRecord, isString } from "./predicates.js";

/** The entity fields the Markdown needs: the name for links, the kind for chips. */
export interface StoryboardMarkdownEntity {
  id: string;
  name: string;
  kind: string;
  descriptor?: string;
}
export type StoryboardMarkdownEntities = ReadonlyMap<string, StoryboardMarkdownEntity>;

/** What one line of the Markdown became. The editor draws from this. */
export interface StoryboardMarkdownLine {
  /** Line number, 0-based. */
  line: number;
  role: "blank" | "title" | "act" | "scene" | "shot" | "field" | "cont" | "text" | "still" | "clip" | "stray";
  /** Where the line's content starts, after its syntax. */
  bodyStart: number;
  /** Where a heading's content ends, before its `{#id}`. */
  bodyEnd?: number;
  /** Width of a heading's syntax in characters, so it can hang in the margin. */
  syntaxWidth?: number;
  /** The key the line writes, e.g. `motion`, `action`, `brief`, or `unknown`. */
  key?: string;
  /** Lines that write the same value share a group. */
  group?: string;
  /** "Shot 3 · Motion" */
  scope?: string;
  /** A shot's computed number, 1-based. */
  shotNumber?: number;
  shotId?: string;
  status?: string;
  /** The media reference of a still or clip line. */
  media?: string;
  warning?: StoryboardMarkdownWarning;
}

/** Why a line does not map cleanly. `code` and `params` let a surface word the message itself. */
export type StoryboardMarkdownWarningCode =
  | "media_outside_shot"
  | "second_media"
  | "unknown_shot_field"
  | "unknown_field"
  | "text_in_scene"
  | "bad_duration"
  | "bad_render"
  | "no_next_shot"
  | "missing_action";

export interface StoryboardMarkdownWarning {
  line: number;
  code: StoryboardMarkdownWarningCode;
  params: Record<string, string | number>;
  /** The message in English. */
  message: string;
}

/** A heading that has no id yet, and the id to write into it. */
export interface StoryboardMarkdownMissingId {
  line: number;
  id: string;
  /** An existing `{#id}` to replace, when the id was a duplicate. */
  replace: { start: number; text: string } | null;
}

export interface StoryboardMarkdownResult {
  document: StoryboardDocumentSchema;
  lines: StoryboardMarkdownLine[];
  warnings: StoryboardMarkdownWarning[];
  missingIds: StoryboardMarkdownMissingId[];
  /** Shot ids in board order. */
  shotOrder: string[];
}

export interface ParseStoryboardMarkdownOptions {
  /** The stored document. What the text does not show is kept from it by id. */
  base?: StoryboardDocumentSchema | null;
  entities?: StoryboardMarkdownEntities;
  /** Mints an id for a heading without one. Defaults to 32 hex characters. */
  generateId?: () => string;
}

type Rec = Record<string, unknown>;

export const STORYBOARD_MARKDOWN_ID = "[A-Za-z0-9._~-]+";
const ID = STORYBOARD_MARKDOWN_ID;
const ENTITY_LINK = new RegExp(`\\[([^\\]\\n]+)\\]\\(entity://(${ID})\\)|(?<![\\w(])entity://(${ID})`, "g");
const SHOT_LINK = new RegExp(`\\[([^\\]\\n]*)\\]\\(#(${ID})\\)`, "g");
const IMAGE = /^\s*!\[([^\]\n]*)\]\(([^)\s]+)\)\s*$/;
const VIDEO_EXT = /\.(mp4|webm|mov|m4v|mkv)$/i;
/** A media reference names a video file: its path, without query or fragment, ends in a video extension. */
const isVideoUri = (uri: string): boolean => VIDEO_EXT.test(uri.split(/[?#]/, 1)[0]);

/** Field labels, the first label of each key being the one written out. */
const SHOT_FIELDS: ReadonlyArray<readonly [string, string]> = [
  ["Action", "action"], ["Framing", "camera.framing"], ["Lens", "camera.lens"], ["Angle", "camera.angle"],
  ["Camera movement", "camera.movement"], ["Rig", "camera.equipment"], ["Camera presets", "camera.preset_ids"],
  ["Motion", "motion"], ["End", "end_state"], ["Sound", "sound"], ["Dialogue", "dialogue"], ["Narration", "narration"],
  ["Duration", "duration_seconds"], ["Render", "render_mode"], ["Location", "location_id"], ["Cast", "entity_ids"],
  ["Look", "look_preset_ids"], ["Transition", "transition"], ["Continuity", "continuity"], ["Notes", "notes"]
];
const SHOT_ALIASES: Readonly<Record<string, string>> = {
  "initial phase": "action", "initial frame": "action", "camera move": "camera.movement", equipment: "camera.equipment",
  movement: "motion", "end state": "end_state", "final phase": "end_state", "end frame": "end_state", voiceover: "narration",
  vo: "narration", mode: "render_mode", "render mode": "render_mode", entities: "entity_ids", characters: "entity_ids",
  references: "entity_ids", "look presets": "look_preset_ids", note: "notes"
};
const BOARD_FIELDS: ReadonlyArray<readonly [string, string]> = [
  ["Logline", "logline"], ["Brief", "brief"], ["Style", "style"], ["Aspect ratio", "aspectRatio"], ["Genre", "genre"],
  ["Cast", "entityIds"], ["Look", "look_preset_ids"], ["Music", "music_prompt"], ["Narration", "narration"],
  ["Motion design", "motion_direction"]
];
const BOARD_ALIASES: Readonly<Record<string, string>> = {
  "style bible": "style", aspect: "aspectRatio", "music prompt": "music_prompt", score: "music_prompt", entities: "entityIds", concept: "brief"
};
const ACT_FIELDS: ReadonlyArray<readonly [string, string]> = [["Objective", "objective"]];
const SCENE_FIELDS: ReadonlyArray<readonly [string, string]> = [["Lighting", "lighting"]];

type HolderType = "board" | "act" | "scene" | "shot";
const labelTable = (list: ReadonlyArray<readonly [string, string]>, aliases: Readonly<Record<string, string>> = {}): Map<string, string> => {
  const byLabel = new Map<string, string>();
  for (const [label, key] of list) byLabel.set(label.toLowerCase(), key);
  for (const [label, key] of Object.entries(aliases)) byLabel.set(label, key);
  return byLabel;
};
const FIELDS: Readonly<Record<HolderType, Map<string, string>>> = {
  board: labelTable(BOARD_FIELDS, BOARD_ALIASES),
  act: labelTable(ACT_FIELDS),
  scene: labelTable(SCENE_FIELDS),
  shot: labelTable(SHOT_FIELDS, SHOT_ALIASES)
};
const KNOWN_LABELS = new Set(Object.values(FIELDS).flatMap((table) => [...table.keys()]));

/** Shot keys the Markdown owns. Every other key of a stored shot is kept as it was. */
const SHOT_TEXT_KEYS = new Set(["slug", "action", "motion", "end_state", "sound", "dialogue", "narration", "notes", "duration_seconds",
  "render_mode", "location_id", "entity_ids", "look_preset_ids", "keyframe", "clip", "scene_id", "index", "id", "type", "camera"]);
const CAMERA_TEXT_KEYS = ["framing", "lens", "angle", "movement", "equipment", "preset_ids"] as const;
const RENDER_MODES = new Set(["keyframe", "direct", "reference"]);
/** Fields written once per line: each line is one transition or continuity. */
const REPEATED = new Set(["transition", "continuity"]);

/* ── small helpers ───────────────────────────────────────────────────── */

const isRec = (value: unknown): value is Rec => isRecord(value);
const str = (value: unknown): string | undefined => (isString(value) ? value : undefined);
const strList = (value: unknown): string[] => (Array.isArray(value) ? value.filter(isString) : []);
const recList = (value: unknown): Rec[] => (Array.isArray(value) ? value.filter(isRec) : []);
const clone = <T>(value: T): T => (value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T));
const isEmptyValue = (value: unknown): boolean =>
  value === "" || (Array.isArray(value) && value.length === 0) || (isRec(value) && Object.keys(value).length === 0);
const sameSet = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((x) => b.includes(x));
const defaultId = (): string => globalThis.crypto.randomUUID().replace(/-/g, "");
const assetIdOf = (uri: string): string | null => /^asset:\/\/([^./?#]+)/.exec(uri)?.[1] ?? null;
const refUri = (ref: unknown): string => {
  if (!isRec(ref)) return "";
  const uri = str(ref.uri);
  if (uri) return uri;
  const assetId = str(ref.asset_id);
  return assetId ? `asset://${assetId}` : "";
};
const sameRef = (ref: unknown, uri: string): boolean =>
  isRec(ref) && (refUri(ref) === uri || (!!str(ref.asset_id) && assetIdOf(uri) === ref.asset_id));
const splitIds = (raw: string): string[] => raw.split(/[,\s]+/).filter(Boolean);
/** Keep the stored order when the set of ids did not change. */
const keepOrder = (ids: string[], stored: unknown): string[] => {
  const before = strList(stored);
  return Array.isArray(stored) && sameSet(before, ids) ? before : ids;
};

/** The last `{#id}` in a text, wherever it is: text typed after it must not detach an object from its id. */
function findAnchor(text: string): { index: number; length: number; id: string; text: string } | null {
  let found: { index: number; length: number; id: string; text: string } | null = null;
  for (const m of text.matchAll(new RegExp(`\\s*\\{#(${ID})\\}`, "g"))) {
    found = { index: m.index, length: m[0].length, id: m[1], text: m[0] };
  }
  return found;
}
const withoutAnchor = (text: string, anchor: { index: number; length: number } | null): string =>
  anchor ? text.slice(0, anchor.index) + text.slice(anchor.index + anchor.length) : text;

/* ── line matching ───────────────────────────────────────────────────── */

interface HeadingMatch {
  mark: string;
  level: number;
  prefix: string;
  body: string;
  bodyStart: number;
  anchor: { id: string; start: number; text: string } | null;
}
export function matchStoryboardHeading(text: string): HeadingMatch | null {
  const m = /^(\s*(#{1,6})\s+)/.exec(text);
  if (!m) return null;
  const rest = text.slice(m[1].length);
  const anchor = findAnchor(rest);
  const body = withoutAnchor(rest, anchor);
  const level = m[2].length;
  // A typed shot number is ignored: numbers are computed.
  const prefix = level >= 3 ? (/^(\d+\s*[.)]\s*)/.exec(body)?.[1] ?? "") : "";
  return {
    mark: m[1],
    level,
    prefix,
    body: body.slice(prefix.length),
    bodyStart: m[1].length + prefix.length,
    anchor: anchor ? { id: anchor.id, start: m[1].length + anchor.index, text: anchor.text } : null
  };
}

interface FieldMatch {
  pre: string;
  label: string;
  post: string;
  gap: string;
  body: string;
  bodyStart: number;
}
export function matchStoryboardField(text: string): FieldMatch | null {
  // Each pattern matches the syntax only; the value is the rest of the line.
  let m = /^(\s*(?:[-*•]\s+)?\*\*)([^*:\n]{1,40}?)(:\*\*|\*\*\s*:)(\s*)/.exec(text);
  if (!m) {
    m = /^(\s*(?:[-*•]\s+)?)([A-Za-z][A-Za-z /]{0,30}?)(:)(\s*)/.exec(text);
    // "Note: …" in prose stays prose unless the label is one the grammar knows.
    if (!m || !KNOWN_LABELS.has(m[2].trim().toLowerCase())) return null;
  }
  return { pre: m[1], label: m[2], post: m[3], gap: m[4], body: text.slice(m[0].length), bodyStart: m[0].length };
}

const matchImage = (text: string): { uri: string; video: boolean } | null => {
  const m = IMAGE.exec(text);
  return m ? { uri: m[2], video: isVideoUri(m[2]) || /^clip\b/i.test(m[1].trim()) } : null;
};

/** Entity mentions in a value, and the value with each mention written as its name. */
export function readEntityMentions(value: string, entities?: StoryboardMarkdownEntities): { text: string; ids: string[] } {
  const ids: string[] = [];
  const text = value.replace(ENTITY_LINK, (_match, label: string | undefined, linked: string | undefined, bare: string | undefined) => {
    const id = linked ?? bare ?? "";
    if (!ids.includes(id)) ids.push(id);
    return label ?? entities?.get(id)?.name ?? `entity://${id}`;
  });
  return { text, ids };
}
const readShotLinks = (value: string): Array<{ id: string; index: number; length: number }> =>
  [...value.matchAll(SHOT_LINK)].map((m) => ({ id: m[2], index: m.index, length: m[0].length }));
const stripShotLinks = (value: string): string => value.replace(SHOT_LINK, "").replace(/\s{2,}/g, " ").trim();

/* ── tokens: how one line is drawn ───────────────────────────────────── */

/**
 * One styled run of a line. `syntax` runs are Markdown punctuation, `label` a
 * field label, `entity` a mention (with the entity kind, or `missing`),
 * `shotref` a shot reference and `id` a `{#id}`. `hidden` runs are the link
 * targets an editor shows only on the active line.
 */
export interface StoryboardMarkdownToken {
  kind: "text" | "syntax" | "hidden" | "label" | "bold" | "italic" | "entity" | "shotref" | "id";
  text: string;
  entityKind?: string;
}

/** Split one line into styled runs. The run texts always add up to the line. */
export function tokenizeStoryboardLine(text: string, entities?: StoryboardMarkdownEntities): StoryboardMarkdownToken[] {
  const out: StoryboardMarkdownToken[] = [];
  const push = (kind: StoryboardMarkdownToken["kind"], s: string, entityKind?: string): void => {
    if (!s) return;
    const last = out[out.length - 1];
    if (last && last.kind === kind && last.entityKind === entityKind && kind !== "entity" && kind !== "shotref") last.text += s;
    else out.push(entityKind ? { kind, text: s, entityKind } : { kind, text: s });
  };
  const inline = (s: string): void => {
    const re = new RegExp(
      `(\\*\\*)(?=\\S)([^*]+?)(\\*\\*)|(\\*)(?=\\S)([^*\\n]+?)(\\*)|\\[([^\\]\\n]+)\\]\\((entity://(${ID}))\\)|(?<![\\w(])(entity://(${ID}))|\\[([^\\]\\n]*)\\]\\((#${ID})\\)`,
      "g"
    );
    let at = 0;
    for (const m of s.matchAll(re)) {
      push("text", s.slice(at, m.index));
      if (m[1]) { push("syntax", m[1]); push("bold", m[2]); push("syntax", m[3]); }
      else if (m[4]) { push("syntax", m[4]); push("italic", m[5]); push("syntax", m[6]); }
      else if (m[7]) { push("hidden", "["); push("entity", m[7], entities?.get(m[9])?.kind ?? "missing"); push("hidden", `](${m[8]})`); }
      else if (m[10]) { push("entity", m[10], entities?.get(m[11])?.kind ?? "missing"); }
      else { push("hidden", "["); push("shotref", m[12]); push("hidden", `](${m[13]})`); }
      at = m.index + m[0].length;
    }
    push("text", s.slice(at));
  };
  /** `s` as inline runs, with the `{#id}` at `index` drawn as its own run. */
  const inlineAround = (s: string, index: number, idText: string): void => {
    inline(s.slice(0, index));
    push("id", idText);
    inline(s.slice(index + idText.length));
  };
  const drawLine = (): void => {
    const heading = matchStoryboardHeading(text);
    if (heading) {
      push("syntax", heading.mark + heading.prefix);
      const rest = text.slice(heading.bodyStart);
      if (heading.anchor) inlineAround(rest, heading.anchor.start - heading.bodyStart, heading.anchor.text);
      else inline(rest);
      return;
    }
    if (matchImage(text)) {
      push("syntax", text);
      return;
    }
    const field = matchStoryboardField(text);
    if (field) {
      push("syntax", field.pre); push("label", field.label); push("syntax", field.post); push("text", field.gap);
      const anchor = findAnchor(field.body);
      if (anchor) inlineAround(field.body, anchor.index, anchor.text);
      else inline(field.body);
      return;
    }
    const bullet = /^\s*[-*•]\s+/.exec(text);
    if (bullet) push("syntax", bullet[0]);
    inline(text.slice(bullet?.[0].length ?? 0));
  };
  drawLine();
  return out.map((t) => t.text).join("") === text ? out : text ? [{ kind: "text", text }] : [];
}

/* ── Markdown → document ─────────────────────────────────────────────── */

interface ParsedAct { id: string; title: string; objective: string[] }
interface ParsedScene { id: string; slugline: string; act: string | null; lighting?: string }
interface ParsedShot {
  id: string;
  slug: string;
  action: string[];
  notes: string[];
  fields: Record<string, string>;
  repeated: Record<string, string[]>;
  keyframe: string | null;
  clip: string | null;
  scene: string | null;
  line: number;
}
type Holder =
  | { type: "board"; name: string }
  | { type: "act"; act: ParsedAct; name: string }
  | { type: "scene"; scene: ParsedScene; name: string }
  | { type: "shot"; shot: ParsedShot; name: string };
type OpenField =
  | { kind: "list"; list: string[] }
  | { kind: "value"; into: Record<string, string>; key: string }
  | { kind: "repeated"; list: string[] }
  | { kind: "scene"; scene: ParsedScene }
  | { kind: "lost" };

/**
 * Read a storyboard document out of its Markdown.
 *
 * Returns the document, what each line became, the warnings, and the headings
 * that need an id written into them. The result validates against
 * `storyboardDocument` for any input text.
 */
export function parseStoryboardMarkdown(markdown: string | readonly string[], options: ParseStoryboardMarkdownOptions = {}): StoryboardMarkdownResult {
  const base = (options.base ?? null) as Rec | null;
  const entities = options.entities;
  const newId = options.generateId ?? defaultId;
  const lines = isString(markdown) ? markdown.replace(/\n$/, "").split("\n") : [...markdown];

  const baseScreenplay = isRec(base?.screenplay) ? base.screenplay : null;
  const baseShotList = recList(base?.shots).length ? recList(base?.shots) : recList(baseScreenplay?.shots);
  const baseShots = new Map(baseShotList.map((s) => [str(s.id) ?? "", s]));
  const baseScenes = new Map(recList(baseScreenplay?.scenes).map((s) => [str(s.id) ?? "", s]));
  const baseActs = new Map(recList(baseScreenplay?.acts).map((a) => [str(a.id) ?? "", a]));
  const baseMotion = isRec(baseScreenplay?.motion_design) ? baseScreenplay.motion_design : null;
  const baseTransitions = recList(baseMotion?.transitions);
  const baseContinuities = new Map(recList(baseMotion?.continuities).map((c) => [str(c.id) ?? "", c]));

  const board = { title: null as string | null, titleId: null as string | null, fields: {} as Record<string, string>, brief: [] as string[] };
  const acts: ParsedAct[] = [];
  const scenes: ParsedScene[] = [];
  const shots: ParsedShot[] = [];
  const info: StoryboardMarkdownLine[] = [];
  const warnings: StoryboardMarkdownWarning[] = [];
  const missingIds: StoryboardMarkdownMissingId[] = [];
  const seen = new Set<string>();
  let holder: Holder = { type: "board", name: "Board" };
  let act: ParsedAct | null = null;
  let scene: ParsedScene | null = null;
  let field: OpenField | null = null;
  let afterBlank = false;
  let fieldsStarted = false;
  let lastField: StoryboardMarkdownLine | null = null;

  const note = (line: number, code: StoryboardMarkdownWarningCode, message: string, params: Record<string, string | number> = {}): StoryboardMarkdownWarning => {
    const warning = { line, code, params, message };
    warnings.push(warning);
    return warning;
  };
  const warn = (m: StoryboardMarkdownLine, code: StoryboardMarkdownWarningCode, message: string, params: Record<string, string | number> = {}): void => {
    m.warning = note(m.line, code, message, params);
  };
  const claimId = (m: StoryboardMarkdownLine, heading: HeadingMatch): string => {
    let id = heading.anchor?.id;
    if (!id || seen.has(id)) {
      id = newId();
      missingIds.push({ line: m.line, id, replace: heading.anchor ? { start: heading.anchor.start, text: heading.anchor.text } : null });
    }
    seen.add(id);
    return id;
  };
  const appendParagraph = (list: string[], text: string): void => {
    if (afterBlank || !list.length) list.push(text);
    else list[list.length - 1] += "\n" + text;
  };

  lines.forEach((text, line) => {
    const m: StoryboardMarkdownLine = { line, role: "text", bodyStart: 0 };
    info.push(m);
    if (!text.trim()) { m.role = "blank"; field = null; afterBlank = true; return; }

    const heading = matchStoryboardHeading(text);
    if (heading) {
      field = null; afterBlank = false; fieldsStarted = false; lastField = null;
      Object.assign(m, { bodyStart: heading.bodyStart, bodyEnd: heading.anchor ? heading.anchor.start : text.length, syntaxWidth: heading.mark.trim().length + heading.prefix.length });
      const body = heading.body.trim();
      if (heading.level === 1 && board.title === null && !acts.length && !scenes.length && !shots.length) {
        board.title = body; board.titleId = claimId(m, heading);
        holder = { type: "board", name: "Board" };
        Object.assign(m, { role: "title", group: "title", scope: "Board · title" });
      } else if (heading.level === 1) {
        act = { id: claimId(m, heading), title: body, objective: [] };
        acts.push(act);
        scene = null;
        holder = { type: "act", act, name: `Act ${acts.length}` };
        Object.assign(m, { role: "act", group: `act:${act.id}:title`, scope: `Act ${acts.length} · title` });
      } else if (heading.level === 2) {
        scene = { id: claimId(m, heading), slugline: body, act: act?.id ?? null };
        scenes.push(scene);
        holder = { type: "scene", scene, name: `Scene ${scenes.length}` };
        Object.assign(m, { role: "scene", group: `scene:${scene.id}:slugline`, scope: `Scene ${scenes.length} · slugline` });
      } else {
        const shot: ParsedShot = { id: claimId(m, heading), slug: body, action: [], notes: [], fields: {}, repeated: {}, keyframe: null, clip: null, scene: scene?.id ?? null, line };
        shots.push(shot);
        holder = { type: "shot", shot, name: `Shot ${shots.length}` };
        Object.assign(m, { role: "shot", group: `shot:${shot.id}:slug`, scope: `Shot ${shots.length} · title`, shotNumber: shots.length, shotId: shot.id });
      }
      return;
    }

    const image = matchImage(text);
    if (image) {
      field = null; afterBlank = false;
      m.bodyStart = text.length; m.media = image.uri;
      if (holder.type !== "shot") { m.role = "stray"; warn(m, "media_outside_shot", "An image belongs to a shot: put it under a ### shot heading."); return; }
      const slot = image.video ? "clip" : "keyframe";
      if (holder.shot[slot]) warn(m, "second_media", `A shot has one selected ${image.video ? "clip" : "still"}. This one is not used.`, { media: image.video ? "clip" : "still" });
      else holder.shot[slot] = image.uri;
      Object.assign(m, { role: image.video ? "clip" : "still", scope: `${holder.name} · ${image.video ? "clip" : "still"}` });
      return;
    }

    const f = matchStoryboardField(text);
    if (f) {
      const label = f.label.trim();
      const key = FIELDS[holder.type].get(label.toLowerCase());
      afterBlank = false; fieldsStarted = true;
      Object.assign(m, { role: "field", bodyStart: f.bodyStart, scope: `${holder.name} · ${label}` });
      lastField = m;
      const body = f.body.trim();
      if (!key) {
        m.key = "unknown";
        if (holder.type === "shot") {
          holder.shot.notes.push(`${label}: ${body}`);
          field = { kind: "list", list: holder.shot.notes };
          warn(m, "unknown_shot_field", `"${label}" is not a storyboard field. It is saved in the shot's notes.`, { label });
        } else {
          field = { kind: "lost" };
          warn(m, "unknown_field", `"${label}" is not a field of ${holder.type === "board" ? "the board" : `a ${holder.type}`}. It is not saved.`, { label, holder: holder.type });
        }
        return;
      }
      m.key = key;
      const owner = holder.type === "board" ? "board" : holder.type === "act" ? `act:${holder.act.id}` : holder.type === "scene" ? `scene:${holder.scene.id}` : `shot:${holder.shot.id}`;
      m.group = `${owner}:${key}`;
      if (holder.type === "shot" && (key === "action" || key === "notes")) {
        const list = key === "action" ? holder.shot.action : holder.shot.notes;
        list.push(body); field = { kind: "list", list }; return;
      }
      if (holder.type === "board" && key === "brief") { board.brief.push(body); field = { kind: "list", list: board.brief }; return; }
      if (holder.type === "act") { holder.act.objective.push(body); field = { kind: "list", list: holder.act.objective }; return; }
      if (holder.type === "scene") { holder.scene.lighting = (holder.scene.lighting ? holder.scene.lighting + "\n" : "") + body; field = { kind: "scene", scene: holder.scene }; return; }
      const into = holder.type === "board" ? board.fields : holder.shot.fields;
      if (holder.type === "shot" && REPEATED.has(key)) {
        const list = (holder.shot.repeated[key] ??= []);
        list.push(body); field = { kind: "repeated", list }; return;
      }
      into[key] = (into[key] ? into[key] + "\n" : "") + body;
      field = { kind: "value", into, key };
      return;
    }

    // Plain text continues the field above it, or is the main text of its object.
    const open = field as OpenField | null;
    if (open && !afterBlank) {
      const t = text.trim();
      if (open.kind === "list" || open.kind === "repeated") open.list[open.list.length - 1] += "\n" + t;
      else if (open.kind === "value") open.into[open.key] += "\n" + t;
      else if (open.kind === "scene") open.scene.lighting += "\n" + t;
      const above = lastField as StoryboardMarkdownLine | null;
      Object.assign(m, { role: "cont", scope: above?.scope, key: above?.key, group: above?.group });
      return;
    }
    field = null;
    const t = text.trim();
    if (holder.type === "shot") {
      if (!fieldsStarted) {
        appendParagraph(holder.shot.action, t);
        Object.assign(m, { key: "action", scope: `${holder.name} · action`, group: `shot:${holder.shot.id}:action` });
      } else {
        appendParagraph(holder.shot.notes, t);
        Object.assign(m, { key: "notes", scope: `${holder.name} · notes`, group: `shot:${holder.shot.id}:notes` });
      }
    } else if (holder.type === "board") {
      appendParagraph(board.brief, t);
      Object.assign(m, { key: "brief", scope: "Board · brief", group: "board:brief" });
    } else if (holder.type === "act") {
      appendParagraph(holder.act.objective, t);
      Object.assign(m, { key: "objective", scope: `${holder.name} · objective`, group: `act:${holder.act.id}:objective` });
    } else {
      m.role = "stray";
      warn(m, "text_in_scene", "A scene has a slugline and lighting only. Put this text under a shot, or label it \"Lighting:\".");
    }
    afterBlank = false;
  });

  /* — shots — */
  const order = new Map(shots.map((s, i) => [s.id, i]));
  const outShots: Rec[] = shots.map((p, index) => {
    const stored = baseShots.get(p.id);
    const shot: Rec = {};
    if (stored) for (const [k, v] of Object.entries(stored)) if (!SHOT_TEXT_KEYS.has(k)) shot[k] = clone(v);
    shot.type = "shot"; shot.id = p.id; shot.index = index;
    // "" and [] round-trip through an absent line.
    const keep = (key: string, value: unknown): void => {
      if (value !== undefined && value !== "") shot[key] = value;
      else if (stored && key in stored && isEmptyValue(stored[key])) shot[key] = clone(stored[key]);
    };
    const mentions: string[] = [];
    const prose = (raw: string | undefined): string | undefined => {
      if (raw === undefined) return undefined;
      const read = readEntityMentions(raw, entities);
      for (const id of read.ids) if (!mentions.includes(id)) mentions.push(id);
      return read.text;
    };
    keep("slug", prose(p.slug) || undefined);
    shot.action = prose(p.action.join("\n\n")) ?? "";
    for (const key of ["motion", "end_state", "sound", "dialogue", "narration"]) keep(key, prose(p.fields[key]));
    keep("notes", prose(p.notes.length ? p.notes.join("\n\n") : undefined));

    const storedCamera = isRec(stored?.camera) ? stored.camera : null;
    const camera: Rec = storedCamera ? Object.fromEntries(Object.entries(storedCamera).filter(([k]) => !(CAMERA_TEXT_KEYS as readonly string[]).includes(k))) : {};
    for (const k of CAMERA_TEXT_KEYS) {
      const raw = p.fields[`camera.${k}`];
      if (raw !== undefined && raw.trim()) camera[k] = k === "preset_ids" ? splitIds(raw) : raw;
      else if (storedCamera && k in storedCamera && isEmptyValue(storedCamera[k])) camera[k] = clone(storedCamera[k]);
    }
    if (Object.keys(camera).length || (stored && "camera" in stored)) shot.camera = camera;

    const duration = p.fields.duration_seconds;
    if (duration !== undefined) {
      const seconds = parseFloat(duration.replace(",", "."));
      if (Number.isFinite(seconds)) {
        shot.duration_seconds = seconds;
        if (stored?.duration_seconds !== seconds) shot.duration_source = "manual";
      } else note(p.line, "bad_duration", `Shot ${index + 1}: the duration "${duration}" is not a number of seconds.`, { shot: index + 1, value: duration });
    }
    const render = p.fields.render_mode?.trim().toLowerCase();
    if (render !== undefined) {
      if (RENDER_MODES.has(render)) shot.render_mode = render;
      else note(p.line, "bad_render", `Shot ${index + 1}: render is keyframe, direct or reference.`, { shot: index + 1 });
    }
    const look = p.fields.look_preset_ids;
    keep("look_preset_ids", look !== undefined && look.trim() ? splitIds(look) : undefined);

    const location = p.fields.location_id;
    if (location !== undefined) {
      const id = readEntityMentions(location, entities).ids[0];
      if (id) shot.location_id = id;
      else if (/^none$/i.test(location.trim())) shot.location_id = null;
    } else if (stored && "location_id" in stored && (stored.location_id === null || stored.location_id === "")) shot.location_id = stored.location_id;

    const castField = p.fields.entity_ids;
    const cast = castField === undefined ? null : /^none$/i.test(castField.trim()) ? [] : readEntityMentions(castField, entities).ids;
    if (mentions.length || cast) {
      const ids = [...(cast ?? [])];
      for (const id of mentions) if (!ids.includes(id)) ids.push(id);
      shot.entity_ids = keepOrder(ids, stored?.entity_ids);
    } else if (stored && Array.isArray(stored.entity_ids) && stored.entity_ids.length === 0) shot.entity_ids = [];

    // The selected still and clip. A file not among the takes becomes a take as well.
    for (const [slot, versions, type] of [["keyframe", "keyframe_versions", "image"], ["clip", "clip_versions", "video"]] as const) {
      const uri = p[slot];
      if (uri) {
        const found = sameRef(stored?.[slot], uri) ? stored?.[slot] : recList(stored?.[versions]).find((v) => sameRef(v, uri));
        const ref = found ? clone(found) : { type, uri, asset_id: assetIdOf(uri) };
        shot[slot] = ref;
        if (!found) shot[versions] = [...recList(shot[versions]), clone(ref)];
      } else if (stored && slot in stored) shot[slot] = null;
    }
    if (p.scene) shot.scene_id = p.scene;
    // What normalizeStoryboardShot gives a new shot.
    if (!isString(shot.status)) shot.status = "planned";
    return shot;
  });

  /* — transitions and continuities, written on the shot they start from — */
  const transitions: Rec[] = [];
  const continuities: Rec[] = [];
  shots.forEach((p, i) => {
    for (const raw of p.repeated.transition ?? []) {
      const links = readShotLinks(raw);
      const to = links[0] && order.has(links[0].id) ? links[0].id : shots[i + 1]?.id;
      if (!to) { note(p.line, "no_next_shot", `Shot ${i + 1}: a transition leads to the next shot, and there is none.`, { shot: i + 1 }); continue; }
      const direction = stripShotLinks(raw);
      const stored = baseTransitions.find((t) => t.from_shot_id === p.id && t.to_shot_id === to);
      const transition: Rec = stored ? clone(stored) : {};
      transition.from_shot_id = p.id; transition.to_shot_id = to;
      if (direction) transition.direction = direction;
      else if (!(stored && isEmptyValue(stored.direction))) delete transition.direction;
      transitions.push(transition);
    }
    for (const raw of p.repeated.continuity ?? []) {
      const anchor = findAnchor(raw);
      const body = withoutAnchor(raw, anchor);
      const links = readShotLinks(body);
      let ids = [p.id];
      const until = links[0] && /^\s*until\s*\[/i.test(body) ? order.get(links[0].id) : undefined;
      if (until !== undefined) ids = shots.slice(i, until + 1).map((s) => s.id);
      else for (const l of links) if (order.has(l.id) && !ids.includes(l.id)) ids.push(l.id);
      const direction = stripShotLinks(body.replace(/^\s*(until|with)\s+/i, "")).replace(/^[—–:-]\s*/, "");
      const id = anchor?.id ?? `${p.id}-continuity-${continuities.length + 1}`;
      const stored = baseContinuities.get(id);
      const continuity: Rec = stored ? clone(stored) : {};
      Object.assign(continuity, { id, shot_ids: keepOrder(ids, stored?.shot_ids), direction });
      continuities.push(continuity);
    }
  });

  /* — the document — */
  const F = board.fields;
  const read = (key: string): string | undefined => (F[key] !== undefined ? readEntityMentions(F[key], entities).text : undefined);
  const doc: Rec = base ? clone(base) : { setupStage: "done", directorModel: null, imageModel: null, videoModel: null };
  doc.brief = board.brief.join("\n\n");
  doc.style = read("style") ?? "";
  doc.aspectRatio = read("aspectRatio")?.trim() || str(base?.aspectRatio) || "16:9";
  // Keys the schema defaults are left out when the stored board left them out.
  const genre = read("genre")?.trim();
  if (genre || !base || "genre" in base) doc.genre = genre ?? "";
  if (F.entityIds !== undefined) doc.entityIds = keepOrder(readEntityMentions(F.entityIds, entities).ids, base?.entityIds);
  else if (!base || "entityIds" in base) doc.entityIds = [];
  const look = F.look_preset_ids !== undefined ? splitIds(F.look_preset_ids) : [];
  if (look.length) doc.look_preset_ids = look;
  else if (base && "look_preset_ids" in base && isEmptyValue(base.look_preset_ids)) doc.look_preset_ids = clone(base.look_preset_ids);
  else delete doc.look_preset_ids;
  doc.shots = outShots;

  const wantsScreenplay = baseScreenplay || board.title !== null || acts.length || scenes.length || F.logline || F.music_prompt || F.narration || F.motion_direction;
  if (!wantsScreenplay) doc.screenplay = null;
  else {
    const sp: Rec = baseScreenplay ? clone(baseScreenplay) : {};
    sp.type = "screenplay";
    sp.id = board.titleId ?? str(baseScreenplay?.id) ?? newId();
    sp.title = board.title ?? "";
    const optional = (key: string, value: string | undefined): void => {
      if (value) sp[key] = value;
      else if (baseScreenplay && key in baseScreenplay && isEmptyValue(baseScreenplay[key])) sp[key] = clone(baseScreenplay[key]);
      else delete sp[key];
    };
    optional("logline", read("logline"));
    optional("music_prompt", read("music_prompt"));
    optional("narration", read("narration"));
    // The screenplay keeps copies of board values. A copy that matched the board keeps matching it.
    for (const [spKey, docKey] of [["brief", "brief"], ["style_bible", "style"], ["aspect_ratio", "aspectRatio"], ["genre", "genre"], ["entity_ids", "entityIds"]] as const) {
      if (base && baseScreenplay && spKey in baseScreenplay && JSON.stringify(baseScreenplay[spKey]) === JSON.stringify(base[docKey])) sp[spKey] = clone(doc[docKey]);
    }
    const ordered = <T extends { id: string }>(list: T[], stored: Map<string, Rec>): T[] => {
      const storedOrder = [...stored.keys()];
      return sameSet(storedOrder, list.map((x) => x.id)) ? storedOrder.map((id) => list.find((x) => x.id === id) as T) : list;
    };
    if (acts.length || (baseScreenplay && "acts" in baseScreenplay)) {
      sp.acts = ordered(acts, baseActs).map((a) => {
        const stored = baseActs.get(a.id);
        const out: Rec = stored ? clone(stored) : {};
        Object.assign(out, { type: "act", id: a.id, title: a.title });
        const objective = readEntityMentions(a.objective.join("\n\n"), entities).text;
        if (objective) out.objective = objective;
        else if (!(stored && isEmptyValue(stored.objective))) delete out.objective;
        return out;
      });
    }
    if (scenes.length || (baseScreenplay && "scenes" in baseScreenplay)) {
      sp.scenes = ordered(scenes, baseScenes).map((s) => {
        const stored = baseScenes.get(s.id);
        const out: Rec = stored ? clone(stored) : {};
        Object.assign(out, { type: "scene", id: s.id, slugline: s.slugline });
        const lighting = s.lighting !== undefined ? readEntityMentions(s.lighting, entities).text : undefined;
        if (lighting) out.lighting = lighting;
        else if (!(stored && isEmptyValue(stored.lighting))) delete out.lighting;
        if (s.act) out.act_id = s.act; else delete out.act_id;
        return out;
      });
    }
    const motion: Rec = baseMotion ? clone(baseMotion) : {};
    const direction = read("motion_direction");
    if (direction) motion.direction = direction;
    else if (!(baseMotion && isEmptyValue(baseMotion.direction))) delete motion.direction;
    if (transitions.length || (baseMotion && "transitions" in baseMotion)) motion.transitions = transitions; else delete motion.transitions;
    if (continuities.length || (baseMotion && "continuities" in baseMotion)) motion.continuities = continuities; else delete motion.continuities;
    if (Object.keys(motion).length || (baseScreenplay && "motion_design" in baseScreenplay)) sp.motion_design = motion; else delete sp.motion_design;
    sp.shots = outShots;
    doc.screenplay = sp;
  }

  for (const m of info) {
    if (m.role !== "shot" || m.shotNumber === undefined) continue;
    const shot = outShots[m.shotNumber - 1];
    m.status = str(shot.status);
    if (!str(shot.action)?.trim()) warn(m, "missing_action", `Shot ${m.shotNumber} has no action yet. Write the visual to render under its heading.`, { shot: m.shotNumber });
  }
  // SAFETY: built key by key from the schema's own keys, starting from the
  // stored document; the round-trip and schema tests pin the shape.
  return { document: doc as unknown as StoryboardDocumentSchema, lines: info, warnings, missingIds, shotOrder: shots.map((s) => s.id) };
}

/* ── document → Markdown ─────────────────────────────────────────────── */

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Write the first mention of each entity in a value as a link. */
function linkNames(value: string, ids: readonly string[], entities: StoryboardMarkdownEntities | undefined, linked: Set<string>): string {
  let out = value;
  for (const id of ids) {
    const name = entities?.get(id)?.name.trim();
    if (linked.has(id) || !name) continue;
    const at = out.toLowerCase().search(new RegExp(`(?<![\\w\\[])${escapeRe(name.toLowerCase())}(?![\\w\\]])`));
    if (at < 0) continue;
    const before = out.slice(0, at);
    // Never inside an existing link.
    if ((before.match(/\[/g) ?? []).length > (before.match(/\]/g) ?? []).length) continue;
    out = `${before}[${out.slice(at, at + name.length)}](entity://${id})${out.slice(at + name.length)}`;
    linked.add(id);
  }
  return out;
}

/** Write a storyboard document as Markdown. */
export function storyboardToMarkdown(document: StoryboardDocumentSchema, options: { entities?: StoryboardMarkdownEntities } = {}): string {
  const doc = document as unknown as Rec;
  const entities = options.entities;
  const sp = isRec(doc.screenplay) ? doc.screenplay : null;
  const shots = recList(doc.shots).length ? recList(doc.shots) : recList(sp?.shots);
  const L: string[] = [];
  const paragraphs = (value: string): string[] => value.trim().split(/\n\n+/).flatMap((p, i) => (i ? ["", ...p.split("\n")] : p.split("\n")));
  const writeField = (label: string, value: unknown): void => {
    const text = isString(value) ? value.trim() : "";
    if (text) text.split("\n").forEach((line, i) => L.push(i ? line : `- **${label}:** ${line}`));
  };
  const mention = (id: string): string => `[${entities?.get(id)?.name || id}](entity://${id})`;

  if (sp) L.push(`# ${str(sp.title) ? `${str(sp.title)} ` : ""}{#${str(sp.id) ?? ""}}`);
  const brief = str(doc.brief)?.trim();
  if (brief) L.push(...(L.length ? [""] : []), ...paragraphs(brief));
  const meta: Array<[string, string]> = [];
  const metaLine = (label: string, value: unknown): void => { const v = isString(value) ? value.trim() : ""; if (v) meta.push([label, v]); };
  metaLine("Logline", sp?.logline);
  metaLine("Style", doc.style);
  metaLine("Aspect ratio", doc.aspectRatio);
  metaLine("Genre", doc.genre);
  metaLine("Cast", strList(doc.entityIds).map(mention).join(", "));
  metaLine("Look", strList(doc.look_preset_ids).join(", "));
  metaLine("Music", sp?.music_prompt);
  metaLine("Narration", sp?.narration);
  metaLine("Motion design", isRec(sp?.motion_design) ? sp.motion_design.direction : undefined);
  if (meta.length) { if (L.length) L.push(""); for (const [label, value] of meta) writeField(label, value); }

  const acts = new Map(recList(sp?.acts).map((a) => [str(a.id) ?? "", a]));
  const scenes = new Map(recList(sp?.scenes).map((s) => [str(s.id) ?? "", s]));
  const number = new Map(shots.map((s, i) => [str(s.id) ?? "", i + 1]));
  const link = (id: string): string => `[Shot ${number.get(id)}](#${id})`;
  const motion = isRec(sp?.motion_design) ? sp.motion_design : null;
  const transitions = recList(motion?.transitions);
  const continuities = recList(motion?.continuities);
  const firstShotOf = (c: Rec): string | undefined => strList(c.shot_ids).slice().sort((a, b) => (number.get(a) ?? 1e9) - (number.get(b) ?? 1e9))[0];
  const writtenActs = new Set<string>();
  const writtenScenes = new Set<string>();
  const writeAct = (a: Rec): void => {
    L.push("", `# ${str(a.title) ? `${str(a.title)} ` : ""}{#${str(a.id)}}`);
    const objective = str(a.objective)?.trim();
    if (objective) L.push(...paragraphs(objective));
    writtenActs.add(str(a.id) ?? "");
  };
  const writeScene = (s: Rec): void => {
    L.push("", `## ${str(s.slugline) ? `${str(s.slugline)} ` : ""}{#${str(s.id)}}`);
    writeField("Lighting", s.lighting);
    writtenScenes.add(str(s.id) ?? "");
  };

  let previousScene: string | undefined;
  let previousAct: string | undefined;
  shots.forEach((s, i) => {
    const id = str(s.id) ?? "";
    const sceneId = str(s.scene_id);
    const sc = sceneId ? scenes.get(sceneId) : undefined;
    if (sc && sceneId !== previousScene) {
      const actId = str(sc.act_id);
      const a = actId ? acts.get(actId) : undefined;
      if (a && actId !== previousAct && !writtenActs.has(actId ?? "")) writeAct(a);
      if (a) previousAct = actId;
      writeScene(sc);
      previousScene = sceneId;
    }
    L.push("", `### ${str(s.slug) ? `${str(s.slug)} ` : ""}{#${id}}`);
    const still = refUri(s.keyframe), clip = refUri(s.clip);
    if (still) L.push(`![Still](${still})`);
    if (clip) L.push(`![Clip](${clip})`);
    const ids = strList(s.entity_ids);
    const linked = new Set<string>();
    const prose = (v: unknown): string | undefined => (isString(v) && v ? linkNames(v, ids, entities, linked) : undefined);
    const action = prose(str(s.action)?.trim());
    if (still || clip) L.push("");
    if (action) L.push(...paragraphs(action));
    const fields: Array<[string, string]> = [];
    const add = (label: string, value: unknown): void => { if (isString(value) && value.trim() !== "") fields.push([label, value]); };
    const camera = isRec(s.camera) ? s.camera : {};
    add("Framing", camera.framing); add("Lens", camera.lens); add("Angle", camera.angle); add("Camera movement", camera.movement); add("Rig", camera.equipment);
    add("Camera presets", strList(camera.preset_ids).join(", "));
    add("Motion", prose(s.motion)); add("End", prose(s.end_state)); add("Sound", prose(s.sound));
    add("Dialogue", prose(s.dialogue)); add("Narration", prose(s.narration));
    if (isNumber(s.duration_seconds)) add("Duration", `${s.duration_seconds}s`);
    add("Render", s.render_mode);
    if (str(s.location_id)) add("Location", mention(str(s.location_id) ?? ""));
    add("Cast", ids.filter((e) => !linked.has(e)).map(mention).join(", "));
    add("Look", strList(s.look_preset_ids).join(", "));
    for (const t of transitions.filter((t) => t.from_shot_id === id && number.has(str(t.to_shot_id) ?? ""))) {
      const to = str(t.to_shot_id) ?? "";
      const value = `${str(shots[i + 1]?.id) === to ? "" : `${link(to)} `}${str(t.direction) ?? ""}`.trim();
      fields.push(["Transition", value]);
    }
    for (const c of continuities.filter((c) => firstShotOf(c) === id)) {
      const rest = strList(c.shot_ids).filter((x) => x !== id && number.has(x)).sort((a, b) => (number.get(a) ?? 0) - (number.get(b) ?? 0));
      const contiguous = rest.length > 0 && rest.every((x, j) => number.get(x) === i + 2 + j);
      const span = !rest.length ? "" : contiguous ? `until ${link(rest[rest.length - 1])} — ` : `with ${rest.map(link).join(" ")} — `;
      fields.push(["Continuity", `${span}${str(c.direction) ?? ""} {#${str(c.id)}}`]);
    }
    add("Notes", prose(s.notes));
    if (fields.length) {
      L.push("");
      for (const [label, value] of fields) {
        if (!value.trim()) L.push(`- **${label}:**`);
        else writeField(label, value);
      }
    }
  });
  // Acts and scenes no shot is in yet are kept at the end, so they survive a round trip.
  for (const sc of scenes.values()) {
    if (writtenScenes.has(str(sc.id) ?? "")) continue;
    const a = str(sc.act_id) ? acts.get(str(sc.act_id) ?? "") : undefined;
    if (a && !writtenActs.has(str(a.id) ?? "")) writeAct(a);
    writeScene(sc);
  }
  for (const a of acts.values()) if (!writtenActs.has(str(a.id) ?? "")) writeAct(a);
  return L.join("\n") + "\n";
}
