import { z } from "zod";

// ── stats (GET /api/database/stats) ──────────────────────────────────
export const databaseStatsOutput = z.object({
  workflowVersions: z.object({
    count: z.number(),
    sizeMB: z.number(),
  }),
  jobs: z.object({
    count: z.number(),
    sizeMB: z.number(),
  }),
  runEvents: z.object({
    count: z.number(),
    sizeMB: z.number(),
  }),
});

export type DatabaseStatsOutput = z.infer<typeof databaseStatsOutput>;

// ── clearJobs (POST /api/database/clear-jobs) ───────────────────────────
export const clearJobsInput = z.object({
  daysToKeep: z.number().int().min(0),
});

export type ClearJobsInput = z.infer<typeof clearJobsInput>;

export const clearJobsOutput = z.object({
  deletedJobs: z.number(),
  deletedRunEvents: z.number(),
  deletedRunNodeStates: z.number(),
});

export type ClearJobsOutput = z.infer<typeof clearJobsOutput>;

// ── clearWorkflowVersions (POST /api/database/clear-versions) ─────────
export const clearVersionsInput = z.object({
  keepCount: z.number().int().min(1),
});

export type ClearVersionsInput = z.infer<typeof clearVersionsInput>;

export const clearVersionsOutput = z.object({
  deletedVersions: z.number(),
});

export type ClearVersionsOutput = z.infer<typeof clearVersionsOutput>;
