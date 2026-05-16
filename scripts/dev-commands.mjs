import { resolve } from "node:path";

/** Globs passed to `tsx watch --exclude` for the backend dev server. */
export const tsxWatchExcludeGlobs = [
  // Packages like base-nodes / fal-nodes load from dist only. While
  // `npm run build:packages` (or turbo) runs, every dist write would
  // otherwise restart tsx in a tight loop if we watch those paths.
  "**/dist/**",
  "**/node_modules/**",
  "**/.turbo/**",
  "**/*.tsbuildinfo",
];

/**
 * Build the command and args required to run an entrypoint with the
 * repo-local tsx CLI under watch mode.
 *
 * Uses the `tsx watch` subcommand (with path excludes) instead of
 * `tsx --watch`, so rebuild output under packages/*/dist does not
 * constantly restart the server during parallel `build:packages`.
 */
export function getTsxWatchCommand(repoRoot, entrypoint) {
  const tsxCli = resolve(repoRoot, "node_modules", "tsx", "dist", "cli.mjs");
  const excludeArgs = tsxWatchExcludeGlobs.flatMap((pattern) => ["--exclude", pattern]);
  return {
    command: process.execPath,
    args: [tsxCli, "watch", ...excludeArgs, entrypoint],
  };
}
