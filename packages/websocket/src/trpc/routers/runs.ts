import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { listRuns, getRun, getRunTrace, getRunLogs, awaitRun, readRunUpdates, RunsError } from "@nodetool-ai/execution";
import {
  runReaderIdSchema, runGetOptionsSchema, runListOptionsSchema, runTraceOptionsSchema, runLogsOptionsSchema, runAwaitOptionsSchema, runUpdatesOptionsSchema,
  listRunsResultSchema, getRunResultSchema, getRunTraceResultSchema, getRunLogsResultSchema, runUpdatesResultSchema
} from "@nodetool-ai/protocol/api-schemas/runs.js";
import type { RunListOptions, RunGetOptions, RunTraceOptions, RunLogsOptions, RunAwaitOptions, RunUpdatesOptions, ListRunsResult, GetRunResult, GetRunTraceResult, GetRunLogsResult, RunUpdatesResult } from "@nodetool-ai/protocol";
import { router } from "../index.js";
import { protectedProcedure } from "../middleware.js";

async function runRead<T>(read: () => Promise<T>): Promise<T> {
  try { return await read(); }
  catch (error) {
    if (error instanceof RunsError) {
      throw new TRPCError({ code: error.code === "not_found" ? "NOT_FOUND" : error.code === "timeout" ? "TIMEOUT" : error.code === "aborted" ? "CLIENT_CLOSED_REQUEST" : "BAD_REQUEST", message: error.message, cause: error });
    }
    throw error;
  }
}
type ReaderInput<T> = { id: string } & T;
const listInput: z.ZodType<RunListOptions, RunListOptions> = runListOptionsSchema;
const getInput: z.ZodType<ReaderInput<RunGetOptions>, ReaderInput<RunGetOptions>> = runReaderIdSchema.extend(runGetOptionsSchema.shape);
const traceInput: z.ZodType<ReaderInput<RunTraceOptions>, ReaderInput<RunTraceOptions>> = runReaderIdSchema.extend(runTraceOptionsSchema.shape);
const logsInput: z.ZodType<ReaderInput<RunLogsOptions>, ReaderInput<RunLogsOptions>> = runReaderIdSchema.extend(runLogsOptionsSchema.shape);
const awaitInput: z.ZodType<ReaderInput<RunAwaitOptions>, ReaderInput<RunAwaitOptions>> = runReaderIdSchema.extend(runAwaitOptionsSchema.shape);
const updatesInput: z.ZodType<ReaderInput<RunUpdatesOptions>, ReaderInput<RunUpdatesOptions>> = runReaderIdSchema.extend(runUpdatesOptionsSchema.shape);
const listOutput: z.ZodType<ListRunsResult> = listRunsResultSchema;
const getOutput: z.ZodType<GetRunResult> = getRunResultSchema;
const traceOutput: z.ZodType<GetRunTraceResult> = getRunTraceResultSchema;
const logsOutput: z.ZodType<GetRunLogsResult> = getRunLogsResultSchema;
const updatesOutput: z.ZodType<RunUpdatesResult> = runUpdatesResultSchema;

export const runsRouter = router({
  list: protectedProcedure.input(listInput).output(listOutput).query(({ ctx, input }) => runRead(() => listRuns(ctx.userId, input))),
  get: protectedProcedure.input(getInput).output(getOutput).query(({ ctx, input }) => runRead(() => getRun(ctx.userId, input.id, input))),
  trace: protectedProcedure.input(traceInput).output(traceOutput)
    .query(({ ctx, input }) => runRead(() => getRunTrace(ctx.userId, input.id, input))),
  logs: protectedProcedure.input(logsInput).output(logsOutput)
    .query(({ ctx, input }) => runRead(() => getRunLogs(ctx.userId, input.id, input))),
  await: protectedProcedure.input(awaitInput).output(getOutput)
    .query(({ ctx, input, signal }) => runRead(() => awaitRun(ctx.userId, input.id, { ...input, signal }))),
  updates: protectedProcedure.input(updatesInput).output(updatesOutput)
    .query(({ ctx, input }) => runRead(() => readRunUpdates(ctx.userId, input.id, input)))
});
