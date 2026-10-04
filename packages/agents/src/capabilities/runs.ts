import { runListOptionsSchema } from "@nodetool-ai/protocol";
import { userIdOf } from "../tools/mcp-tool-support.js";
import { compactResourceIds } from "../codeact/compact-ids.js";
import type { CapabilityExport, CapabilityModule } from "./types.js";
import {
  listRunsSpec, getRunSpec, getRunTraceSpec, getRunLogsSpec, awaitRunSpec,
  getRunInputSchema, getRunTraceInputSchema, getRunLogsInputSchema, awaitRunInputSchema
} from "./runs.specs.js";

export const listRuns: CapabilityExport = {
  spec: listRunsSpec,
  impl: async (run, params) => {
    const service = await import("@nodetool-ai/execution");
    return compactResourceIds(await service.listRuns(userIdOf(run.context), runListOptionsSchema.parse(params)));
  }
};
export const getRun: CapabilityExport = {
  spec: getRunSpec,
  impl: async (run, params) => {
    const service = await import("@nodetool-ai/execution");
    const { run_id, ...options } = getRunInputSchema.parse(params);
    return compactResourceIds(await service.getRun(userIdOf(run.context), run_id, options));
  }
};
export const getRunTrace: CapabilityExport = {
  spec: getRunTraceSpec,
  impl: async (run, params) => {
    const service = await import("@nodetool-ai/execution");
    const { run_id, ...options } = getRunTraceInputSchema.parse(params);
    return compactResourceIds(await service.getRunTrace(userIdOf(run.context), run_id, options));
  }
};
export const getRunLogs: CapabilityExport = {
  spec: getRunLogsSpec,
  impl: async (run, params) => {
    const service = await import("@nodetool-ai/execution");
    const { run_id, ...options } = getRunLogsInputSchema.parse(params);
    return compactResourceIds(await service.getRunLogs(userIdOf(run.context), run_id, options));
  }
};
export const awaitRun: CapabilityExport = {
  spec: awaitRunSpec,
  impl: async (run, params) => {
    const service = await import("@nodetool-ai/execution");
    const { run_id, ...options } = awaitRunInputSchema.parse(params);
    return compactResourceIds(await service.awaitRun(userIdOf(run.context), run_id, { ...options, signal: run.context.signal }));
  }
};
export const RUN_CAPABILITIES: readonly CapabilityExport[] = [listRuns, getRun, getRunTrace, getRunLogs, awaitRun];
export const module: CapabilityModule = { module: "runs", exports: RUN_CAPABILITIES };
