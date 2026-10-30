import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { defaultDebugOutDir, writeDebugBundle } from "../src/debug-bundle.js";

let dir: string | undefined;

afterEach(async () => {
  if (dir) {
    await rm(dir, { recursive: true, force: true });
  }
  dir = undefined;
});

describe("debug bundle", () => {
  it("writes the document, report json and markdown", async () => {
    dir = await mkdtemp(join(tmpdir(), "debug-bundle-"));
    const bundleDir = await writeDebugBundle({
      kind: "sketch",
      ref: "abc",
      outDir: dir,
      raw: { a: 1 },
      report: { ok: true },
      reportMarkdown: "# report"
    });
    expect(bundleDir).toBe(dir);
    expect(
      JSON.parse(await readFile(join(dir, "sketch.json"), "utf8"))
    ).toEqual({ a: 1 });
    expect(
      JSON.parse(await readFile(join(dir, "report.json"), "utf8"))
    ).toEqual({ ok: true });
    expect(await readFile(join(dir, "report.md"), "utf8")).toBe("# report");
  });

  it("slugs the ref and falls back to the kind", () => {
    expect(defaultDebugOutDir("timeline", "a/b c")).toMatch(
      /nodetool-debug\/timeline-a-b-c-/
    );
    expect(defaultDebugOutDir("timeline", "///")).toMatch(
      /nodetool-debug\/timeline-timeline-/
    );
  });
});
