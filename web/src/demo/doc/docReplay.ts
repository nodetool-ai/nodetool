/**
 * Pure replay for a {@link DocDemoCast}: fold the patches with `t <= timeMs`
 * onto the base document, then push the result into whichever store the
 * surface reads from.
 *
 * Recomputed from scratch on every seek rather than incrementally — document
 * casts are short (tens of patches over small documents), so the pure fold is
 * worth more than the seek perf a stateful engine would buy. Same tradeoff
 * `../timeline/timelineReplay.ts` makes.
 *
 * Two of the five surfaces (sketch, app) render straight from props and have
 * no store to seed; {@link seedDocState} is a no-op for them and the player
 * passes the folded document down instead.
 */
import { useJsScriptStore } from "../../stores/jsScript/JsScriptStore";
import { useScriptStore } from "../../stores/script/ScriptStore";
import { useStoryboardStore } from "../../stores/storyboard/StoryboardStore";
import type {
  DocCastEvent,
  DocDemoCast,
  JsScriptCastDoc,
  ScriptCastDoc,
  StoryboardCastDoc
} from "./docCastTypes";

/** The document a cast shows at `timeMs`: base + every patch up to it. */
export function foldDocAt<Doc extends object>(
  base: Doc,
  events: DocCastEvent<Doc>[],
  timeMs: number
): Doc {
  let doc = clone(base);
  for (const event of events) {
    if (event.t > timeMs) break;
    doc = { ...doc, ...clone(event.patch) };
  }
  return doc;
}

/** Same fold, typed against a whole cast so callers keep the surface's shape. */
export function docStateAt<Cast extends DocDemoCast>(
  cast: Cast,
  timeMs: number
): Cast["doc"] {
  return foldDocAt(cast.doc as object, cast.events as DocCastEvent<object>[], timeMs) as Cast["doc"];
}

/**
 * Mirror the folded document into the singleton store its surface reads. Same
 * "seed the shared store" pattern as `seedCastMetadata` (graph) and
 * `seedTimelineCastAssets` (timeline).
 */
export function seedDocState(cast: DocDemoCast, doc: DocDemoCast["doc"]): void {
  switch (cast.surface) {
    case "script":
      useScriptStore.getState().loadScript(cast.docId, doc as ScriptCastDoc);
      break;
    case "storyboard":
      useStoryboardStore
        .getState()
        .loadBoard(cast.docId, doc as StoryboardCastDoc);
      break;
    case "jsscript":
      useJsScriptStore
        .getState()
        .loadScript(cast.docId, doc as JsScriptCastDoc);
      break;
    case "sketch":
    case "app":
      // Prop-driven surfaces: the player hands the document straight to the
      // component, so there is no store row to write.
      break;
  }
}

/** Drop the row {@link seedDocState} wrote. Call when unmounting the player. */
export function disposeDocState(cast: DocDemoCast): void {
  switch (cast.surface) {
    case "script":
      useScriptStore.getState().removeScript(cast.docId);
      break;
    case "storyboard":
      useStoryboardStore.getState().removeBoard(cast.docId);
      break;
    case "jsscript":
      useJsScriptStore.getState().removeScript(cast.docId);
      break;
    case "sketch":
    case "app":
      break;
  }
}

/** Structured deep clone; falls back to JSON where `structuredClone` is absent. */
function clone<T>(value: T): T {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}
