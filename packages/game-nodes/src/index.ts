/**
 * `@nodetool-ai/game-nodes` — the template end of the Godot pipeline.
 *
 * `LoadGameTemplate`, `SlotPrompt` and `ExportGodotProject`, plus the project
 * layout and fill-resolution helpers under them. The per-slot checkers live
 * with the bytes they measure (image-nodes, audio-nodes);
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
  danglingReferences,
  layOutProject,
  verifyWithGodot,
  walkTemplate,
  type GodotVerification,
  type LayoutMode,
  type LayoutResult
} from "./project.js";
