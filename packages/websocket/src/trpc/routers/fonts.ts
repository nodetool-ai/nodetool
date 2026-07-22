/**
 * Fonts router — migrated from REST `/api/fonts`.
 *
 * A GET-only, filesystem-backed listing with no streaming or long-running
 * semantics, so it moves to tRPC cleanly.
 */

import { readdirSync, existsSync } from "node:fs";
import { join, extname, basename } from "node:path";
import { homedir, platform } from "node:os";
import { router } from "../index.js";
import { protectedProcedure } from "../middleware.js";
import { listOutput as fontsListOutput } from "@nodetool-ai/protocol/api-schemas/fonts.js";

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
        for (const entry of readdirSync(dir) as unknown as string[]) {
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
        for (const entry of readdirSync(fontDir) as unknown as string[]) {
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
            typeof entry === "string" ? entry : entry.toString();
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

export const fontsRouter = router({
  list: protectedProcedure.output(fontsListOutput).query(async () => {
    return { fonts: collectFonts() };
  })
});
