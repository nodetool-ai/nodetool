import { beforeAll, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import { initTestDb } from "@nodetool-ai/models";
import type { ImplementedSdkV1HttpOperationId } from "@nodetool-ai/protocol/api-schemas/sdk-v1-operations.js";
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

describe("SDK v1 Fastify shadow parity", () => {
  beforeAll(() => {
    initTestDb();
  });

  it("matches every production route under a reverse-proxy subpath", async () => {
    const registry = makeGoldenRegistry();
    const apiOptions = makeGoldenApiOptions(registry);
    const app = Fastify({ logger: false });
    app.addHook("onRequest", async (request) => {
      const userId = request.headers["x-user-id"];
      request.userId = typeof userId === "string" ? userId : null;
    });
    await app.register(sdkV1Routes, { apiOptions });
    await app.register(sdkV1Routes, {
      apiOptions,
      routePrefix: "/__sdk-v1-shadow"
    });
    await app.ready();

    try {
      const compare = async (operationId: string, probe: Probe) => {
        const production = await app.inject({
          method: probe.method,
          url: probe.path,
          headers: probe.headers,
          payload: probe.payload
        });
        const shadow = await app.inject({
          method: probe.method,
          url: `/__sdk-v1-shadow${probe.path}`,
          headers: probe.headers,
          payload: probe.payload
        });

        expect(shadow.statusCode, operationId).toBe(production.statusCode);
        const stableHeaders = (headers: typeof shadow.headers) =>
          Object.fromEntries(
            Object.entries(headers).filter(
              ([name]) => !["connection", "date", "keep-alive"].includes(name)
            )
          );
        expect(stableHeaders(shadow.headers), operationId).toEqual(
          stableHeaders(production.headers)
        );
        expect(shadow.body, operationId).toBe(production.body);
      };

      for (const [operationId, probe] of Object.entries(PROBES)) {
        await compare(operationId, probe);
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
});
