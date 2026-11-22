/**
 * The font families a text clip can name on this machine: the bundled corpus
 * first, then whatever the host has installed.
 *
 * One listing for every host that offers fonts — the tRPC `fonts.list` the
 * editor reads and the `list_fonts` agent capability — so the editor and a
 * run see the same names in the same order.
 *
 * The bundled corpus is tagged `portable` (D8): naming one of those families
 * is a decision that survives the machine, and naming a system font is not.
 * A system font stays choosable; the caller marks the difference rather than
 * hiding it.
 *
 * Not re-exported from the package root or from `./fonts`: it reads the file
 * system, and the root export has no Node dependencies (AS2). Reach it as
 * `@nodetool-ai/timeline/fonts/list`.
 */

import { readdirSync, existsSync } from "node:fs";
import { join, extname, basename } from "node:path";
import { homedir, platform } from "node:os";

import { BUNDLED_FONT_FAMILIES } from "./catalog.js";

/** One family a text clip can name. */
export interface FontFamilyEntry {
  name: string;
  /** `bundled` ships with NodeTool; `system` is installed on this machine. */
  source: "bundled" | "system";
  /** Whether a document that names it renders the same on every host. */
  portable: boolean;
}

/** Names of the font files in `dir` with one of `exts`, or none when unreadable. */
function fontNamesIn(
  dir: string,
  exts: readonly string[],
  recursive: boolean
): string[] {
  if (!existsSync(dir)) return [];
  try {
    const names: string[] = [];
    for (const entry of readdirSync(dir, { recursive })) {
      const file = typeof entry === "string" ? entry : entry.toString();
      const ext = extname(file).toLowerCase();
      if (exts.includes(ext)) names.push(basename(file, ext));
    }
    return names;
  } catch {
    return [];
  }
}

/** The installed font families of this machine, sorted, each once. */
export function listSystemFontFamilies(): string[] {
  const os = platform();
  let fonts: string[];
  if (os === "darwin") {
    const exts = [".ttf", ".otf", ".ttc", ".dfont"];
    fonts = [
      "/Library/Fonts",
      "/System/Library/Fonts",
      join(homedir(), "Library", "Fonts")
    ].flatMap((dir) => fontNamesIn(dir, exts, false));
  } else if (os === "win32") {
    const dir = join(process.env["WINDIR"] ?? "C:\\Windows", "Fonts");
    fonts = fontNamesIn(dir, [".ttf", ".otf", ".ttc"], false);
  } else {
    fonts = [
      "/usr/share/fonts",
      "/usr/local/share/fonts",
      join(homedir(), ".fonts")
    ].flatMap((dir) => fontNamesIn(dir, [".ttf", ".otf"], true));
  }
  return Array.from(new Set(fonts)).sort();
}

/**
 * The bundled faces, then the system ones with the bundled names removed — a
 * machine that also has Inter installed must not offer it twice, and the
 * bundled copy is the one every host actually draws with.
 */
export function listFontFamilies(
  systemFamilies: readonly string[] = listSystemFontFamilies()
): FontFamilyEntry[] {
  const bundled = new Set(BUNDLED_FONT_FAMILIES);
  return [
    ...BUNDLED_FONT_FAMILIES.map((name) => ({
      name,
      source: "bundled" as const,
      portable: true
    })),
    ...systemFamilies
      .filter((name) => !bundled.has(name))
      .map((name) => ({ name, source: "system" as const, portable: false }))
  ];
}
