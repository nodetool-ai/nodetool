/**
 * Convert a node className (e.g. "GPT_4_1_Nano", "StableDiffusionXL",
 * "Ideogram_V3_Balanced") into a human-readable title shown in the node
 * menu.
 *
 * Rules:
 *  - "_" is treated as a word separator (so "Imagen_4_Ultra" yields three
 *    chunks: "Imagen", "4", "Ultra").
 *  - camelCase / PascalCase boundaries are split, while uppercase runs are
 *    kept together — so "StableDiffusionXL" becomes "Stable Diffusion XL"
 *    rather than "Stable Diffusion X L", and "SDXL_Ad_Inpaint" stays as
 *    "SDXL Ad Inpaint" rather than "S D X L Ad Inpaint".
 *  - Consecutive purely-numeric tokens are joined with a "." — this
 *    reconstructs the version numbers in the original model slugs (so
 *    "GPT_4_1_Nano" → "GPT 4.1 Nano", "Flux_1_1_Pro_Ultra" →
 *    "Flux 1.1 Pro Ultra", "Veo_3_1_Lite" → "Veo 3.1 Lite").
 *
 * @example
 * classNameToTitle("GPT_4_1_Nano")           // "GPT 4.1 Nano"
 * classNameToTitle("Imagen_4_Ultra")         // "Imagen 4 Ultra"
 * classNameToTitle("Ideogram_V3_Balanced")   // "Ideogram V3 Balanced"
 * classNameToTitle("StableDiffusionXL")      // "Stable Diffusion XL"
 * classNameToTitle("Recraft_20B_SVG")        // "Recraft 20B SVG"
 */
export function classNameToTitle(className: string): string {
  if (!className) {
    return "";
  }

  // 1) Split on underscores AND camelCase / acronym boundaries.
  //    The regex passes are applied per underscore-delimited chunk so
  //    purely-numeric tokens stay intact for the merge step below.
  const tokens = className
    .split("_")
    .flatMap((part) =>
      part
        .replace(/([a-z])([A-Z0-9])/g, "$1 $2") // "fooBar" → "foo Bar", "foo4" → "foo 4"
        .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2") // "XLLightning" → "XL Lightning"
        .split(" ")
    )
    .filter((tok) => tok.length > 0);

  // 2) Merge consecutive purely-numeric tokens with "." so the version
  //    numbers in slugs like "gpt-4.1-nano" round-trip ("4_1" → "4.1").
  const merged: string[] = [];
  for (const tok of tokens) {
    const last = merged[merged.length - 1];
    if (last !== undefined && /^\d+$/.test(last) && /^\d+$/.test(tok)) {
      merged[merged.length - 1] = `${last}.${tok}`;
    } else {
      merged.push(tok);
    }
  }

  return merged.join(" ");
}
