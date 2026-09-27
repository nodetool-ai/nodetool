/** Removed workflows must report the gameplay work that art import cannot perform. */
export const LEGACY_GAME_EXPORT_DIAGNOSTIC = "ExportGodotProject was removed. Create a native game, reconnect surviving asset checkers to StageGameAssets, then install selected bindings into a game revision. GDScript and Godot scenes require manual reconstruction.";

export function legacyGameNodeDiagnostic(type: string): string | null {
  return type === "nodetool.game.ExportGodotProject" ? LEGACY_GAME_EXPORT_DIAGNOSTIC : null;
}
