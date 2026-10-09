import type { GameDimension } from "./panelRegistry";
import { isEditableElement } from "../../../utils/browser";

/**
 * Where a command's shortcut is accepted. `shell` accepts it anywhere in the editor outside text fields,
 * `panel` inside panels that accept editor shortcuts (`data-game-undo-scope`), and `viewport` inside the viewport panel.
 */
export type GameCommandScope = "shell" | "panel" | "viewport";
export type GameCommandCategory = "Editor" | "Edit" | "View" | "Tools" | "Play" | "Panels" | "Assistant";

/** `mod` is Ctrl on Windows and Linux and Cmd on macOS. Either modifier matches on every platform. */
export interface GameKeyBinding {
  readonly code: string;
  readonly mod?: boolean;
  readonly shift?: boolean;
  readonly alt?: boolean;
}

export interface GameCommandDefinition {
  readonly id: string;
  readonly title: string;
  readonly category: GameCommandCategory;
  readonly dimensions: readonly GameDimension[];
  readonly scope: GameCommandScope;
  readonly defaultBindings: readonly GameKeyBinding[];
  /** Accept the shortcut while a play session is open. Other shortcuts leave keys to the game. */
  readonly whilePlaying?: boolean;
  /** Ignore auto-repeat while the key is held, for toggles. */
  readonly noRepeat?: boolean;
}

const BOTH: readonly GameDimension[] = ["2d", "3d"];
const ONLY_2D: readonly GameDimension[] = ["2d"];
const ONLY_3D: readonly GameDimension[] = ["3d"];

function command(id: string, title: string, category: GameCommandCategory, dimensions: readonly GameDimension[],
  scope: GameCommandScope, defaultBindings: readonly GameKeyBinding[], whilePlaying = false): GameCommandDefinition {
  return { id, title, category, dimensions, scope, defaultBindings, whilePlaying };
}

function nudge(direction: "Left" | "Right" | "Up" | "Down", far: boolean): GameCommandDefinition {
  const code = `Arrow${direction}`;
  // Alt+arrow also nudges in the viewport. The scene tree handles Alt+arrow itself to reorder entities.
  const bindings: GameKeyBinding[] = far ? [{ code, shift: true }, { code, shift: true, alt: true }] : [{ code }, { code, alt: true }];
  return command(`edit.nudge${direction}${far ? "Far" : ""}`, `Nudge selection ${direction.toLowerCase()}${far ? " by 2.5 units" : ""}`,
    "Edit", ONLY_2D, "viewport", bindings);
}

/** Every game editor command, in palette order. Both editors read their default shortcuts from this list. */
export const GAME_COMMANDS: readonly GameCommandDefinition[] = [
  command("editor.commandPalette", "Open command palette", "Editor", BOTH, "shell", [{ code: "KeyK", mod: true }], true),
  command("editor.keyboardShortcuts", "Edit keyboard shortcuts", "Editor", BOTH, "shell", [], true),
  command("editor.publish", "Publish game", "Editor", BOTH, "shell", []),
  command("edit.undo", "Undo", "Edit", BOTH, "panel", [{ code: "KeyZ", mod: true }]),
  command("edit.redo", "Redo", "Edit", BOTH, "panel", [{ code: "KeyZ", mod: true, shift: true }]),
  command("edit.copy", "Copy selection", "Edit", ONLY_2D, "viewport", [{ code: "KeyC", mod: true }]),
  command("edit.paste", "Paste", "Edit", ONLY_2D, "viewport", [{ code: "KeyV", mod: true }]),
  command("edit.duplicate", "Duplicate selection", "Edit", ONLY_2D, "viewport", [{ code: "KeyD", mod: true }]),
  command("edit.delete", "Delete selection", "Edit", ONLY_2D, "viewport", [{ code: "Delete" }, { code: "Backspace" }]),
  nudge("Left", false), nudge("Right", false), nudge("Up", false), nudge("Down", false),
  nudge("Left", true), nudge("Right", true), nudge("Up", true), nudge("Down", true),
  command("view.frameSelection", "Frame selection", "View", BOTH, "viewport", [{ code: "KeyF" }]),
  command("view.resetCamera", "Reset camera", "View", ONLY_2D, "viewport", [{ code: "Home" }]),
  { ...command("view.toggleSnap", "Toggle snapping", "View", BOTH, "viewport", [{ code: "KeyG" }]), noRepeat: true },
  command("tool.move", "Move tool", "Tools", ONLY_3D, "viewport", [{ code: "KeyW" }]),
  command("tool.rotate", "Rotate tool", "Tools", ONLY_3D, "viewport", [{ code: "KeyE" }]),
  command("tool.scale", "Scale tool", "Tools", ONLY_3D, "viewport", [{ code: "KeyR" }]),
  command("play.toggle", "Play or pause", "Play", BOTH, "shell", [], true),
  command("play.step", "Step one tick", "Play", BOTH, "shell", [], true),
  command("play.stop", "Stop play session", "Play", BOTH, "shell", [], true),
  command("panel.sceneTree", "Toggle scene tree", "Panels", BOTH, "shell", []),
  command("panel.inspector", "Toggle inspector", "Panels", BOTH, "shell", []),
  command("panel.assistant", "Toggle assistant", "Panels", BOTH, "shell", [], true),
  command("assistant.playtest", "Ask the assistant to playtest the game", "Assistant", BOTH, "shell", [], true),
  command("assistant.explainSelection", "Ask the assistant about the selection", "Assistant", BOTH, "shell", [], true),
  command("assistant.fixScriptError", "Ask the assistant to fix the script error", "Assistant", BOTH, "shell", [], true)
];

export const GAME_COMMANDS_BY_ID: ReadonlyMap<string, GameCommandDefinition> = new Map(GAME_COMMANDS.map((entry) => [entry.id, entry]));

export interface GameCommandHandler {
  readonly run: () => void;
  /** A disabled command is hidden from the palette and its shortcut falls through to other handlers. */
  readonly enabled?: boolean;
}
export type GameCommandHandlers = Readonly<Record<string, GameCommandHandler | undefined>>;
/** User shortcut choices. A missing entry uses the default bindings. An empty list removes the shortcut. */
export type GameShortcutOverrides = Readonly<Record<string, readonly GameKeyBinding[]>>;
export type GameBindings = ReadonlyMap<string, readonly GameKeyBinding[]>;

export function resolveGameBindings(overrides: GameShortcutOverrides): GameBindings {
  return new Map(GAME_COMMANDS.map((entry) => [entry.id, overrides[entry.id] ?? entry.defaultBindings]));
}

interface KeyLike {
  readonly code: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
  readonly repeat?: boolean;
}

export function gameBindingMatches(binding: GameKeyBinding, event: KeyLike): boolean {
  return binding.code === event.code && Boolean(binding.mod) === (event.ctrlKey || event.metaKey)
    && Boolean(binding.shift) === event.shiftKey && Boolean(binding.alt) === event.altKey;
}

export function sameGameBinding(left: GameKeyBinding, right: GameKeyBinding): boolean {
  return left.code === right.code && Boolean(left.mod) === Boolean(right.mod)
    && Boolean(left.shift) === Boolean(right.shift) && Boolean(left.alt) === Boolean(right.alt);
}

const MODIFIER_CODES = new Set(["ControlLeft", "ControlRight", "MetaLeft", "MetaRight", "ShiftLeft", "ShiftRight", "AltLeft", "AltRight", "CapsLock", "Fn"]);

/** The binding a key press records in the shortcut editor, or null for a lone modifier key. */
export function gameBindingFromEvent(event: KeyLike): GameKeyBinding | null {
  if (!event.code || MODIFIER_CODES.has(event.code)) { return null; }
  const binding: { code: string; mod?: boolean; shift?: boolean; alt?: boolean } = { code: event.code };
  if (event.ctrlKey || event.metaKey) { binding.mod = true; }
  if (event.shiftKey) { binding.shift = true; }
  if (event.altKey) { binding.alt = true; }
  return binding;
}

/** Key names for `ShortcutHint`, which renders Meta as the macOS command symbol. */
export function formatGameBinding(binding: GameKeyBinding, mac: boolean): string[] {
  const keys: string[] = [];
  if (binding.mod) { keys.push(mac ? "Meta" : "Ctrl"); }
  if (binding.alt) { keys.push(mac ? "Option" : "Alt"); }
  if (binding.shift) { keys.push("Shift"); }
  keys.push(binding.code.replace(/^Key/, "").replace(/^Digit/, "").replace(/^Numpad/, "Num "));
  return keys;
}

/** Another command in a shared dimension that already uses this binding. */
export function findGameBindingConflict(commandId: string, binding: GameKeyBinding, bindings: GameBindings): GameCommandDefinition | undefined {
  const owner = GAME_COMMANDS_BY_ID.get(commandId);
  if (!owner) { return undefined; }
  return GAME_COMMANDS.find((entry) => entry.id !== commandId
    && entry.dimensions.some((dimension) => owner.dimensions.includes(dimension))
    && (bindings.get(entry.id) ?? []).some((candidate) => sameGameBinding(candidate, binding)));
}

function inScope(target: HTMLElement, scope: GameCommandScope): boolean {
  if (scope === "shell") { return true; }
  if (scope === "panel") { return target.closest("[data-game-undo-scope]") !== null; }
  return target.closest('[data-game-panel="viewport"]') !== null && target.closest("[data-game-undo-scope]") !== null;
}

export interface GameShortcutContext {
  readonly dimension: GameDimension;
  readonly playing: boolean;
  readonly bindings: GameBindings;
  readonly handler: (commandId: string) => GameCommandHandler | undefined;
}

/**
 * Runs the first enabled command whose binding matches the key press and whose scope contains the target.
 * Returns the command id, or null when the key press is left to the browser, the focused control or the game.
 */
export function dispatchGameShortcut(event: KeyLike & { readonly target: EventTarget | null; readonly defaultPrevented: boolean;
  preventDefault(): void }, context: GameShortcutContext): string | null {
  const target = event.target;
  if (event.defaultPrevented || !(target instanceof HTMLElement) || isEditableElement(target)) { return null; }
  for (const entry of GAME_COMMANDS) {
    if (!entry.dimensions.includes(context.dimension) || (context.playing && !entry.whilePlaying)
      || (event.repeat && entry.noRepeat)) { continue; }
    if (!(context.bindings.get(entry.id) ?? []).some((binding) => gameBindingMatches(binding, event))) { continue; }
    if (!inScope(target, entry.scope)) { continue; }
    const handler = context.handler(entry.id);
    if (!handler || handler.enabled === false) { continue; }
    event.preventDefault();
    handler.run();
    return entry.id;
  }
  return null;
}
