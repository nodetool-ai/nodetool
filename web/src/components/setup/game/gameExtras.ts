/**
 * The one thing the Game flow keeps on the workflow beyond the fields the
 * protocol schema names: what the build came out as.
 *
 * The landing checklist reads it (game-prd § 4.4), and it has to survive the
 * reload that a creator does after closing the tab — the flow's own surface is
 * gone by then, so a result held in component state would be gone with it.
 * `settings.game` is a passthrough record, so this travels with the workflow
 * and through `writeGameSetup` untouched, exactly as `plan_source` and
 * `role_models` do for the Workflow flow (`workflow/setupExtras.ts`).
 *
 * It is parsed here rather than read raw: what comes back off a saved workflow
 * is whatever the last client wrote, and a malformed value has to read as "no
 * build", never as a build.
 */

import { z } from "zod";
import type { GameSetup } from "@nodetool-ai/protocol/api-schemas/workflows.js";

/** What `useBuildGame` returned, in the shape the document stores it. */
export const gameBuildSchema = z.object({
  node_count: z.number(),
  issues: z.array(z.string()),
  validation_errors: z.array(z.string()),
  run_started: z.boolean(),
  run_error: z.string().nullable()
});
export type GameBuildRecord = z.infer<typeof gameBuildSchema>;

export const GAME_BUILD_KEY = "build";

export const readGameBuild = (
  game: GameSetup | null
): GameBuildRecord | null => {
  const parsed = gameBuildSchema.safeParse(game?.[GAME_BUILD_KEY]);
  return parsed.success ? parsed.data : null;
};

/** The stored record for one build result. */
export const gameBuildRecord = (result: {
  nodeCount: number;
  issues: string[];
  validationErrors: string[];
  run: { started: boolean; error: string | null };
}): GameBuildRecord => ({
  node_count: result.nodeCount,
  issues: result.issues,
  validation_errors: result.validationErrors,
  run_started: result.run.started,
  run_error: result.run.error
});

/** The record read back as the checklist's `BuildGameResult`. */
export const gameBuildResult = (record: GameBuildRecord) => ({
  nodeCount: record.node_count,
  issues: record.issues,
  validationErrors: record.validation_errors,
  run: { started: record.run_started, error: record.run_error }
});
