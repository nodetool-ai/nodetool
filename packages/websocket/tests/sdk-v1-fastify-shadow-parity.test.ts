import { beforeAll, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import { initTestDb } from "@nodetool-ai/models";
import type { ImplementedSdkV1HttpOperationId } from "@nodetool-ai/protocol/api-schemas/sdk-v1-operations.js";
import { handleApiRequest } from "../src/http-api.js";
import sdkV1Routes from "../src/routes/sdk-v1.js";
import {
  GOLDEN_USER,
  makeGoldenApiOptions,
  makeGoldenRegistry
} from "./sdk-v1-golden-harness.js";

interface Probe {
  readonly method: "GET" | "POST";
  readonly path: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly payload?: string;
}

const JSON_HEADERS = {
  "content-type": "application/json",
  "x-user-id": GOLDEN_USER
};

const PROBES = {
  getNodeTypeInventory: {
    method: "GET",
    path: "/api/sdk/v1/node-types?cursor=0&limit=1"
  },
  getCapabilities: { method: "GET", path: "/api/sdk/v1/capabilities" },
  listModels: {
    method: "GET",
    path: "/api/sdk/v1/models?limit=1&cursor=a%2Fb"
  },
  listModelDownloads: {
    method: "GET",
    path: "/api/sdk/v1/model-downloads"
  },
  startModelDownload: {
    method: "POST",
    path: "/api/sdk/v1/model-downloads",
    headers: JSON_HEADERS,
    payload: "{}"
  },
  cancelModelDownload: {
    method: "POST",
    path: "/api/sdk/v1/model-downloads/cancel",
    headers: JSON_HEADERS,
    payload: "{}"
  },
  preflightWorkflow: {
    method: "POST",
    path: "/api/sdk/v1/preflight",
    headers: JSON_HEADERS,
    payload: "{}"
  },
  listWorkflowSummaries: {
    method: "GET",
    path: "/api/sdk/v1/workflows?limit=1"
  },
  getWorkflowInterfaces: {
    method: "POST",
    path: "/api/sdk/v1/workflow-interfaces",
    headers: JSON_HEADERS,
    payload: "{}"
  },
  getWorkflowInterface: {
    method: "GET",
    path: "/api/workflows/missing%20workflow/interface?version=1&value=a%2Fb"
  },
  uploadTemporaryAsset: {
    method: "POST",
    path: "/api/sdk/v1/assets/temporary",
    headers: { "x-user-id": GOLDEN_USER },
    payload: ""
  }
} satisfies Readonly<Record<ImplementedSdkV1HttpOperationId, Probe>>;

const COMPATIBILITY_OPERATION_IDS = [
  "getNodeTypeInventory",
  "getCapabilities",
  "preflightWorkflow",
  "listWorkflowSummaries",
  "getWorkflowInterfaces",
  "getWorkflowInterface"
] as const satisfies readonly ImplementedSdkV1HttpOperationId[];

describe("SDK v1 Fastify and direct-dispatcher parity", () => {
  beforeAll(() => {
    initTestDb();
  });

  it("matches every route retained by the public direct dispatcher", async () => {
    const registry = makeGoldenRegistry();
    const apiOptions = makeGoldenApiOptions(registry);
    const app = Fastify({ logger: false });
    app.addHook("onRequest", async (request) => {
      const userId = request.headers["x-user-id"];
      request.userId = typeof userId === "string" ? userId : null;
    });
    await app.register(sdkV1Routes, { apiOptions });
    await app.ready();

    try {
      const compare = async (operationId: string, probe: Probe) => {
        const production = await app.inject({
          method: probe.method,
          url: probe.path,
          headers: probe.headers,
          payload: probe.payload
        });
        const direct = await handleApiRequest(
          new Request(`http://localhost${probe.path}`, {
            method: probe.method,
            headers: probe.headers,
            body: probe.method === "POST" ? probe.payload : undefined
          }),
          apiOptions
        );

        expect(production.statusCode, operationId).toBe(direct.status);
        expect(production.headers["content-type"], operationId).toBe(
          direct.headers.get("content-type") ?? undefined
        );
        expect(production.body, operationId).toBe(await direct.text());
      };

      for (const operationId of COMPATIBILITY_OPERATION_IDS) {
        await compare(operationId, PROBES[operationId]);
      }

      await compare("preflight authentication failure", {
        method: "POST",
        path: "/api/sdk/v1/preflight",
        headers: { "content-type": "application/json" },
        payload: JSON.stringify({ workflow_id: "workflow-1" })
      });

      vi.stubEnv("NODETOOL_DISABLE_SDK_LIFECYCLE_V1", "1");
      try {
        await compare("capabilities feature disabled", {
          method: "GET",
          path: "/api/sdk/v1/capabilities"
        });
      } finally {
        vi.unstubAllEnvs();
      }
    } finally {
      vi.unstubAllEnvs();
      await app.close();
    }
  });

  it("forwards authenticated identity through a custom configured header", async () => {
    const registry = makeGoldenRegistry();
    const apiOptions = {
      ...makeGoldenApiOptions(registry),
      userIdHeader: "x-tenant-id"
    };
    const app = Fastify({ logger: false });
    app.addHook("onRequest", async (request) => {
      request.userId = GOLDEN_USER;
    });
    await app.register(sdkV1Routes, { apiOptions });
    await app.ready();

    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/sdk/v1/preflight",
        headers: { "content-type": "application/json" },
        payload: JSON.stringify({ workflow_id: "workflow-1" })
      });

      expect(response.statusCode).not.toBe(401);
    } finally {
      await app.close();
    }
  });
});
