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

export function gameConsolePrompt(line: { readonly level: string; readonly message: string; readonly tick?: number; readonly firstTick?: number;
  readonly count?: number; readonly sceneId?: string; readonly entityId?: string }, entityName?: string): string {
  const parts = [`Help with this game console ${line.level}.`];
  if (line.sceneId) { parts.push(`Scene: ${line.sceneId}.`); }
  if (line.entityId) { parts.push(`Entity: ${entityName && entityName !== line.entityId ? `${entityName} (${line.entityId})` : line.entityId}.`); }
  if (line.tick !== undefined) {
    parts.push(line.firstTick !== undefined && line.firstTick !== line.tick ? `Ticks: ${line.firstTick} to ${line.tick}.` : `Tick: ${line.tick}.`);
  }
  if (line.count && line.count > 1) { parts.push(`Repeated ${line.count} times.`); }
  parts.push(`Message: ${line.message}`);
  return parts.join(" ");
}
