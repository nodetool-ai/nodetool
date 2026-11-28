import type { GameDesign } from "@nodetool-ai/protocol/api-schemas/workflows.js";

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

/**
 * The turn that finishes a game the Game flow built. The build made the
 * template's room and drew its art; this asks the assistant to turn that into
 * the reviewed design, playtest it and stop once it plays start to finish.
 */
export function gameFinishPrompt(design: GameDesign,
  placeholders: readonly { readonly slot: string; readonly reason: string }[] = []): string {
  const list = (items: readonly string[]) => items.length > 0 ? items.map((item) => `- ${item}`).join("\n") : "- (none)";
  const lines = [
    "The Game flow just built this game from the design below: the template's room with generated art bound to its slots. Finish it so it plays as designed. Work without waiting for me unless something in the design cannot be built.",
    "",
    "1. Read the game with get_native_game (view: \"outline\") and compare it with the design.",
    "2. Write a todo list for the work with todo_write and keep it current, so I can follow your progress.",
    "3. Build the level, the player's verbs, the enemies and their behaviour, and the win and lose conditions with edit_native_game. Keep the art already bound to its slots.",
    "4. Playtest from the start with playtest_native_game until both a win and a loss happen, capture a frame to check the look, and fix anything that blocks progress or raises a script error.",
    "5. Stop when the game plays from start to finish. Reply with what you built, what to try first, and anything left undone. Do not publish.",
    "",
    `Title: ${design.title}`,
    `Premise: ${design.premise}`,
    `Core loop: ${design.core_loop}`,
    "Player verbs:",
    list(design.player_verbs),
    "Enemies:",
    list(design.enemies.map((enemy) => `${enemy.name} (slot ${enemy.slot_id}): ${enemy.behaviour}`)),
    `Level: ${design.level}`,
    `Win: ${design.win}`,
    `Lose: ${design.lose}`,
    "Cast:",
    list(design.cast.map((member) => `${member.name} (slot ${member.slot_id}): ${member.descriptor}`))
  ];
  if (placeholders.length > 0) {
    lines.push("", "Art that kept the template's placeholder (generate it again with the game's asset tools if it matters for play):",
      list(placeholders.map((entry) => `${entry.slot}: ${entry.reason}`)));
  }
  return lines.join("\n");
}
