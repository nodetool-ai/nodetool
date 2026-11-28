/**
 * Flat colours for slots still bound to a `builtin:` placeholder, so a game
 * reads before its art is generated. Keyed by asset slot. Any other slot
 * without an image draws magenta, which marks it as missing.
 */
const PLACEHOLDER_COLORS: Readonly<Record<string, string>> = {
  player: "#2acae9",
  wall: "#5c6978",
  gem: "#ffc432",
  enemy: "#e2475a",
  hazard: "#ff7a2a",
  exit: "#9a7cff",
  floor: "#262b38"
};

export const MISSING_ASSET_COLOR = "#ff00ff";

/** The placeholder colour of a slot as `#rrggbb`, or undefined for a slot that has none. */
export function placeholderColor(assetId: string): string | undefined {
  return Object.hasOwn(PLACEHOLDER_COLORS, assetId) ? PLACEHOLDER_COLORS[assetId] : undefined;
}

/** The placeholder colour as opaque RGBA bytes. */
export function placeholderRgba(assetId: string): [number, number, number, number] | undefined {
  const hex = placeholderColor(assetId);
  if (!hex) {
    return undefined;
  }
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff, 255];
}
