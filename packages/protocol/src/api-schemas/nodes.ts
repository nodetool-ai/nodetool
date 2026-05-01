import { z } from "zod";

// ── Input schemas ──────────────────────────────────────────────────

export const replicateStatusOutput = z.object({
  configured: z.boolean()
});

export const validateUsernameInput = z.object({
  username: z.string().min(3).max(32)
});

export const validateUsernameOutput = z.object({
  valid: z.boolean(),
  available: z.boolean()
});

export const dummyOutput = z.object({
  type: z.string(),
  uri: z.string(),
  asset_id: z.string().nullable(),
  data: z.unknown().nullable(),
  metadata: z.unknown().nullable()
});

// ── Inferred types ─────────────────────────────────────────────────

export type ReplicateStatusOutput = z.infer<typeof replicateStatusOutput>;
export type ValidateUsernameInput = z.infer<typeof validateUsernameInput>;
export type ValidateUsernameOutput = z.infer<typeof validateUsernameOutput>;
export type DummyOutput = z.infer<typeof dummyOutput>;
