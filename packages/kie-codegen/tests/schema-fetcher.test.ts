import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KieSchemaFetcher } from "../src/schema-fetcher.js";

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
