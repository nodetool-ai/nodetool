import { z } from "zod";
import { applicationDocument } from "./applications.js";
import { graph } from "./workflows.js";
import { jsScriptDocument } from "./js-scripts.js";

export const appRunOrigin = z.enum(["ui", "agent", "cli", "debug", "public"]);
export const appRunStatus = z.enum([
  "running",
  "completed",
  "failed",
  "cancelled"
]);
export const appRunSnapshot = z.object({
  document: applicationDocument,
  workflow_graphs: z.record(z.string(), graph).default({}),
  script_documents: z.record(z.string(), jsScriptDocument).default({})
});
export type AppRunSnapshot = z.infer<typeof appRunSnapshot>;
export const appInstanceResponse = z.object({
  id: z.string(),
  user_id: z.string(),
  application_id: z.string().nullable(),
  source_id: z.string(),
  name: z.string(),
  version: z.number().int().nullable(),
  snapshot: appRunSnapshot,
  variables: z.record(z.string(), z.unknown()),
  revision: z.number().int(),
  is_default: z.number().int(),
  created_at: z.string(),
  updated_at: z.string()
});
export type AppInstanceRecord = z.infer<typeof appInstanceResponse>;
export const appRunResponse = z.object({
  id: z.string(),
  user_id: z.string(),
  application_id: z.string().nullable(),
  instance_id: z.string(),
  invocation_id: z.string(),
  operation_id: z.string(),
  version: z.number().int().nullable(),
  origin: appRunOrigin,
  status: appRunStatus,
  snapshot: appRunSnapshot.nullable(),
  inputs: z.record(z.string(), z.unknown()).nullable(),
  outputs: z.record(z.string(), z.unknown()).nullable(),
  documents: z.array(z.object({ kind: z.string(), id: z.string() })).nullable(),
  instance_revision: z.number().int(),
  trace_id: z.string(),
  root_span_id: z.string().nullable(),
  execution_started_at: z.string().nullable(),
  known_llm_usd: z.number().nullable(),
  error: z.string().nullable(),
  estimated_usd: z.number(),
  actual_usd: z.number().nullable(),
  state_conflict: z.number().int(),
  content_expired: z.number().int(),
  created_at: z.string(),
  settled_at: z.string().nullable()
});
export type AppRunRecord = z.infer<typeof appRunResponse>;
export const createInstanceInput = z.object({
  application_id: z.string().nullable().optional(),
  source_id: z.string().min(1),
  name: z.string().min(1).max(200).optional(),
  version: z.number().int().nullable().optional(),
  snapshot: appRunSnapshot,
  variables: z.record(z.string(), z.unknown()).optional()
});
export const getInstanceInput = z.object({ id: z.string().min(1) });
export const updateInstanceInput = getInstanceInput.extend({
  expected_revision: z.number().int().min(0),
  name: z.string().min(1).max(200).optional(),
  variables: z.record(z.string(), z.unknown()).optional()
});
export const duplicateInstanceInput = getInstanceInput.extend({
  name: z.string().min(1).max(200).optional()
});
export const listInstancesInput = z.object({
  application_id: z.string().optional(),
  source_id: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(50)
});
export const getRunInput = getInstanceInput;
export const listRunsInput = z.object({
  instance_id: z.string(),
  limit: z.number().int().min(1).max(100).default(50)
});
export const reserveRunInput = z.object({
  instance_id: z.string(),
  operation_id: z.string(),
  invocation_id: z.string().min(1)
});
