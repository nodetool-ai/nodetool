import { isMac } from "../../../utils/platform";
import type { SketchActionId } from "./actionRegistry";
import { BINDING_CATALOG, type BindingEntry } from "./bindingCatalog";

export { isMac };

/**
 * True if the event's primary command modifier is held.
 * Ctrl on Win/Linux, Cmd on Mac.
 */
export function isPrimaryModifier(e: KeyboardEvent): boolean {
  return isMac() ? e.metaKey : e.ctrlKey;
}

/**
 * Normalize a key name for catalog matching.
 * Lowercases alpha keys; passes special keys through as-is.
 */
export function normalizeKey(key: string): string {
  return key.length === 1 ? key.toLowerCase() : key;
}

/**
 * Build a canonical combo string from a KeyboardEvent for fast lookup.
 * Format: [ctrl+][shift+][alt+]<normalizedKey>
 *
 * For non-alphabetic single-character keys (e.g. `{`, `}`, `+`), the Shift
 * modifier is already encoded in `e.key` itself (Shift+[ produces `{`), so we
 * omit the `shift` prefix to match catalog entries that use the shifted symbol
 * directly (e.g. `{ key: "{", modifiers: {} }`).
 */
export function buildComboString(e: KeyboardEvent): string {
  const normalizedKey = normalizeKey(e.key);
  const parts: string[] = [];
  if (isPrimaryModifier(e)) parts.push("ctrl");
  // Include "shift" only for multi-character keys (e.g. ArrowUp) and lowercase
  // alpha keys; for symbol keys the shift is encoded in the key value itself.
  if (e.shiftKey && (normalizedKey.length > 1 || /^[a-z]$/.test(normalizedKey))) {
    parts.push("shift");
  }
  if (e.altKey) parts.push("alt");
  parts.push(normalizedKey);
  return parts.join("+");
}

function entryToComboString(
  entry: Pick<BindingEntry, "key" | "modifiers">
): string {
  const parts: string[] = [];
  if (entry.modifiers.ctrl) parts.push("ctrl");
  if (entry.modifiers.shift) parts.push("shift");
  if (entry.modifiers.alt) parts.push("alt");
  parts.push(entry.key);
  return parts.join("+");
}

export function displayBinding(entry: Pick<BindingEntry, "key" | "modifiers">): string {
  const parts: string[] = [];
  if (entry.modifiers.ctrl) parts.push(isMac() ? "⌘" : "Ctrl");
  if (entry.modifiers.shift) parts.push(isMac() ? "⇧" : "Shift");
  if (entry.modifiers.alt) parts.push(isMac() ? "⌥" : "Alt");
  const key = entry.key.length === 1 ? entry.key.toUpperCase() : entry.key;
  parts.push(key);
  return isMac() ? parts.join("") : parts.join("+");
}

// Precomputed combo → actionId maps per scope for O(1) dispatch.
// Panel:layers entries are omitted — they are dispatched by panel components, not the central dispatcher.
type ScopeComboMap = Map<string, SketchActionId>;

function buildScopeMap(scope: "global" | "mode:transform" | "mode:crop"): ScopeComboMap {
  const map = new Map<string, SketchActionId>();
  for (const entry of BINDING_CATALOG) {
    if (entry.scope !== scope) continue;
    const combo = entryToComboString(entry);
    // First entry wins for any given combo (catalog order is the priority).
    if (!map.has(combo)) map.set(combo, entry.actionId);
  }
  return map;
}

export const GLOBAL_MAP = buildScopeMap("global");
export const TRANSFORM_MAP = buildScopeMap("mode:transform");
export const CROP_MAP = buildScopeMap("mode:crop");

/** OS-aware display string for a key combo, e.g. "⌘Z" on Mac, "Ctrl+Z" on Win. */
export function displayCombo(actionId: SketchActionId): string {
  const combos = BINDING_CATALOG
    .filter((entry) => entry.actionId === actionId && entry.scope !== "panel:layers")
    .map((entry) => displayBinding(entry));

  return [...new Set(combos)].join(" / ");
}
