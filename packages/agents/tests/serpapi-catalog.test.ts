/**
 * The engine catalog — the part of this feature that can silently rot.
 *
 * Everything else here is NodeTool code that fails loudly when it breaks. The
 * catalog is a parse of somebody else's page, so the failure mode worth
 * guarding is the quiet one: a markup change that yields zero engines and reads
 * like "SerpAPI ships nothing" instead of "the parser needs updating". The
 * fixture is a real playground response, trimmed to three engines and otherwise
 * byte-for-byte as SerpAPI served it, so a shape change fails here.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import {
  clearSerpApiCatalogCache,
  htmlToText,
  loadSerpApiCatalog,
  parseSerpApiCatalog
} from "../src/serpapi/catalog.js";
import { SerpApiError } from "../src/serpapi/errors.js";

const FIXTURE = readFileSync(
  fileURLToPath(new URL("./fixtures/serpapi-playground.html", import.meta.url)),
  "utf8"
);

afterEach(() => {
  clearSerpApiCatalogCache();
});

/** A fetch that answers the fixture and counts how often it was asked. */
function fixtureFetch(): { fetch: typeof fetch; calls: () => number } {
  let calls = 0;
  const impl = (async () => {
    calls += 1;
    return new Response(FIXTURE, { status: 200 });
  }) as unknown as typeof fetch;
  return { fetch: impl, calls: () => calls };
}

describe("parsing SerpAPI's own engine table", () => {
  it("reads every engine the page carries", () => {
    const catalog = parseSerpApiCatalog(FIXTURE, 0);
    expect([...catalog.engines.keys()].sort()).toEqual([
      "amazon",
      "google_scholar",
      "youtube"
    ]);
    expect(catalog.engines.get("google_scholar")?.label).toBe(
      "Google Scholar"
    );
    expect(catalog.engines.get("youtube")?.playgroundUrl).toBe(
      "https://serpapi.com/playground?engine=youtube"
    );
  });

  it("reads each parameter's contract, not just its name", () => {
    const scholar = parseSerpApiCatalog(FIXTURE, 0).engines.get(
      "google_scholar"
    );
    const byName = new Map(scholar!.parameters.map((p) => [p.name, p]));

    const q = byName.get("q")!;
    expect(q.required).toBe(true);
    expect(q.label).toBe("Search Query");
    expect(q.group).toBe("search_query");

    // Types and enumerated values come across, which is what makes a call
    // checkable before it is billed.
    expect(byName.get("as_ylo")?.type).toBe("number");
    expect(byName.get("scisbd")?.options?.map((o) => o.value)).toEqual([
      "1",
      "2"
    ]);

    // Nothing else in this engine is required — a wrong `required` flag would
    // either block a valid call or let an invalid one through. SerpAPI's own
    // table also marks `engine` and `api_key` required; both are the host's,
    // so they are not in an engine's caller-facing contract at all.
    expect(byName.has("api_key")).toBe(false);
    expect(byName.has("engine")).toBe(false);
    expect(
      scholar!.parameters.filter((p) => p.required).map((p) => p.name)
    ).toEqual(["q"]);
  });

  it("flattens the documentation markup a model would otherwise read raw", () => {
    const scholar = parseSerpApiCatalog(FIXTURE, 0).engines.get(
      "google_scholar"
    );
    const q = scholar!.parameters.find((p) => p.name === "q")!;
    expect(q.description).not.toMatch(/<[a-z]/i);
    expect(q.description).toContain("author:");
    expect(htmlToText("a<br>b <code>c</code>&amp;d")).toBe("a b c&d");
    // No `<` survives, whichever way it was smuggled in: nested or malformed
    // constructs defeat a single stripping pass, and markup that arrived
    // entity-encoded defeats stripping that runs before decoding.
    for (const smuggled of [
      "<<b>script>alert(1)<</b>/script>",
      "&lt;script&gt;alert(1)&lt;/script&gt;",
      "&#60;script&#62;alert(1)"
    ]) {
      expect(htmlToText(smuggled)).not.toContain("<");
      expect(htmlToText(smuggled)).toContain("alert(1)");
    }
  });

  it("marks the parameters SerpAPI hides rather than dropping them", () => {
    const scholar = parseSerpApiCatalog(FIXTURE, 0).engines.get(
      "google_scholar"
    );
    const hidden = scholar!.parameters.find((p) => p.name === "json_restrictor");
    expect(hidden?.hidden).toBe(true);
    expect(scholar!.parameters.find((p) => p.name === "q")?.hidden).toBe(false);
  });

  it("reads the shared localization option lists", () => {
    const catalog = parseSerpApiCatalog(FIXTURE, 0);
    expect(catalog.languages[0]).toEqual({ value: "af", label: "Afrikaans" });
    expect(catalog.countries[0]).toEqual({ value: "af", label: "Afghanistan" });
    expect(catalog.googleDomains.length).toBeGreaterThan(0);
  });
});

describe("when the page changes shape", () => {
  it("names the parser rather than reporting an empty catalog", () => {
    for (const page of [
      "<html><body>no react root here</body></html>",
      '<div data-react-props="{&quot;parameters&quot;:{}}"></div>',
      '<div data-react-props="not json"></div>'
    ]) {
      let thrown: unknown;
      try {
        parseSerpApiCatalog(page, 0);
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(SerpApiError);
      expect((thrown as SerpApiError).kind).toBe("catalog_unavailable");
      expect((thrown as SerpApiError).message).toMatch(/catalog|props/i);
    }
  });

  it("reports an unreachable page as unavailable, not as an empty list", async () => {
    const failing = (async () =>
      new Response("nope", { status: 503 })) as unknown as typeof fetch;
    await expect(
      loadSerpApiCatalog({ fetchImpl: failing })
    ).rejects.toMatchObject({ kind: "catalog_unavailable" });
  });
});

describe("caching", () => {
  it("downloads the 3 MB page once for a burst of callers", async () => {
    const { fetch: impl, calls } = fixtureFetch();
    const [a, b] = await Promise.all([
      loadSerpApiCatalog({ fetchImpl: impl }),
      loadSerpApiCatalog({ fetchImpl: impl })
    ]);
    expect(calls()).toBe(1);
    expect(a.engines.size).toBe(3);
    expect(b).toBe(a);

    await loadSerpApiCatalog({ fetchImpl: impl });
    expect(calls()).toBe(1);
  });

  it("re-reads once the entry has aged out, and on force", async () => {
    const { fetch: impl, calls } = fixtureFetch();
    let clock = 1_000;
    const now = () => clock;
    await loadSerpApiCatalog({ fetchImpl: impl, now });
    expect(calls()).toBe(1);

    clock += 7 * 60 * 60 * 1000;
    await loadSerpApiCatalog({ fetchImpl: impl, now });
    expect(calls()).toBe(2);

    await loadSerpApiCatalog({ fetchImpl: impl, now, force: true });
    expect(calls()).toBe(3);
  });
});
