import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KieSchemaFetcher, legacySunoDocUrl } from "../src/schema-fetcher.js";

const MARKDOWN = "# Model\n\n```yaml\nopenapi: 3.0.1\n```\n";
const SHELL = '<!DOCTYPE html><html id="html"><body></body></html>';

function response(body: string): Response {
  return new Response(body, { status: 200 });
}

describe("KieSchemaFetcher.fetchDocsPage", () => {
  let cacheDir: string;

  beforeEach(async () => {
    cacheDir = await mkdtemp(join(tmpdir(), "kie-codegen-"));
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(async () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    await rm(cacheDir, { recursive: true, force: true });
  });

  it("retries when docs.kie.ai serves the HTML shell instead of Markdown", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response(SHELL))
      .mockResolvedValueOnce(response(MARKDOWN));
    vi.stubGlobal("fetch", fetchMock);

    const fetcher = new KieSchemaFetcher(cacheDir);
    const text = await fetcher.fetchDocsPage("https://docs.kie.ai/a.md", false);

    expect(text).toBe(MARKDOWN);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws rather than caching a shell response", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => response(SHELL));
    vi.stubGlobal("fetch", fetchMock);

    const fetcher = new KieSchemaFetcher(cacheDir);
    await expect(
      fetcher.fetchDocsPage("https://docs.kie.ai/b.md", false)
    ).rejects.toThrow(/HTML shell/);
    await expect(readFile(join(cacheDir, "b.md"), "utf8")).rejects.toThrow();
  });
});

describe("legacySunoDocUrl", () => {
  it("returns the Markdown URL of the old Suno page a new page links", () => {
    const markdown =
      "Old version address\n(https://docs.kie.ai/old-model/suno-api/generate-music)";
    expect(legacySunoDocUrl(markdown)).toBe(
      "https://docs.kie.ai/old-model/suno-api/generate-music.md"
    );
  });

  it("ignores old-version links outside the Suno API", () => {
    const markdown =
      "[https://docs.kie.ai/old-model/4o-image-api/generate-4-o-image](https://docs.kie.ai/old-model/4o-image-api/generate-4-o-image)";
    expect(legacySunoDocUrl(markdown)).toBeNull();
  });
});
