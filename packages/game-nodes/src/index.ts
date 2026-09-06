/**
 * `@nodetool-ai/game-nodes` — the game nodes whose work is a whole project
 * rather than one asset.
 *
 * The per-slot checkers live with the media they measure (`image-nodes` and
 * `audio-nodes`); this package holds `nodetool.game.ExportGodotProject` and the
 * export join it shares with the `export_godot_project` capability.
 */
export {
  ExportGodotProjectNode,
  GAME_EXPORT_NODES
} from "./nodes/export.js";
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
  type LayoutMode
} from "./export-join.js";
