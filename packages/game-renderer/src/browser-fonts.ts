import type { GameDocument } from "@nodetool-ai/protocol";
import { fontBindings, gameFontFamily } from "./fonts.js";

export interface LoadedGameFonts {
  readonly diagnostics: readonly string[];
  dispose(): void;
}

/** Load every font before the first frame so optional fallback is deterministic. */
export async function loadBrowserGameFonts(
  document: GameDocument,
  resolveFont: (assetId: string) => Promise<string | null>,
): Promise<LoadedGameFonts> {
  const loaded: FontFace[] = [];
  const diagnostics: string[] = [];
  try {
    for (const [fontId, binding] of fontBindings(document)) {
      const family = gameFontFamily(document.id, fontId);
      try {
        const url = await resolveFont(binding.assetId);
        if (!url) throw new Error("asset is missing");
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const bytes = await response.arrayBuffer();
        const face = new FontFace(family, bytes);
        await face.load();
        documentGlobalFonts().add(face);
        loaded.push(face);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        if (binding.required !== false) throw new Error(`Required font ${fontId} could not load: ${detail}`);
        diagnostics.push(`Optional font ${fontId} could not load; using system font`);
      }
    }
  } catch (error) {
    loaded.forEach((face) => documentGlobalFonts().delete(face));
    throw error;
  }
  return { diagnostics, dispose: () => loaded.forEach((face) => documentGlobalFonts().delete(face)) };
}

function documentGlobalFonts(): FontFaceSet {
  return document.fonts;
}
