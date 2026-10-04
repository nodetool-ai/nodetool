import { z } from "zod";
import {
  appInstanceResponse,
  appRunResponse
} from "@nodetool-ai/protocol/api-schemas/app-runs.js";
import { restFetch } from "../../../lib/rest-fetch";

const instanceSchema = appInstanceResponse.pick({
  id: true,
  user_id: true,
  revision: true,
  variables: true,
  snapshot: true
});

export type ServerAppInstance = z.infer<typeof instanceSchema>;

async function request(
  path: string,
  method: string,
  body?: unknown
): Promise<unknown> {
  const init: RequestInit = {
    method,
    headers: { "content-type": "application/json" }
  };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
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

export const loadAppInstance = async (id: string): Promise<ServerAppInstance> =>
  instanceSchema.parse(
    await request(`/api/app-instances/${encodeURIComponent(id)}`, "GET")
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
): Promise<string> =>
  z
    .object({ id: z.string() })
    .parse(
      await request(
        `/api/app-instances/${encodeURIComponent(id)}/runs`,
        "POST",
        { operation_id: operationId, invocation_id: invocationId }
      )
    ).id;

export const updateAppRun = async (
  id: string,
  body: unknown
): Promise<void> => {
  await request(`/api/app-runs/${encodeURIComponent(id)}`, "PATCH", body);
};

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
