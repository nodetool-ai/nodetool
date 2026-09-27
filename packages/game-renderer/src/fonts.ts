import type { GameDocument } from "@nodetool-ai/protocol";

/** A unique, CSS-safe family for one logical font in one game. */
export function gameFontFamily(gameId: string, fontId: string): string {
  const encode = (value: string): string => [...new TextEncoder().encode(value)]
    .map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `ntg-${encode(gameId)}-${encode(fontId)}`;
}

export function fontBindings(document: GameDocument): Array<[string, GameDocument["assets"][string]]> {
  return Object.entries(document.assets).filter((entry) => entry[1].mediaKind === "font");
}
