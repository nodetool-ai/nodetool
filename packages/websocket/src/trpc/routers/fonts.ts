/**
 * Fonts router — migrated from REST `/api/fonts`.
 *
 * A GET-only, filesystem-backed listing with no streaming or long-running
 * semantics, so it moves to tRPC cleanly.
 *
 * The bundled corpus comes first, tagged `portable` (D8): naming one of those
 * families is a decision that survives the machine, and naming a system font
 * is not. The system scan below is unchanged — a system font stays choosable,
 * and the inspector marks the difference rather than hiding it.
 */

import { readdirSync, existsSync } from "node:fs";
import { join, extname, basename } from "node:path";
import { homedir, platform } from "node:os";
import { router } from "../index.js";
import { protectedProcedure } from "../middleware.js";
import {
  listOutput as fontsListOutput,
  type FontEntry
} from "@nodetool-ai/protocol/api-schemas/fonts.js";
import { BUNDLED_FONT_FAMILIES } from "@nodetool-ai/timeline";
import { isString } from "../../lib/wire-values.js";

// ── Font listing helpers ──────────────────────────────────────────

function collectFonts(): string[] {
  const fonts: string[] = [];
  const os = platform();

  if (os === "darwin") {
    const fontDirs = [
      "/Library/Fonts",
      "/System/Library/Fonts",
      join(homedir(), "Library", "Fonts")
    ];
    for (const dir of fontDirs) {
      if (!existsSync(dir)) continue;
      try {
        for (const entry of readdirSync(dir)) {
          const ext = extname(entry).toLowerCase();
          if ([".ttf", ".otf", ".ttc", ".dfont"].includes(ext)) {
            fonts.push(basename(entry, ext));
          }
        }
      } catch {
        /* skip */
      }
    }
  } else if (os === "win32") {
    const fontDir = join(process.env["WINDIR"] ?? "C:\\Windows", "Fonts");
    if (existsSync(fontDir)) {
      try {
        for (const entry of readdirSync(fontDir)) {
          const ext = extname(entry).toLowerCase();
          if ([".ttf", ".otf", ".ttc"].includes(ext)) {
            fonts.push(basename(entry, ext));
          }
        }
      } catch {
        /* skip */
      }
    }
  } else {
    const fontDirs = [
      "/usr/share/fonts",
      "/usr/local/share/fonts",
      join(homedir(), ".fonts")
    ];
    for (const dir of fontDirs) {
      if (!existsSync(dir)) continue;
      try {
        const entries = readdirSync(dir, { recursive: true });
        for (const entry of entries) {
          const entryStr =
            isString(entry) ? entry : entry.toString();
          const ext = extname(entryStr).toLowerCase();
          if ([".ttf", ".otf"].includes(ext)) {
            fonts.push(basename(entryStr, ext));
          }
        }
      } catch {
        /* skip */
      }
    }
  }

  return Array.from(new Set(fonts)).sort();
}

// ── Router ────────────────────────────────────────────────────────

/**
 * The bundled faces, then the system ones with the bundled names removed — a
 * machine that also has Inter installed must not offer it twice, and the
 * bundled copy is the one every host actually draws with.
 */
function listFonts(): FontEntry[] {
  const bundled = new Set(BUNDLED_FONT_FAMILIES);
  return [
    ...BUNDLED_FONT_FAMILIES.map((name) => ({
      name,
      source: "bundled" as const,
      portable: true
    })),
    ...collectFonts()
      .filter((name) => !bundled.has(name))
      .map((name) => ({ name, source: "system" as const, portable: false }))
  ];
}

export const fontsRouter = router({
  list: protectedProcedure.output(fontsListOutput).query(async () => {
    return { fonts: listFonts() };
  })
});
