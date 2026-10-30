import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Prediction, deriveGenerationStatus } from "@nodetool-ai/models";
import { cancelGenerationForUser } from "@nodetool-ai/agents";
import { router } from "../index.js";
import { protectedProcedure } from "../middleware.js";

const generationRecord = z.object({
  generation_id: z.string(),
  project_id: z.string().nullable(),
  status: z.string(),
  provider: z.string(),
  model: z.string(),
  capability: z.string().nullable(),
  cost: z.number().nullable(),
  currency: z.string().nullable(),
  billing_unit: z.string().nullable(),
  quantity: z.number().nullable(),
  unit_price: z.number().nullable(),
  price_source: z.string().nullable(),
  started_at: z.string().nullable(),
  completed_at: z.string().nullable(),
  generation_error: z.string().nullable(),
  submission_error: z.string().nullable(),
  provider_error: z.string().nullable(),
  output_error: z.string().nullable(),
  attachment_error: z.string().nullable(),
  submission_status: z.string().nullable(),
  provider_status: z.string().nullable(),
  output_status: z.string().nullable(),
  attachment_status: z.string().nullable(),
  cancellation_requested: z.boolean(),
  can_cancel: z.boolean()
});

function toRecord(row: Prediction): z.infer<typeof generationRecord> {
  const source = row.metadata?.price_source;
  const errorField = (key: string): string | null => {
    const value = row.metadata?.[key];
    return typeof value === "string" ? value : null;
  };
  return {
    generation_id: row.id,
    project_id: row.project_id,
    status: row.status === "interrupted" ? "interrupted" :
      row.lifecycle_owner === "durable" ? deriveGenerationStatus(row) : row.status,
    provider: row.provider,
    model: row.model,
    capability: row.capability,
    cost: row.cost,
    currency: row.currency,
    billing_unit: row.billing_unit,
    quantity: row.quantity,
    unit_price: row.unit_price,
    price_source: typeof source === "string" ? source : null,
    started_at: row.started_at,
    completed_at: row.completed_at,
    generation_error: row.error,
    submission_error: errorField("submission_error"),
    provider_error: errorField("provider_error"),
    output_error: errorField("output_error"),
    attachment_error: errorField("attachment_error"),
    submission_status: row.submission_status,
    provider_status: row.provider_status,
    output_status: row.output_status,
    attachment_status: row.attachment_status,
    cancellation_requested: row.cancel_requested_at !== null,
    can_cancel: row.cancel_requested_at === null && (row.lifecycle_owner === "durable"
      ? ["pending", "accepted", "submitting", "submitted", "submission_unknown", "recovering", "running"].includes(row.status)
      : row.status === "running")
  };
}

async function requireGeneration(userId: string, id: string, projectId?: string): Promise<Prediction> {
  const resolved = await Prediction.resolveForUser(userId, id, projectId);
  if (resolved.ambiguous) {
    throw new TRPCError({ code: "CONFLICT", message: "Generation ID is ambiguous. Use the full ID." });
  }
  if (!resolved.row) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Generation not found" });
  }
  return resolved.row;
}

export const generationsRouter = router({
  get: protectedProcedure
    .input(z.object({ id: z.string().min(1), project_id: z.string().min(1).optional() }))
    .output(generationRecord)
    .query(async ({ ctx, input }) => {
      const row = await requireGeneration(ctx.userId, input.id, input.project_id);
      return toRecord(row);
    }),
  list: protectedProcedure
    .input(z.object({
      project_id: z.string().min(1).optional(),
      limit: z.number().int().min(1).max(500).default(100),
      start_key: z.string().min(1).max(1024).optional()
    }))
    .output(z.object({ generations: z.array(generationRecord), next: z.string().nullable() }))
    .query(async ({ ctx, input }) => {
      try {
        const [rows, next] = await Prediction.listGenerations(ctx.userId, {
          projectId: input.project_id,
          limit: input.limit,
          startKey: input.start_key
        });
        return { generations: rows.map(toRecord), next: next || null };
      } catch (error) {
        if (error instanceof RangeError) {
          throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
        }
        throw error;
      }
    }),
  cancel: protectedProcedure
    .input(z.object({ id: z.string().min(1), project_id: z.string().min(1).optional() }))
    .output(z.object({
      id: z.string(),
      outcome: z.enum(["aborted", "closed", "cancellation_requested", "not_running"])
    }))
    .mutation(async ({ ctx, input }) => {
      const row = await requireGeneration(ctx.userId, input.id, input.project_id);
      const outcome = await cancelGenerationForUser(row.id, ctx.userId);
      return { id: row.id, outcome: outcome.status };
    })
});
