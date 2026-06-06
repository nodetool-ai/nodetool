/**
 * Integration tests for the KIE credits route.
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
import kieCreditsRoute from "../src/routes/kie-credits.js";

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

let prevKieKey: string | undefined;

beforeEach(() => {
  prevKieKey = process.env.KIE_API_KEY;
  delete process.env.KIE_API_KEY;
  secretFind.mockReset();
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  if (prevKieKey === undefined) {
    delete process.env.KIE_API_KEY;
  } else {
    process.env.KIE_API_KEY = prevKieKey;
  }
  vi.restoreAllMocks();
});

describe("GET /api/kie/credits", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify({ logger: false });
    await app.register(kieCreditsRoute);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns 204 when no KIE_API_KEY is configured", async () => {
    mockSecret(null);
    const res = await app.inject({ method: "GET", url: "/api/kie/credits" });
    expect(res.statusCode).toBe(204);
  });

  it("normalizes kie.ai credit response into credit_balance", async () => {
    mockSecret("kie-key-123");
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse({ code: 200, msg: "success", data: 250 }));

    const res = await app.inject({ method: "GET", url: "/api/kie/credits" });

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("api.kie.ai/api/v1/chat/credit");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer kie-key-123",
    );

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toEqual({
      credit_balance: { amount: 250, currency: "credits" },
    });
  });

  it("returns unavailable when kie.ai body code is not 200", async () => {
    mockSecret("kie-key-bad");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ code: 401, msg: "Unauthorized", data: null }),
    );

    const res = await app.inject({ method: "GET", url: "/api/kie/credits" });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.unavailable).toBe(true);
    expect(body.credit_balance).toBeNull();
    expect(String(body.detail)).toMatch(/unauthorized/i);
  });

  it("returns unavailable on network error", async () => {
    mockSecret("kie-key-net");
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));

    const res = await app.inject({ method: "GET", url: "/api/kie/credits" });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.unavailable).toBe(true);
    expect(body.credit_balance).toBeNull();
    expect(String(body.detail)).toMatch(/could not reach kie/i);
  });

  it("falls back to KIE_API_KEY env when no secret exists", async () => {
    mockSecret(null);
    process.env.KIE_API_KEY = "env-kie-key";
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse({ code: 200, msg: "success", data: 80 }));

    const res = await app.inject({ method: "GET", url: "/api/kie/credits" });

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer env-kie-key",
    );
    expect(res.statusCode).toBe(200);
  });
});
