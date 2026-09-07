/**
 * `@nodetool-ai/game-nodes` — the template end of the Godot pipeline.
 *
 * `LoadGameTemplate`, `SlotPrompt` and `ExportGodotProject`, plus the project
 * layout, export join and fill-resolution helpers under them. The join is the
 * node's and the `export_godot_project` capability's shared code, so a project
 * a graph exported and one an agent exported are written the same way. The
 * per-slot checkers live with the bytes they measure (image-nodes, audio-nodes);
 * `GAME_TEMPLATE_NODES` is registered in `@nodetool-ai/base-nodes` beside them.
 */

export {
  LoadGameTemplateNode,
  SlotPromptNode,
  ExportGodotProjectNode,
  GAME_TEMPLATE_NODES
} from "./nodes/game.js";
export { resolveFills, type ResolvedFills } from "./fills.js";
export {
  copyAssets,
  danglingReferences,
  extensionOf,
  isJoinError,
  joinGodotProject,
  layOutProject,
  REFERENCING_EXTENSIONS,
  under,
  verifyWithGodot,
  walkTemplate,
  type GodotVerification,
  type JoinError,
  type JoinInput,
  type JoinOutcome,
  type LayoutMode,
  type LayoutResult
} from "./project.js";
