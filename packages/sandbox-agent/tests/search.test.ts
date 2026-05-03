import { describe, it, expect, afterEach } from "vitest";
import { infoSearchWeb, setSearchOverride } from "../src/tools/search.js";

afterEach(() => {
  setSearchOverride(null);
});

function mockFetch(
  responder: (url: string, init?: RequestInit) => Response
): typeof fetch {
  return ((input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(responder(String(input), init))) as typeof fetch;
}

describe("infoSearchWeb", () => {
  it("normalizes tavily results into SearchResult shape", async () => {
    setSearchOverride({
      provider: "tavily",
      fetch: mockFetch(() =>
        new Response(
          JSON.stringify({
            results: [
              {
                title: "T1",
                url: "https://u1",
                content: "snippet 1",
                published_date: "2025-10-01"
              }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
    });
    process.env.TAVILY_API_KEY = "xxx";
    const out = await infoSearchWeb({ query: "q" });
    expect(out.provider).toBe("tavily");
    expect(out.results).toHaveLength(1);
    expect(out.results[0]).toMatchObject({
      title: "T1",
      url: "https://u1",
      snippet: "snippet 1",
      published_at: "2025-10-01"
    });
  });

  it("maps brave results", async () => {
    setSearchOverride({
      provider: "brave",
      fetch: mockFetch((url) => {
        expect(url).toContain("search.brave.com");
        return new Response(
          JSON.stringify({
            web: {
              results: [
                {
                  title: "B1",
                  url: "https://b1",
                  description: "b-snippet",
                  page_age: "2025-11-01"
                }
              ]
            }
          }),
          { status: 200 }
        );
      })
    });
    process.env.BRAVE_API_KEY = "yyy";
    const out = await infoSearchWeb({ query: "q", count: 5 });
    expect(out.results[0].url).toBe("https://b1");
  });

  it("uses an injected provider function when supplied", async () => {
    setSearchOverride({
      provider: "tavily",
      providers: {
        tavily: async (q, opts) => [
          {
            title: q.toUpperCase(),
            url: `https://x/${opts.count}`,
            snippet: opts.dateRange,
            published_at: null
          }
        ]
      }
    });
    const out = await infoSearchWeb({
      query: "hi",
      count: 3,
      date_range: "past_day"
    });
    expect(out.results[0]).toMatchObject({
      title: "HI",
      url: "https://x/3",
      snippet: "past_day"
    });
  });

  it("returns empty results for the mock provider", async () => {
    setSearchOverride({ provider: "mock" });
    const out = await infoSearchWeb({ query: "q" });
    expect(out.results).toEqual([]);
    expect(out.provider).toBe("mock");
  });

  it("throws when tavily key is missing", async () => {
    delete process.env.TAVILY_API_KEY;
    setSearchOverride({ provider: "tavily" });
    await expect(infoSearchWeb({ query: "q" })).rejects.toThrow(
      /TAVILY_API_KEY/
    );
  });
});
