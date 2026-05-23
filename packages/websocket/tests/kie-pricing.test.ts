/**
 * Integration tests for the KIE pricing route.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import kiePricingRoute from "../src/routes/kie-pricing.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/kie/pricing", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify({ logger: false });
    await app.register(kiePricingRoute);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns 400 when model_id is missing", async () => {
    const res = await app.inject({ method: "GET", url: "/api/kie/pricing" });
    expect(res.statusCode).toBe(400);
  });

  it("returns byModelId for requested model ids", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      jsonResponse({
        code: 200,
        data: {
          records: [
            {
              modelDescription: "seedream 4.5 t2i",
              interfaceType: "image",
              provider: "ByteDance",
              creditPrice: "6.5",
              creditUnit: "per image",
              usdPrice: "0.0325",
              falPrice: "",
              discountRate: 0,
              anchor:
                "https://kie.ai/seedream-4-5?model=seedream%2F4.5-text-to-image",
              discountPrice: false,
            },
          ],
          pages: 1,
        },
      }),
    );

    const res = await app.inject({
      method: "GET",
      url: "/api/kie/pricing?model_id=seedream%2F4.5-text-to-image",
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.byModelId["seedream/4.5-text-to-image"]).toMatchObject({
      model_id: "seedream/4.5-text-to-image",
      unit_price: 6.5,
      billing_unit: "image",
      currency: "credits",
    });
    expect(typeof body.fetched_at).toBe("string");
  });
});
