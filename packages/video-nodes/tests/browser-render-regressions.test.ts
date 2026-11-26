import { afterEach, describe, expect, it, vi } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { TimelineSequence } from "@nodetool-ai/timeline";

let mockLaunch: () => Promise<unknown>;

vi.mock("@nodetool-ai/config", async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>;
  return {
    ...original,
    importOptionalModule: async (name: string) => {
      if (name === "playwright") {
        return {
          chromium: {
            launch: () => mockLaunch()
          }
        };
      }
      return (original.importOptionalModule as (n: string) => Promise<unknown>)(name);
    }
  };
});

vi.mock("../src/nodes/timeline/renderPage.js", () => ({
  loadTimelineRenderPage: async () => "window.__noop = true;"
}));

const { renderTimelineInBrowser } = await import("../src/nodes/timeline/browserRender.js");
const { resolveTimelineOutput } = await import("../src/nodes/timeline/outputFormats.js");

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

const MINIMAL_SEQUENCE = {
  id: "seq-browser-reg",
  name: "Browser regression",
  width: 32,
  height: 32,
  fps: 10,
  durationMs: 100,
  tracks: [],
  clips: []
} as TimelineSequence;

describe("browserRender regressions", () => {
  it("closes a Chromium instance that finishes launching after the render is aborted", async () => {
    const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "nodetool-browser-abort-"));
    dirs.push(workDir);

    const close = vi.fn(async () => undefined);
    let resolveLaunch!: (browser: unknown) => void;
    mockLaunch = () =>
      new Promise((resolve) => {
        resolveLaunch = resolve;
      });

    const controller = new AbortController();
    const renderPromise = renderTimelineInBrowser({
      sequence: MINIMAL_SEQUENCE,
      width: 32,
      height: 32,
      fps: 10,
      durationMs: 100,
      output: resolveTimelineOutput({ format: "mp4" }),
      bitrate: 0,
      resolveAssetPath: async () => null,
      outPath: path.join(workDir, "out.mp4"),
      workDir,
      signal: controller.signal
    });

    // Wait a tick so launchBrowser() is in flight, then abort before it resolves.
    await new Promise((resolve) => setTimeout(resolve, 20));
    controller.abort();

    await expect(renderPromise).rejects.toMatchObject({ name: "AbortError" });

    // Now the in-flight browser launch finishes. It must be closed, not leaked.
    resolveLaunch({ close });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(close).toHaveBeenCalledTimes(1);
  });
});
