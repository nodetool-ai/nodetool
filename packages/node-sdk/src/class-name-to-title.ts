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
  // Stryker disable next-line ConditionalExpression,BlockStatement: fast-path for "" — the general path below also yields "" for "" (split → filtered to [] → join → ""), so removing it changes nothing (equivalent).
  if (!className) {
    return "";
  }

  // 1) Split on underscores AND camelCase / acronym boundaries.
  //    The regex passes are applied per underscore-delimited chunk so
  //    purely-numeric tokens stay intact for the merge step below.
  const splitWordBoundaries = (part: string): string[] => {
    // "fooBar" → "foo Bar", "foo4" → "foo 4"
    let spaced = part.replace(/([a-z])([A-Z0-9])/g, "$1 $2");
    // Stryker disable next-line Regex: collapsing the [A-Z]+ run to a single [A-Z] is equivalent — the space always lands right before the final Cap-lower pair ("XLLightning" → "XL Lightning"), so the leading caps stay glued either way.
    spaced = spaced.replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");
    return spaced.split(" ");
  };
  const tokens = className
    .split("_")
    .flatMap(splitWordBoundaries)
    .filter((tok) => tok.length > 0);

  // 2) Merge consecutive purely-numeric tokens with "." so the version
  //    numbers in slugs like "gpt-4.1-nano" round-trip ("4_1" → "4.1").
  const merged: string[] = [];
  for (const tok of tokens) {
    const last = merged[merged.length - 1];
    // Stryker disable next-line ConditionalExpression: forcing `last !== undefined` true is equivalent — the digit regexes still gate the merge (/^\d+$/.test(undefined) is false), so a non-numeric or first token never merges either way.
    if (last !== undefined && /^\d+$/.test(last) && /^\d+$/.test(tok)) {
      merged[merged.length - 1] = `${last}.${tok}`;
    } else {
      merged.push(tok);
    }
  }

  return merged.join(" ");
}
