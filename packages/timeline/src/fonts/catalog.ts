/**
 * The typefaces NodeTool ships, and the rule every host resolves a text
 * clip's `fontFamily` through.
 *
 * A font family named in a document used to mean whatever the machine drawing
 * the frame happened to have installed (F15): the editor preview, the server
 * render and the agent's frame preview each resolved `Inter, Arial,
 * sans-serif` against a different set of system fonts, so the same document
 * produced three different pictures. A bundled corpus fixes the picture; a
 * system font stays available and is reported as non-portable instead (D8).
 *
 * The files live in `packages/timeline/fonts/` next to their OFL licences
 * (C7). Every one is registered in `@nodetool-ai/config`'s
 * `PACKAGE_RUNTIME_ASSET_DIRS`, so `bundle-backend.mjs` stages the directory
 * and `verify-backend-bundle.mjs` fails a build that ships without it (C6).
 *
 * Pure data plus string handling: this module is reachable from the package
 * root, so it must not import anything (AS2). Registering the files with a
 * canvas implementation is `register-node.ts`, which is not.
 */

/** The generic CSS family a face falls back to before `sans-serif`. */
export type BundledFontGeneric = "sans-serif" | "serif" | "monospace";

/** The slant a face file carries. */
export type BundledFontStyle = "normal" | "italic";

/** One font file in the corpus. */
export interface BundledFontFace {
  /** CSS family name, exactly as the file's `name` table reports it. */
  family: string;
  /** The slant this file draws. A family ships at most one file per slant. */
  style: BundledFontStyle;
  /**
   * The `wght` axis range this file covers, `[min, max]`. A static face
   * reports the single weight it draws, so the pair is enough for both the
   * `@font-face` descriptor the browser needs and the picker's label.
   */
  weights: readonly [number, number];
  /** File name under `packages/timeline/fonts/`. */
  file: string;
  /** The OFL text shipped beside it, same directory. */
  license: string;
  /** What the family falls back to when the file itself fails to load. */
  generic: BundledFontGeneric;
}

/**
 * The corpus. Ordered by how a title is most likely to be set — the default
 * family first — because the fonts endpoint and the inspector picker list
 * bundled faces in this order before the system ones.
 *
 * Weight ranges are read from each file's `fvar` table rather than from the
 * family's documentation: a browser given a range wider than the axis clamps
 * silently, and one given a narrower range refuses weights the file can draw.
 */
export const BUNDLED_FONTS: readonly BundledFontFace[] = [
  {
    family: "Inter",
    style: "normal",
    weights: [100, 900],
    file: "Inter-Variable.ttf",
    license: "OFL-Inter.txt",
    generic: "sans-serif"
  },
  {
    family: "Inter",
    style: "italic",
    weights: [100, 900],
    file: "Inter-Italic-Variable.ttf",
    license: "OFL-Inter.txt",
    generic: "sans-serif"
  },
  {
    family: "Space Grotesk",
    style: "normal",
    weights: [300, 700],
    file: "SpaceGrotesk-Variable.ttf",
    license: "OFL-SpaceGrotesk.txt",
    generic: "sans-serif"
  },
  {
    family: "Bebas Neue",
    style: "normal",
    weights: [400, 400],
    file: "BebasNeue-Regular.ttf",
    license: "OFL-BebasNeue.txt",
    generic: "sans-serif"
  },
  {
    family: "Playfair Display",
    style: "normal",
    weights: [400, 900],
    file: "PlayfairDisplay-Variable.ttf",
    license: "OFL-PlayfairDisplay.txt",
    generic: "serif"
  },
  {
    family: "Playfair Display",
    style: "italic",
    weights: [400, 900],
    file: "PlayfairDisplay-Italic-Variable.ttf",
    license: "OFL-PlayfairDisplay.txt",
    generic: "serif"
  },
  {
    family: "Lora",
    style: "normal",
    weights: [400, 700],
    file: "Lora-Variable.ttf",
    license: "OFL-Lora.txt",
    generic: "serif"
  },
  {
    family: "Lora",
    style: "italic",
    weights: [400, 700],
    file: "Lora-Italic-Variable.ttf",
    license: "OFL-Lora.txt",
    generic: "serif"
  },
  {
    family: "JetBrains Mono",
    style: "normal",
    weights: [100, 800],
    file: "JetBrainsMono-Variable.ttf",
    license: "OFL-JetBrainsMono.txt",
    generic: "monospace"
  },
  {
    family: "JetBrains Mono",
    style: "italic",
    weights: [100, 800],
    file: "JetBrainsMono-Italic-Variable.ttf",
    license: "OFL-JetBrainsMono.txt",
    generic: "monospace"
  }
];

/** The family a text style with no `fontFamily` is set in. */
export const DEFAULT_FONT_FAMILY = "Inter";

/** Bundled family names, each once, in {@link BUNDLED_FONTS} order. */
export const BUNDLED_FONT_FAMILIES: readonly string[] = [
  ...new Set(BUNDLED_FONTS.map((face) => face.family))
];

/**
 * Every file the corpus consists of — faces and licences alike, since a build
 * that drops a licence is as wrong as one that drops a face (C7). This is what
 * the bundle staging and the artifact check assert against.
 */
export const BUNDLED_FONT_FILES: readonly string[] = [
  ...new Set(
    BUNDLED_FONTS.flatMap((face) => [face.file, face.license])
  )
].sort();

/** Case-insensitive family lookup, built once. */
const familiesByLowerName = new Map<string, string>(
  BUNDLED_FONTS.map((face) => [face.family.toLowerCase(), face.family])
);

/**
 * A family's faces, in catalog order. Empty for a family nothing bundles.
 */
export function bundledFacesFor(family: string): BundledFontFace[] {
  const canonical = familiesByLowerName.get(family.trim().toLowerCase());
  if (canonical === undefined) return [];
  return BUNDLED_FONTS.filter((face) => face.family === canonical);
}

/** Whether `family` names one of the shipped faces. */
export function isBundledFamily(family: string | undefined): boolean {
  if (family === undefined) return false;
  return familiesByLowerName.has(primaryFamilyOf(family).toLowerCase());
}

/**
 * The first family of a CSS family list. A document usually carries one name,
 * but the old default was the stack `Inter, Arial, sans-serif` and saved
 * documents still hold it, so the head of the list is what portability is
 * decided on.
 */
function primaryFamilyOf(value: string): string {
  const head = value.split(",")[0] ?? "";
  return head.trim().replace(/^["']|["']$/g, "").trim();
}

/**
 * A family name quoted for the `font` shorthand.
 *
 * The shorthand is parsed as a whole, so one unbalanced quote makes a canvas
 * ignore the assignment and keep whatever font it last had — the wrong
 * picture rather than an unstyled one. Quote characters and the semicolons
 * that would end a declaration are therefore dropped, not escaped.
 */
function quoteFamily(family: string): string {
  const clean = family.replace(/["';]/g, "").trim();
  if (clean === "") return "";
  return /^[A-Za-z][A-Za-z0-9-]*$/.test(clean) ? clean : `"${clean}"`;
}

/** What {@link resolveFontFamily} decided about a document's `fontFamily`. */
export interface ResolvedFontFamily {
  /** The CSS family list to set on a context, always ending in `sans-serif`. */
  family: string;
  /** True when the head of the list is a face NodeTool ships (D8). */
  portable: boolean;
}

/**
 * Turn a document's `fontFamily` into the family list every host draws with.
 *
 * A bundled family resolves to itself plus its generic; anything else keeps
 * the name it was given and falls back to the bundled default, so a document
 * authored against a system font still renders text on a host that lacks it
 * rather than nothing at all. Either way the list ends in `sans-serif`, which
 * is the last stop a canvas is guaranteed to have.
 */
export function resolveFontFamily(
  name: string | undefined
): ResolvedFontFamily {
  const requested = primaryFamilyOf(name ?? "");
  if (requested === "") {
    return {
      family: `${quoteFamily(DEFAULT_FONT_FAMILY)}, sans-serif`,
      portable: true
    };
  }
  const canonical = familiesByLowerName.get(requested.toLowerCase());
  if (canonical !== undefined) {
    const generic = bundledFacesFor(canonical)[0]?.generic ?? "sans-serif";
    const stack = [quoteFamily(canonical)];
    if (generic !== "sans-serif") stack.push(generic);
    stack.push("sans-serif");
    return { family: stack.join(", "), portable: true };
  }
  const quoted = quoteFamily(requested);
  if (quoted === "") {
    return {
      family: `${quoteFamily(DEFAULT_FONT_FAMILY)}, sans-serif`,
      portable: true
    };
  }
  return {
    family: `${quoted}, ${quoteFamily(DEFAULT_FONT_FAMILY)}, sans-serif`,
    portable: false
  };
}
