/**
 * Phase 0 inventory pin for the SDK v1 HTTP surface
 * (docs/sdk/sdk-trpc-consolidation.md § Phase 0).
 *
 * Two dispatchers serve overlapping subsets of the 11 implemented SDK v1
 * operations, and that asymmetry is the recorded drift risk:
 *
 *   1. The Fastify route plugins (routes/nodes.ts, routes/workflows.ts,
 *      routes/assets.ts, registered in server.ts) mount all 11 — the
 *      authoritative production surface.
 *   2. `handleApiRequest` in http-api.ts dispatches only 6 of them
 *      (node-types, capabilities, preflight, workflows, workflow-interfaces,
 *      workflows/:id/interface); the model catalog, model downloads, and
 *      temporary upload fall through to its 404.
 *
 * A change to either dispatcher's coverage must fail here and be reflected
 * deliberately in this inventory and the baseline record.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import { initTestDb } from "@nodetool-ai/models";
import { handleApiRequest } from "../src/http-api.js";
import nodesRoutes from "../src/routes/nodes.js";
import workflowsRoutes from "../src/routes/workflows.js";
import assetsRoutes from "../src/routes/assets.js";
import {
  GOLDEN_BASE_ENV,
  GOLDEN_PREFLIGHT_REQUEST,
  GOLDEN_USER,
  MISSING_WORKFLOW_ID,
  WORKFLOW_ONE_ID,
  makeGoldenApiOptions,
  makeGoldenRegistry,
  seedGoldenWorkflows
} from "./sdk-v1-golden-harness.js";

/** The 11 implemented SDK v1 HTTP registrations (method + Fastify url). */
const EXPECTED_SDK_V1_ROUTES = [
  "GET /api/sdk/v1/capabilities",
  "GET /api/sdk/v1/model-downloads",
  "GET /api/sdk/v1/models",
  "GET /api/sdk/v1/node-types",
  "GET /api/sdk/v1/workflows",
  "GET /api/workflows/:id/interface",
  "POST /api/sdk/v1/assets/temporary",
  "POST /api/sdk/v1/model-downloads",
  "POST /api/sdk/v1/model-downloads/cancel",
  "POST /api/sdk/v1/preflight",
  "POST /api/sdk/v1/workflow-interfaces"
] as const;

function isSdkV1Url(url: string): boolean {
  return (
    url.startsWith("/api/sdk/v1/") || url === "/api/workflows/:id/interface"
  );
}

describe("SDK v1 route inventory", () => {
  const apiOptions = makeGoldenApiOptions(makeGoldenRegistry());

  beforeAll(async () => {
    for (const [key, value] of Object.entries(GOLDEN_BASE_ENV)) {
      vi.stubEnv(key, value);
    }
    initTestDb();
    await seedGoldenWorkflows();
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  it("registers exactly the 11 implemented operations on the Fastify plugins", async () => {
    const registrations: string[] = [];
    const app = Fastify({ logger: false });
    app.addHook("onRoute", (route) => {
      const methods = Array.isArray(route.method)
        ? route.method
        : [route.method];
      for (const method of methods) {
        // Fastify auto-registers HEAD next to every GET (exposeHeadRoutes);
        // only explicit registrations are inventory.
        if (method === "HEAD") continue;
        registrations.push(`${method} ${route.url}`);
      }
    });
    const routeOpts = { apiOptions };
    await app.register(assetsRoutes, routeOpts);
    await app.register(workflowsRoutes, routeOpts);
    await app.register(nodesRoutes, routeOpts);
    await app.ready();
    await app.close();

    const sdkRoutes = registrations.filter((registration) =>
      isSdkV1Url(registration.split(" ")[1])
    );
    expect(sdkRoutes.sort()).toEqual([...EXPECTED_SDK_V1_ROUTES]);
  });

  interface DispatcherProbe {
    name: string;
    request: () => Request;
    /** For covered probes: the status that proves the handler ran. */
    status?: number;
  }

  const jsonRequest = (path: string, body: unknown): Request =>
    new Request(`http://localhost${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-user-id": GOLDEN_USER
      },
      body: JSON.stringify(body)
    });

  const getRequest = (path: string): Request =>
    new Request(`http://localhost${path}`, {
      headers: { "x-user-id": GOLDEN_USER }
    });

  // The six operations `handleApiRequest` covers, each proven by a
  // handler-shaped response …
  const COVERED: DispatcherProbe[] = [
    {
      name: "GET /api/sdk/v1/node-types",
      request: () => getRequest("/api/sdk/v1/node-types?limit=1"),
      status: 200
    },
    {
      name: "GET /api/sdk/v1/capabilities",
      request: () => getRequest("/api/sdk/v1/capabilities"),
      status: 200
    },
    {
      name: "POST /api/sdk/v1/preflight",
      request: () =>
        jsonRequest("/api/sdk/v1/preflight", GOLDEN_PREFLIGHT_REQUEST),
      status: 200
    },
    {
      name: "GET /api/sdk/v1/workflows",
      request: () => getRequest("/api/sdk/v1/workflows?limit=10"),
      status: 200
    },
    {
      name: "POST /api/sdk/v1/workflow-interfaces",
      request: () =>
        jsonRequest("/api/sdk/v1/workflow-interfaces", {
          ids: [WORKFLOW_ONE_ID],
          version: 1
        }),
      status: 200
    },
    {
      // SDK-shaped WORKFLOW_NOT_FOUND, not the dispatcher's fall-through 404.
      name: "GET /api/workflows/:id/interface",
      request: () =>
        getRequest(`/api/workflows/${MISSING_WORKFLOW_ID}/interface?version=1`),
      status: 404
    }
  ];

  // … and the five it does NOT cover, proven by its literal fall-through
  // body even though every backing service is injected and enabled.
  const UNCOVERED: DispatcherProbe[] = [
    {
      name: "GET /api/sdk/v1/models",
      request: () => getRequest("/api/sdk/v1/models")
    },
    {
      name: "GET /api/sdk/v1/model-downloads",
      request: () => getRequest("/api/sdk/v1/model-downloads")
    },
    {
      name: "POST /api/sdk/v1/model-downloads",
      request: () =>
        jsonRequest("/api/sdk/v1/model-downloads", {
          repo_id: "sdk-golden/model",
          model_type: "hf.text_generation"
        })
    },
    {
      name: "POST /api/sdk/v1/model-downloads/cancel",
      request: () =>
        jsonRequest("/api/sdk/v1/model-downloads/cancel", {
          operation_id: "mdl_sdk_golden"
        })
    },
    {
      name: "POST /api/sdk/v1/assets/temporary",
      request: () => jsonRequest("/api/sdk/v1/assets/temporary", {})
    }
  ];

  it("http-api.ts second dispatcher covers exactly its recorded 6-route subset", async () => {
    for (const probe of COVERED) {
      const response = await handleApiRequest(probe.request(), apiOptions);
      const body = (await response.json()) as Record<string, unknown>;
      expect(response.status, probe.name).toBe(probe.status);
      // Never the dispatcher's own fall-through.
      expect(body, probe.name).not.toEqual({ detail: "Not found" });
      if (probe.name.endsWith("/interface")) {
        expect(body.code, probe.name).toBe("WORKFLOW_NOT_FOUND");
      }
    }

    for (const probe of UNCOVERED) {
      const response = await handleApiRequest(probe.request(), apiOptions);
      expect(response.status, probe.name).toBe(404);
      expect(await response.json(), probe.name).toEqual({
        detail: "Not found"
      });
    }
  });
});
