/**
 * Document demo "cast" format — a self-contained, backend-free capture of one
 * *assistant-driven* editing session on a document surface (sketch, script,
 * storyboard, JS script, mini app).
 *
 * Third sibling of the two existing cast formats:
 *   - `../castTypes.ts`          — the graph editor, replaying protocol messages
 *   - `../timeline/timelineCastTypes.ts` — the timeline, replaying clip edits
 *
 * Where those two invent an op language per surface, this one does not: an
 * event is a **shallow patch of the document root**, and the fold is "apply
 * every patch with `t <= timeMs`, in order". Five surfaces share one replay
 * that way, and a cast stays plain data — diffable, seekable, and exact.
 *
 * Every cast also carries an `assistant` track: the conversation that produced
 * those edits, in the same event shape the chat cast uses, so the player can
 * render the real assistant dock beside the document. The two tracks are
 * authored against one clock — the assistant announces an edit, the patch that
 * follows is what the edit did.
 */
import type { ApplicationDocument } from "@nodetool-ai/app-runtime";

import type { CastAsset } from "../castTypes";

import type { LanguageModel, Workflow } from "../../stores/ApiTypes";
import type {
  SketchDocument,
  SketchTool
} from "../../components/sketch/types";
import type { JsScriptDocument } from "../../stores/jsScript/JsScriptStore";
import type { ScriptDraft } from "../../stores/script/ScriptStore";
import type { StoryboardBoard } from "../../stores/storyboard/StoryboardStore";
import type { ChatCastEvent } from "../chat/chatCastTypes";

/** Schema version. Bump on breaking changes to the cast shape. */
export const DOC_CAST_VERSION = 1 as const;

/** The document surfaces this format covers. */
export type DocSurface =
  | "sketch"
  | "script"
  | "storyboard"
  | "jsscript"
  | "app";

/** One timed shallow patch of the document root. */
export interface DocCastEvent<Doc> {
  /** Milliseconds from the start of the cast. */
  t: number;
  patch: Partial<Doc>;
}

interface DocDemoCastBase<Surface extends DocSurface, Doc> {
  version: typeof DOC_CAST_VERSION;
  kind: "doc";
  surface: Surface;
  /** Unique id for the cast. */
  id: string;
  /** Human title shown in the demo gallery. */
  name: string;
  description?: string;
  createdAt: string;
  /** Total wall-clock length of the recording in ms. */
  durationMs: number;
  /** Suggested frame rate. Defaults to 30. */
  fps?: number;
  /** Row id the surface's store keys this document by. */
  docId: string;
  /** The document at `t = 0`. */
  doc: Doc;
  /** Patches, sorted ascending by `t`. */
  events: DocCastEvent<Doc>[];
  /**
   * Media too large to inline, pinned next to the cast and addressed from the
   * document as `cast-asset://<key>` — the same scheme the graph and timeline
   * casts use. The player rewrites those refs through its `resolveAssetUrl`.
   * Casts whose media fits in a `data:` URI omit this.
   */
  assets?: CastAsset[];
  /** The assistant turn(s) that drove the edits, shown in the side dock. */
  assistant: ChatCastEvent[];
  /** Model badge the assistant dock's composer shows. */
  assistantModel: LanguageModel;
  /** Heading above the assistant dock, e.g. "Sketch Assistant". */
  assistantTitle: string;
}

/**
 * The sketch-editor chrome around the canvas: the toolbar's active tool and
 * colors, the layers panel's multi-selection, the status bar's zoom and cursor
 * readout. None of it lives in the document, so a cast that wants the tutorial
 * to show a tool being picked carries it here.
 */
export interface SketchEditorCast {
  activeTool?: SketchTool;
  zoom?: number;
  foregroundColor?: string;
  backgroundColor?: string;
  /** Layers highlighted in the panel beyond the document's `activeLayerId`. */
  selectedLayerIds?: string[];
  /** Cursor readout in document pixels, or null for "pointer is off-canvas". */
  cursorDocPos?: { x: number; y: number } | null;
}

/**
 * A sketch surface renders the document *and* the editor state around it, so
 * the cast wraps both — a patch sets either half, the way the JS-script and
 * app casts patch their own two-part documents.
 */
export interface SketchCastDoc {
  document: SketchDocument;
  editor?: SketchEditorCast;
}

/** The script store keys `id`/`updatedAt` itself, so a cast never sets them. */
export type ScriptCastDoc = Omit<ScriptDraft, "id" | "updatedAt">;
/** Same for the storyboard store. */
export type StoryboardCastDoc = Omit<StoryboardBoard, "id" | "updatedAt">;
/** A JS script row: the name the sidebar shows plus the document itself. */
export interface JsScriptCastDoc {
  name: string;
  document: JsScriptDocument;
}
/** A mini app renders from its document plus the workflow its operations bind. */
export interface AppCastDoc {
  document: ApplicationDocument;
  workflow: Workflow;
}

export type SketchDocCast = DocDemoCastBase<"sketch", SketchCastDoc>;
export type ScriptDocCast = DocDemoCastBase<"script", ScriptCastDoc>;
export type StoryboardDocCast = DocDemoCastBase<"storyboard", StoryboardCastDoc>;
export type JsScriptDocCast = DocDemoCastBase<"jsscript", JsScriptCastDoc>;
export type AppDocCast = DocDemoCastBase<"app", AppCastDoc>;

/** A complete, replayable document-editor demo recording. */
export type DocDemoCast =
  | SketchDocCast
  | ScriptDocCast
  | StoryboardDocCast
  | JsScriptDocCast
  | AppDocCast;

const SURFACES = new Set<string>([
  "sketch",
  "script",
  "storyboard",
  "jsscript",
  "app"
]);

/** Narrow runtime guard — enough to fail fast on a malformed cast. */
export function isDocDemoCast(value: unknown): value is DocDemoCast {
  if (typeof value !== "object" || value === null) return false;
  const c = value as Record<string, unknown>;
  return (
    c.version === DOC_CAST_VERSION &&
    c.kind === "doc" &&
    typeof c.surface === "string" &&
    SURFACES.has(c.surface) &&
    typeof c.id === "string" &&
    typeof c.docId === "string" &&
    typeof c.doc === "object" &&
    c.doc !== null &&
    Array.isArray(c.events) &&
    Array.isArray(c.assistant)
  );
}
