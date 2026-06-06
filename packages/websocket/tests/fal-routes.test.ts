/**
 * Integration tests for the FAL credits and pricing routes.
 *
 * Runs an in-process Fastify instance with only the two routes registered,
 * mocks `@nodetool-ai/models` Secret lookups, and stubs `globalThis.fetch`
 * to simulate fal.ai responses. No DB or network required.
 *
 * Run with:
 *   npm run test --workspace=packages/websocket -- fal-routes
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";

vi.mock("@nodetool-ai/models", async (orig) => {
  const actual = await orig<typeof import("@nodetool-ai/models")>();
  return {
    ...actual,
    Secret: {
      find: vi.fn(),
    },
  };
});

import { Secret } from "@nodetool-ai/models";
import falCreditsRoute from "../src/routes/fal-credits.js";
import falPricingRoute from "../src/routes/fal-pricing.js";
import falPricingEstimateRoute from "../src/routes/fal-pricing-estimate.js";

type MockSecret = { getDecryptedValue: () => Promise<string> };
const secretFind = Secret.find as unknown as ReturnType<typeof vi.fn>;

function mockSecret(apiKey: string | null): void {
  if (apiKey === null) {
    secretFind.mockResolvedValue(null);
    return;
  }
  const stub: MockSecret = {
    getDecryptedValue: vi.fn().mockResolvedValue(apiKey),
  };
  secretFind.mockResolvedValue(stub);
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

let prevFalKey: string | undefined;

beforeEach(() => {
  prevFalKey = process.env.FAL_API_KEY;
  delete process.env.FAL_API_KEY;
  secretFind.mockReset();
  // Silence the route's console.* during tests.
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  if (prevFalKey === undefined) {
    delete process.env.FAL_API_KEY;
  } else {
    process.env.FAL_API_KEY = prevFalKey;
  }
  vi.restoreAllMocks();
});

describe("GET /api/fal/credits", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify({ logger: false });
    await app.register(falCreditsRoute);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns 204 when no FAL_API_KEY is configured", async () => {
    mockSecret(null);
    const res = await app.inject({ method: "GET", url: "/api/fal/credits" });
    expect(res.statusCode).toBe(204);
  });

  it("normalizes fal.ai billing response into credit_balance", async () => {
    mockSecret("fal-key-123");
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        jsonResponse({
          username: "ada",
          credits: { current_balance: 12.345, currency: "USD" },
        })
      );

    const res = await app.inject({ method: "GET", url: "/api/fal/credits" });

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("fal.ai/v1/account/billing");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Key fal-key-123"
    );

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toEqual({
      credit_balance: { amount: 12.345, currency: "USD" },
      username: "ada",
    });
  });

  it("returns unavailable:true with admin-key hint when fal.ai responds 403", async () => {
    mockSecret("fal-key-403");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("Forbidden", { status: 403 })
    );

    const res = await app.inject({ method: "GET", url: "/api/fal/credits" });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.unavailable).toBe(true);
    expect(body.credit_balance).toBeNull();
    expect(String(body.detail)).toMatch(/admin api key/i);
  });

  it("returns unavailable:true on network error", async () => {
    mockSecret("fal-key-net");
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));

    const res = await app.inject({ method: "GET", url: "/api/fal/credits" });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.unavailable).toBe(true);
    expect(body.credit_balance).toBeNull();
    expect(String(body.detail)).toMatch(/could not reach fal/i);
  });

  it("falls back to FAL_API_KEY env when no secret exists", async () => {
    mockSecret(null);
    process.env.FAL_API_KEY = "env-key-xyz";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        credits: { current_balance: 0, currency: "USD" },
      })
    );

    const res = await app.inject({ method: "GET", url: "/api/fal/credits" });

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Key env-key-xyz"
    );
    expect(res.statusCode).toBe(200);
  });
});

describe("GET /api/fal/pricing", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify({ logger: false });
    await app.register(falPricingRoute);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns 400 when endpoint_id is missing", async () => {
    mockSecret("fal-key");
    const res = await app.inject({ method: "GET", url: "/api/fal/pricing" });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.detail).toMatch(/endpoint_id/i);
  });

  it("returns 204 when no FAL_API_KEY is configured", async () => {
    mockSecret(null);
    const res = await app.inject({
      method: "GET",
      url: "/api/fal/pricing?endpoint_id=fal-ai%2Fflux%2Fdev",
    });
    expect(res.statusCode).toBe(204);
  });

  it("returns byEndpointId map for requested endpoints", async () => {
    mockSecret("fal-key-ok");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        prices: [
          {
            endpoint_id: "fal-ai/flux/dev",
            unit_price: 0.025,
            unit: "image",
            currency: "USD",
          },
          {
            endpoint_id: "fal-ai/whisper",
            unit_price: 0.005,
            unit: "second",
            currency: "USD",
          },
        ],
      })
    );

    const res = await app.inject({
      method: "GET",
      url: "/api/fal/pricing?endpoint_id=fal-ai%2Fflux%2Fdev&endpoint_id=fal-ai%2Fwhisper",
    });

    const callUrl = fetchSpy.mock.calls[0]?.[0] as string;
    expect(callUrl).toContain("fal.ai/v1/models/pricing");
    expect(callUrl).toContain("endpoint_id=fal-ai%2Fflux%2Fdev");
    expect(callUrl).toContain("endpoint_id=fal-ai%2Fwhisper");

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.byEndpointId["fal-ai/flux/dev"]).toEqual({
      unit_price: 0.025,
      billing_unit: "image",
      currency: "USD",
    });
    expect(body.byEndpointId["fal-ai/whisper"]).toEqual({
      unit_price: 0.005,
      billing_unit: "second",
      currency: "USD",
    });
    expect(typeof body.fetched_at).toBe("string");
  });

  it("returns 502 on fetch failure", async () => {
    mockSecret("fal-key-net");
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));

    // Use a unique endpoint to bypass the module-level cache populated by
    // earlier successful pricing tests in this file.
    const res = await app.inject({
      method: "GET",
      url: "/api/fal/pricing?endpoint_id=fal-ai%2Funique-network-fail",
    });
    expect(res.statusCode).toBe(502);
  });

  it("dedupes repeated endpoint_id query params", async () => {
    mockSecret("fal-key-dedupe");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        prices: [
          {
            endpoint_id: "fal-ai/x",
            unit_price: 0.01,
            unit: "image",
            currency: "USD",
          },
        ],
      })
    );

    await app.inject({
      method: "GET",
      url: "/api/fal/pricing?endpoint_id=fal-ai%2Fx&endpoint_id=fal-ai%2Fx",
    });

    const callUrl = fetchSpy.mock.calls[0]?.[0] as string;
    const matches = callUrl.match(/endpoint_id=/g) ?? [];
    expect(matches.length).toBe(1);
  });
});

describe("POST /api/fal/pricing/estimate", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify({ logger: false });
    await app.register(falPricingEstimateRoute);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns 400 when endpoint_id is missing", async () => {
    mockSecret("fal-key");
    const res = await app.inject({
      method: "POST",
      url: "/api/fal/pricing/estimate",
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.detail).toMatch(/endpoint_id/i);
  });

  it("returns 204 when no FAL_API_KEY is configured", async () => {
    mockSecret(null);
    const res = await app.inject({
      method: "POST",
      url: "/api/fal/pricing/estimate",
      payload: { endpoint_id: "fal-ai/flux/dev" },
    });
    expect(res.statusCode).toBe(204);
  });

  it("returns historical per-run estimate for an endpoint", async () => {
    mockSecret("fal-key-est");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        estimate_type: "historical_api_price",
        total_cost: 0.042,
        currency: "USD",
      }),
    );

    const res = await app.inject({
      method: "POST",
      url: "/api/fal/pricing/estimate",
      payload: {
        endpoint_id: "fal-ai/flux/dev",
        estimate_type: "historical_api_price",
        call_quantity: 1,
      },
    });

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect((init.method ?? "GET").toUpperCase()).toBe("POST");
    const sent = JSON.parse(String(init.body)) as {
      estimate_type: string;
      endpoints: Record<string, { call_quantity: number }>;
    };
    expect(sent.estimate_type).toBe("historical_api_price");
    expect(sent.endpoints["fal-ai/flux/dev"].call_quantity).toBe(1);

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.total_cost).toBe(0.042);
    expect(body.currency).toBe("USD");
    expect(body.endpoint_id).toBe("fal-ai/flux/dev");
    expect(typeof body.fetched_at).toBe("string");
  });

  it("returns 502 when fal.ai estimate fails", async () => {
    mockSecret("fal-key-fail");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("Bad request", { status: 400 }),
    );

    const res = await app.inject({
      method: "POST",
      url: "/api/fal/pricing/estimate",
      payload: { endpoint_id: "fal-ai/unknown-model" },
    });
    expect(res.statusCode).toBe(502);
  });
});
