/**
 * Map KeyboardEvent.key values to on-screen keyboard `data-skbtn` ids (lowercase).
 */

export function physicalKeyToLayoutButtonId(rawKey: string): string {
  if (rawKey === " ") {
    return "space";
  }
  return rawKey.toLowerCase();
}
