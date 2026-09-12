/**
 * The provider-side generation record: the base contract, and the two
 * providers that implement it.
 *
 * Every fetch here is a fake — these check the mapping from each provider's
 * wire payload onto the one `ProviderGeneration` shape, which is where a
 * caller's reading of a status or a cost comes from.
 */

import { describe, it, expect, vi } from "vitest";
import { AtlasCloudProvider } from "../../src/providers/atlascloud-provider.js";
import { FalProvider } from "../../src/providers/fal-provider.js";
import { FakeProvider } from "../../src/providers/fake-provider.js";
import {
  providerCapabilities,
  BaseProvider
} from "../../src/providers/base-provider.js";
import {
  falGetGeneration,
  falListGenerations,
  falRequestStatus
} from "../../src/providers/fal-generations.js";
import { isProviderGenerationsUnsupported } from "../../src/providers/provider-generations.js";

/** A fetch that answers each URL from a table, and records what was asked. */
function fakeFetch(
  routes: { match: string; status?: number; body: unknown }[],
  calls: string[] = []
): typeof fetch {
  const impl = async (input: RequestInfo | URL): Promise<Response> => {
    const url = String(input);
    calls.push(url);
    const route = routes.find((r) => url.includes(r.match));
    if (!route) throw new Error(`unexpected fetch: ${url}`);
    const status = route.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => route.body,
      text: async () => JSON.stringify(route.body)
    } as Response;
  };
  // SAFETY: the tests only use the (input, init) call form of fetch.
  return impl as unknown as typeof fetch;
}

describe("BaseProvider generation history", () => {
  it("answers unsupported for a provider with no history API", async () => {
    const provider = new FakeProvider();
    await expect(provider.listGenerations()).rejects.toSatisfy(
      isProviderGenerationsUnsupported
    );
    await expect(provider.getGeneration("req-1")).rejects.toSatisfy(
      isProviderGenerationsUnsupported
    );
    expect(providerCapabilities(provider)).not.toContain("list_generations");
    expect(providerCapabilities(provider)).not.toContain("get_generation");
  });

  it("advertises the capability only for the overrides a provider has", () => {
    const fal = new FalProvider({ FAL_API_KEY: "k" });
    expect(providerCapabilities(fal)).toContain("list_generations");
    expect(providerCapabilities(fal)).toContain("get_generation");

    const atlas = new AtlasCloudProvider({ ATLASCLOUD_API_KEY: "k" });
    // AtlasCloud publishes a prediction lookup and no listing endpoint.
    expect(providerCapabilities(atlas)).toContain("get_generation");
    expect(providerCapabilities(atlas)).not.toContain("list_generations");
    expect(atlas.listGenerations).toBe(BaseProvider.prototype.listGenerations);
  });
});

describe("FAL generation history", () => {
  const billingEvent = {
    request_id: "req-1",
    endpoint_id: "fal-ai/flux/dev",
    timestamp: "2026-09-01T10:00:00Z",
    output_units: 2,
    unit_price: 0.025,
    cost_total: 0.05,
    cost_estimate_nano_usd: 50_000_000
  };

  it("lists account-wide from the billing feed, and says what it cannot tell", async () => {
    const calls: string[] = [];
    const page = await falListGenerations(
      "key",
      { limit: 10 },
      {
        fetchFn: fakeFetch(
          [
            {
              match: "billing-events",
              body: { billing_events: [billingEvent], next_cursor: "c2" }
            }
          ],
          calls
        )
      }
    );
    expect(page.generations).toEqual([
      {
        provider: "fal_ai",
        request_id: "req-1",
        model: "fal-ai/flux/dev",
        status: "unknown",
        created_at: "2026-09-01T10:00:00Z",
        completed_at: null,
        duration_seconds: null,
        cost: 0.05,
        currency: "USD",
        quantity: 2,
        unit_price: 0.025,
        output_urls: [],
        error: null
      }
    ]);
    expect(page.next_cursor).toBe("c2");
    expect(page.note).toContain("billing feed");
    expect(calls[0]).toContain("limit=10");
  });

  it("reads status, timings and outputs when a model is given, with cost merged", async () => {
    const calls: string[] = [];
    const page = await falListGenerations(
      "key",
      { model: "fal-ai/flux/dev", status: "completed", since: "2026-09-01" },
      {
        fetchFn: fakeFetch(
          [
            {
              match: "requests/by-endpoint",
              body: {
                items: [
                  {
                    request_id: "req-1",
                    endpoint_id: "fal-ai/flux/dev",
                    started_at: "2026-09-01T10:00:00Z",
                    ended_at: "2026-09-01T10:00:07Z",
                    status_code: 200,
                    duration: 7.5,
                    json_output: { images: [{ url: "https://cdn/1.png" }] }
                  }
                ],
                next_cursor: null
              }
            },
            {
              match: "billing-events",
              body: { billing_events: [billingEvent] }
            }
          ],
          calls
        )
      }
    );
    const [row] = page.generations;
    expect(row?.status).toBe("completed");
    expect(row?.duration_seconds).toBe(7.5);
    expect(row?.output_urls).toEqual(["https://cdn/1.png"]);
    expect(row?.cost).toBe(0.05);
    expect(page.note).toBeNull();
    // FAL's own filters are sent rather than applied here.
    expect(calls[0]).toContain("status=success");
    expect(calls[0]).toContain("endpoint_id=fal-ai%2Fflux%2Fdev");
    expect(calls[0]).toContain("start=2026-09-01");
  });

  it("lists without costs, and says so, when the key cannot read billing", async () => {
    const page = await falListGenerations(
      "key",
      { model: "fal-ai/flux/dev" },
      {
        fetchFn: fakeFetch([
          {
            match: "requests/by-endpoint",
            body: {
              items: [
                { request_id: "req-1", status_code: 200, ended_at: "2026-09-01T10:00:07Z" }
              ]
            }
          },
          { match: "billing-events", status: 403, body: {} }
        ])
      }
    );
    expect(page.generations[0]?.cost).toBeNull();
    expect(page.note).toContain("admin-scoped");
  });

  it("refuses a key the platform API rejects", async () => {
    await expect(
      falListGenerations(
        "key",
        {},
        { fetchFn: fakeFetch([{ match: "billing-events", status: 401, body: {} }]) }
      )
    ).rejects.toThrow(/admin-scoped/);
  });

  it("finds one request by id, taking the endpoint from its billing event", async () => {
    const calls: string[] = [];
    const row = await falGetGeneration(
      "key",
      "req-1",
      {},
      {
        fetchFn: fakeFetch(
          [
            { match: "billing-events", body: { billing_events: [billingEvent] } },
            {
              match: "requests/by-endpoint",
              body: {
                items: [
                  {
                    request_id: "req-1",
                    endpoint_id: "fal-ai/flux/dev",
                    status_code: 422,
                    ended_at: "2026-09-01T10:00:02Z"
                  }
                ]
              }
            }
          ],
          calls
        )
      }
    );
    expect(row?.status).toBe("failed");
    expect(row?.cost).toBe(0.05);
    expect(calls[1]).toContain("endpoint_id=fal-ai%2Fflux%2Fdev");
    expect(calls[1]).toContain("request_id=req-1");
  });

  it("answers null for a request FAL knows nothing about", async () => {
    const row = await falGetGeneration(
      "key",
      "req-missing",
      {},
      { fetchFn: fakeFetch([{ match: "billing-events", body: { billing_events: [] } }]) }
    );
    expect(row).toBeNull();
  });

  it("reads a request with no status code yet as running", () => {
    expect(falRequestStatus({ request_id: "r" })).toBe("running");
    expect(falRequestStatus({ request_id: "r", ended_at: "x" })).toBe("unknown");
    expect(falRequestStatus({ request_id: "r", status_code: 200 })).toBe(
      "completed"
    );
  });

  it("reaches FAL through the provider, with the provider's own key", async () => {
    const fetchFn = vi.fn(
      fakeFetch([{ match: "billing-events", body: { billing_events: [billingEvent] } }])
    );
    const provider = new FalProvider({ FAL_API_KEY: "secret" }, { fetchFn });
    const page = await provider.listGenerations({ limit: 1 });
    expect(page.generations[0]?.request_id).toBe("req-1");
    const init = fetchFn.mock.calls[0]?.[1];
    expect(init?.headers).toEqual({ Authorization: "Key secret" });
  });
});

describe("AtlasCloud generation history", () => {
  const atlas = (fetchFn: typeof fetch): AtlasCloudProvider =>
    new AtlasCloudProvider({ ATLASCLOUD_API_KEY: "key" }, { fetchFn });

  it("maps a finished prediction onto the shared shape", async () => {
    const provider = atlas(
      fakeFetch([
        {
          match: "/model/prediction/pred-1",
          body: {
            data: {
              status: "completed",
              outputs: [{ url: "https://cdn/out.mp4" }]
            }
          }
        }
      ])
    );
    const row = await provider.getGeneration("pred-1", { model: "kling/v2" });
    expect(row).toEqual({
      provider: "atlascloud",
      request_id: "pred-1",
      model: "kling/v2",
      status: "completed",
      created_at: null,
      completed_at: null,
      duration_seconds: null,
      // AtlasCloud's prediction carries no charge; the local row holds the price.
      cost: null,
      currency: null,
      quantity: null,
      unit_price: null,
      output_urls: ["https://cdn/out.mp4"],
      error: null
    });
  });

  it("reports a running prediction and a failed one as themselves", async () => {
    const running = await atlas(
      fakeFetch([{ match: "/model/prediction/", body: { data: { status: "processing" } } }])
    ).getGeneration("pred-2");
    expect(running?.status).toBe("running");

    const failed = await atlas(
      fakeFetch([
        {
          match: "/model/prediction/",
          status: 200,
          body: { data: { status: "failed", error: "content policy" } }
        }
      ])
    ).getGeneration("pred-3");
    expect(failed?.status).toBe("failed");
    expect(failed?.error).toBe("content policy");
  });

  it("answers null for a prediction id AtlasCloud does not know", async () => {
    const row = await atlas(
      fakeFetch([{ match: "/model/prediction/", status: 404, body: {} }])
    ).getGeneration("pred-gone");
    expect(row).toBeNull();
  });

  it("has no listing to offer", async () => {
    await expect(
      atlas(fakeFetch([])).listGenerations()
    ).rejects.toSatisfy(isProviderGenerationsUnsupported);
  });
});
