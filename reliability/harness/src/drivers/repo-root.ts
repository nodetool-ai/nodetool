/**
 * Repo-root resolution shared by every C4 driver that speaks a real entry
 * point instead of touching internals (§12: "drivers speak entry points,
 * never internals — the kernel driver is the only one allowed to touch
 * `ExecutionSession` directly"). Spawning the real `nodetool` CLI (and, for
 * `browser.ts`, the real Playwright harness) is what keeps `cli.ts` and
 * `app-headless.ts` from taking a static import on `@nodetool-ai/cli` — that
 * package's own `reliability` command (C4 item 6) imports *this* package, so
 * a static import the other way would be a circular workspace dependency.
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Walks up from this module to the checked-out repo root (the directory
 * whose `packages/cli/src/nodetool.ts` exists) — works from both `src/`
 * (ts-node/tsx dev) and `dist/` (built) locations since it only depends on
 * directory depth, not file extension. */
export function findRepoRoot(): string {
  const start = dirname(fileURLToPath(import.meta.url));
  let dir = start;
  for (let i = 0; i < 12; i++) {
    if (
      existsSync(join(dir, "package.json")) &&
      existsSync(join(dir, "packages", "cli", "src", "nodetool.ts"))
    ) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`could not locate the nodetool repo root above ${start}`);
}

/** The workspace-hoisted `tsx` binary, falling back to a bare `tsx` for a
 * shell to resolve if the root install ever changes shape. */
export function resolveTsxBin(repoRoot: string): string {
  const bin = join(
    repoRoot,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "tsx.cmd" : "tsx"
  );
  return existsSync(bin) ? bin : "tsx";
}
