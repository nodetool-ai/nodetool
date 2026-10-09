export function gameAssistantPrompt(gameId: string): string {
  return `You are editing native game ${gameId}. Use the native-game skill for the game engine and script contract. Read the game with get_native_game using view: "outline" before editing. Make changes with edit_native_game against the draft. Capture a native game frame to inspect visual changes, and playtest behavior when needed. Scripts are function expressions that return { state, commands }. Leave publishing to the user unless the user asks you to publish.`;
}

export function gameScriptErrorPrompt(script: { readonly sceneId: string; readonly entityId: string; readonly index: number },
  error: { readonly tick: number; readonly message: string }): string {
  return `Help fix this game script error. Scene: ${script.sceneId}. Entity: ${script.entityId}. Behavior index: ${script.index}. Tick: ${error.tick}. Error: ${error.message}`;
}

export function gameSelectionPrompt(entities: readonly { readonly id: string; readonly name?: string }[]): string {
  const list = entities.map((entity) => entity.name && entity.name !== entity.id ? `${entity.name} (${entity.id})` : entity.id).join(", ");
  return `Explain what the selected entities do in this game, including their behaviors and how the player interacts with them. Selected: ${list}`;
}

export function gamePlaytestPrompt(): string {
  return "Playtest this game from the start. Report anything that blocks progress, behaves differently from the design, or raises a script error. Propose fixes before editing.";
}
