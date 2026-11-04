import { z } from "zod";
import { createLogger } from "@nodetool-ai/config";
import { jobRunRegistry } from "../../job-run-registry.js";
import { Job, Workflow } from "@nodetool-ai/models";
import { TRPCError, router } from "../index.js";
import { protectedProcedure } from "../middleware.js";
import type { Context } from "../context.js";
import {
  executeTorch,
  outputTensorsSchema,
  tensorsSchema,
  torchCatalog,
  torchInstalled,
  torchTargets
} from "../../lib/torch-workflow.js";

const log = createLogger("nodetool.websocket.torch");

function localEnabled(ctx: Context): boolean {
  return (
    process.env["NODETOOL_TORCH_LOCAL"] === "1" &&
    process.env["NODETOOL_ENV"] !== "production" &&
    ["127.0.0.1", "::1", "localhost"].includes(process.env["HOST"] ?? "") &&
    ctx.torchLocalPeer === true
  );
}
function requireLocal(ctx: Context): void {
  if (!localEnabled(ctx)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        "Torch compilation requires a trusted local server with HOST=127.0.0.1 and NODETOOL_TORCH_LOCAL=1"
    });
  }
}
const activeUsers = new Set<string>();
const statusOutput = z.object({
  job_id: z.string(),
  status: z.enum([
    "scheduled",
    "queued",
    "running",
    "completed",
    "failed",
    "cancelled"
  ]),
  stage: z.string(),
  error: z.string().nullable(),
  outputs: outputTensorsSchema.nullable(),
  manifest: z.record(z.string(), z.unknown()).nullable()
});
export const torchRouter = router({
  capabilities: protectedProcedure
    .output(
      z.object({
        enabled: z.boolean(),
        reason: z.string().nullable(),
        targets: z.array(z.enum(["cpu", "cuda"]))
      })
    )
    .query(async ({ ctx }) => {
      const installed = await torchInstalled();
      const targets = installed ? await torchTargets().catch(() => []) : [];
      const enabled = localEnabled(ctx) && installed && targets.length > 0;
      return {
        enabled,
        reason: enabled
          ? null
          : !localEnabled(ctx)
            ? "Enable Torch on a trusted local server with HOST=127.0.0.1 and NODETOOL_TORCH_LOCAL=1"
            : "Install the pinned Torch Python environment and build the C++ workflow runtime",
        targets
      };
    }),
  catalog: protectedProcedure.query(async () => torchCatalog()),
  start: protectedProcedure
    .input(
      z.object({
        workflow_id: z.string().min(1),
        target: z.enum(["cpu", "cuda"]),
        action: z.enum(["compile", "run"]),
        inputs: tensorsSchema.optional(),
        expected_updated_at: z.string().optional()
      })
    )
    .output(z.object({ job_id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      requireLocal(ctx);
      const workflow = await Workflow.findForEdit(
        ctx.userId,
        input.workflow_id
      );
      if (!workflow) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Workflow not found"
        });
      }
      if (
        input.expected_updated_at !== undefined &&
        input.expected_updated_at !== workflow.updated_at
      ) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Workflow changed after saving. Save again before compiling."
        });
      }
      const settings = z
        .object({
          execution: z.object({
            kind: z.literal("torch"),
            version: z.literal(1)
          })
        })
        .passthrough()
        .safeParse(workflow.settings);
      const graph = z
        .object({
          nodes: z.array(z.unknown()).max(256),
          edges: z.array(z.unknown()).max(1024)
        })
        .safeParse(workflow.graph);
      if (!settings.success || !graph.success) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "A saved Torch workflow is required"
        });
      }
      if (JSON.stringify(graph.data).length > 8_000_000) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Torch graph exceeds the local compiler limit"
        });
      }
      if (activeUsers.has(ctx.userId)) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "A Torch job is already running"
        });
      }
      const job = new Job({
        user_id: ctx.userId,
        workflow_id: workflow.id,
        project_id: workflow.project_id,
        job_type: "torch",
        name: workflow.name,
        graph: graph.data,
        params: { target: input.target, action: input.action },
        metadata_json: { stage: "Queued" }
      });
      activeUsers.add(ctx.userId);
      try {
        await job.save();
      } catch (error) {
        activeUsers.delete(ctx.userId);
        throw error;
      }
      const userId = ctx.userId;
      const controller = new AbortController();
      const openSession = () =>
        jobRunRegistry.open(userId, job.id, workflow.id, {
          cancel: () => controller.abort(),
          pushInput: async () => {
            throw new Error("Torch inputs are fixed for this invocation");
          },
          finishInputStream: () => {},
          updateNodeProperties: () => false
        });
      let session: ReturnType<typeof openSession>;
      try {
        session = openSession();
      } catch (error) {
        activeUsers.delete(userId);
        throw error;
      }
      const stage = async (value: string): Promise<void> => {
        job.metadata_json = { ...job.metadata_json, stage: value };
        await job.save();
      };
      void (async () => {
        try {
          job.markRunning();
          await job.save();
          const result = await executeTorch(
            { ...graph.data, settings: { execution: settings.data.execution } },
            input.target,
            input.action,
            input.inputs ?? {},
            stage,
            controller.signal
          );
          controller.signal.throwIfAborted();
          job.metadata_json = { stage: "Completed", ...result };
          job.markCompleted();
          await job.save();
        } catch (error) {
          job.status = controller.signal.aborted ? "cancelled" : "failed";
          job.error_message =
            error instanceof Error ? error.message : "Torch job failed";
          job.error = job.error_message;
          job.finished_at = new Date().toISOString();
          job.metadata_json = { stage: "Failed" };
          await job.save();
        } finally {
          activeUsers.delete(userId);
          session.finish(job.status);
        }
      })().catch((error: unknown) => {
        log.error("Could not persist Torch job outcome", {
          jobId: job.id,
          error: error instanceof Error ? error.message : String(error)
        });
      });
      return { job_id: job.id };
    }),
  status: protectedProcedure
    .input(z.object({ job_id: z.string().min(1) }))
    .output(statusOutput)
    .query(async ({ ctx, input }) => {
      requireLocal(ctx);
      const job = await Job.find(ctx.userId, input.job_id);
      if (!job || job.user_id !== ctx.userId || job.job_type !== "torch") {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Torch job not found"
        });
      }
      const metadata = job.metadata_json ?? {};
      return {
        job_id: job.id,
        status: job.status,
        stage:
          typeof metadata["stage"] === "string"
            ? metadata["stage"]
            : job.status,
        error: job.error_message,
        outputs:
          metadata["outputs"] == null
            ? null
            : outputTensorsSchema.parse(metadata["outputs"]),
        manifest:
          metadata["manifest"] == null
            ? null
            : z.record(z.string(), z.unknown()).parse(metadata["manifest"])
      };
    })
});
