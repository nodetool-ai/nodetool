import { COMP_LIBRARY, compLibraryIndex } from "./compLibrary.js";
import { resolveClipHarmony } from "./expand.js";
import type { ClipHarmony } from "../types.js";

/** A short reading of a clip's harmony, such as "comp: Ballad Pads, scale: chords". Undefined when it does nothing. */
export function harmonySummary(harmony: ClipHarmony | undefined): string | undefined {
  if (!harmony) return undefined;
  const parts: string[] = [];
  if (harmony.style === "comp") {
    const r = resolveClipHarmony(harmony);
    const i = compLibraryIndex(r);
    parts.push(`comp: ${i >= 0 ? COMP_LIBRARY[i].name : "custom"}`);
  } else if (harmony.style === "arp") {
    parts.push(`arp: ${harmony.order ?? "up"}`);
  }
  if (harmony.style !== "off" && harmony.input === "notes") parts.push("input: notes");
  if (harmony.scale && harmony.scale !== "off") parts.push(`scale: ${harmony.scale}`);
  return parts.length ? parts.join(", ") : undefined;
}
