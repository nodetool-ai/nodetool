import { z } from "zod";
import {
  appInstanceResponse,
  appInstanceMetadataResponse,
  listInstanceMetadataResponse,
  appRunResponse
} from "@nodetool-ai/protocol/api-schemas/app-runs.js";
import { restFetch } from "../../../lib/rest-fetch";

const instanceSchema = appInstanceResponse;

export type ServerAppInstance = z.infer<typeof instanceSchema>;

const metadataSchema = appInstanceMetadataResponse;
const metadataListSchema = listInstanceMetadataResponse;
export type ServerAppInstanceMetadata = z.infer<typeof metadataSchema>;
export type AppInstanceMetadataPage = z.infer<typeof metadataListSchema>;
export interface AppInstanceListOptions {
  application_id?: string;
  source_id?: string;
  limit?: number;
  cursor?: string;
}

export async function listAppInstanceMetadata(
  options: AppInstanceListOptions,
  signal?: AbortSignal
): Promise<AppInstanceMetadataPage> {
  const query = new URLSearchParams();
  if (options.application_id) {
    query.set("application_id", options.application_id);
  }
  if (options.source_id) {
    query.set("source_id", options.source_id);
  }
  if (options.cursor) {
    query.set("cursor", options.cursor);
  }
  query.set("limit", String(options.limit ?? 50));
  return metadataListSchema.parse(
    await request(
      `/api/app-instances/metadata?${query}`,
      "GET",
      undefined,
      signal
    )
  );
}

export async function createAppInstance(
  body: unknown
): Promise<ServerAppInstance> {
  return instanceSchema.parse(
    await request("/api/app-instances", "POST", body)
  );
}

export async function renameAppInstance(
  id: string,
  revision: number,
  name: string
): Promise<ServerAppInstance> {
  return instanceSchema.parse(
    await request(`/api/app-instances/${encodeURIComponent(id)}`, "PATCH", {
      expected_revision: revision,
      name
    })
  );
}

export async function duplicateAppInstance(
  id: string,
  name?: string
): Promise<ServerAppInstance> {
  return instanceSchema.parse(
    await request(
      `/api/app-instances/${encodeURIComponent(id)}/duplicate`,
      "POST",
      name === undefined ? {} : { name }
    )
  );
}

export async function deleteAppInstance(id: string): Promise<void> {
  const result = z
    .object({ ok: z.boolean() })
    .parse(
      await request(`/api/app-instances/${encodeURIComponent(id)}`, "DELETE")
    );
  if (!result.ok) {
    throw new Error("App instance no longer exists.");
  }
}

export async function advanceAppInstance(
  id: string,
  revision: number,
  version: number
): Promise<ServerAppInstance> {
  return instanceSchema.parse(
    await request(
      `/api/app-instances/${encodeURIComponent(id)}/advance`,
      "POST",
      { expected_revision: revision, version }
    )
  );
}

async function request(
  path: string,
  method: string,
  body?: unknown,
  signal?: AbortSignal
): Promise<unknown> {
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.headers = { "content-type": "application/json" };
    init.body = JSON.stringify(body);
  }
  if (signal) {
    init.signal = signal;
  }
  const response = await restFetch(path, init);
  const data: unknown = await response.json();
  if (!response.ok) {
    const detail = z
      .object({ detail: z.string().optional(), error: z.string().optional() })
      .safeParse(data);
    throw new Error(
      response.status === 409
        ? "This instance changed in another session. Reload the app before saving or running again."
        : detail.success
          ? (detail.data.detail ??
            detail.data.error ??
            `App request failed (${response.status}).`)
          : `App request failed (${response.status}).`
    );
  }
  return data;
}

export const loadAppInstance = async (
  id: string,
  signal?: AbortSignal
): Promise<ServerAppInstance> =>
  instanceSchema.parse(
    await request(
      `/api/app-instances/${encodeURIComponent(id)}`,
      "GET",
      undefined,
      signal
    )
  );

export const defaultAppInstance = async (
  body: unknown
): Promise<ServerAppInstance> =>
  instanceSchema.parse(
    await request("/api/app-instances/default", "POST", body)
  );

export const saveAppInstance = async (
  id: string,
  revision: number,
  variables: Record<string, unknown>
): Promise<ServerAppInstance> =>
  instanceSchema.parse(
    await request(`/api/app-instances/${encodeURIComponent(id)}`, "PATCH", {
      expected_revision: revision,
      variables
    })
  );

export const reserveAppRun = async (
  id: string,
  operationId: string,
  invocationId: string
): Promise<{ id: string; trace_id: string }> =>
  z
    .object({ id: z.string(), trace_id: z.string().regex(/^[0-9a-f]{32}$/) })
    .parse(
      await request(
        `/api/app-instances/${encodeURIComponent(id)}/runs`,
        "POST",
        { operation_id: operationId, invocation_id: invocationId }
      )
    );

export const updateAppRun = async (
  id: string,
  body: unknown
): Promise<void> => {
  await request(`/api/app-runs/${encodeURIComponent(id)}`, "PATCH", body);
};

export const startBrowserAppRun = async (
  id: string,
  traceparent: string
): Promise<{ root_span_id: string }> =>
  z
    .object({ root_span_id: z.string().regex(/^[0-9a-f]{16}$/) })
    .parse(
      await request(
        `/api/runs/${encodeURIComponent(id)}/browser-start`,
        "POST",
        { traceparent }
      )
    );

export const getAppRun = async (
  id: string
): Promise<{
  status: "running" | "completed" | "failed" | "cancelled";
  state_conflict: number;
  error: string | null;
}> =>
  appRunResponse
    .pick({ status: true, state_conflict: true, error: true })
    .parse(await request(`/api/app-runs/${encodeURIComponent(id)}`, "GET"));
