import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { Command } from "commander";
import {
  registerTimelineRenderCommand,
  runTimelineRender
} from "../timeline-render.js";

const incompleteRenderer: typeof import("@nodetool-ai/video-nodes/nodes/timeline/compositeRender").renderTimelineComposited =
  async ({ outPath, writeFrame }) => {
    if (writeFrame) {
      await writeFrame(0, new Uint8Array(16 * 16 * 4));
    } else {
      await writeFile(outPath, "retained incomplete artifact");
    }
    return {
      totalFrames: 1,
      skippedClips: ["missing-clip"],
      fontsUnavailable: [],
      complete: false,
      diagnostics: [
        {
          clipId: "missing-clip",
          startMs: 0,
          endMs: 1000,
          reason: "missing_asset",
          detail: "No current asset is available."
        }
      ]
    };
  };

describe("timeline export completeness", () => {
  it("preserves missing-content diagnostics in preview results", async () => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), "timeline-completeness-")
    );
    try {
      const input = path.join(directory, "timeline.json");
      await writeFile(
        input,
        JSON.stringify({
          name: "Missing content",
          width: 16,
          height: 16,
          fps: 30,
          durationMs: 1000,
          document: { tracks: [], clips: [], markers: [] }
        })
      );
      const diagnostics = [
        {
          clipId: "missing-clip",
          startMs: 0,
          endMs: 1000,
          reason: "missing_asset" as const,
          detail: "No current asset is available."
        }
      ];
      const result = await runTimelineRender(
        input,
        { out: path.join(directory, "stills"), stills: true, frames: "0" },
        async () => null,
        async () => ({
          totalFrames: 1,
          skippedClips: ["missing-clip"],
          fontsUnavailable: [],
          complete: false,
          diagnostics
        })
      );
      expect(result).toMatchObject({
        complete: false,
        diagnostics,
        skippedClips: ["missing-clip"]
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
  it.each([
    { stills: false, exitCode: 1 },
    { stills: true, exitCode: 0 }
  ])(
    "reports incomplete content with stills=$stills and exit=$exitCode",
    async ({ stills, exitCode }) => {
      const directory = await mkdtemp(
        path.join(os.tmpdir(), "timeline-completeness-command-")
      );
      const exit = vi
        .spyOn(process, "exit")
        .mockImplementation(() => undefined as never);
      const log = vi.spyOn(console, "log").mockImplementation(() => {});
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        const input = path.join(directory, "timeline.json");
        await writeFile(
          input,
          JSON.stringify({
            name: "Missing content",
            width: 16,
            height: 16,
            fps: 30,
            durationMs: 1000,
            document: { tracks: [], clips: [], markers: [] }
          })
        );
        const command = new Command();
        registerTimelineRenderCommand(
          command,
          async () => async () => null,
          incompleteRenderer
        );
        await command.parseAsync(
          [
            "render",
            input,
            "--out",
            path.join(directory, stills ? "stills" : "frames.zip"),
            "--format",
            "png_sequence",
            "--frames",
            "0",
            "--json",
            ...(stills ? ["--stills"] : [])
          ],
          { from: "user" }
        );
        expect(exit).toHaveBeenCalledExactlyOnceWith(exitCode);
        expect(JSON.parse(String(log.mock.calls[0][0]))).toMatchObject({
          complete: false,
          diagnostics: [{ clipId: "missing-clip", reason: "missing_asset" }]
        });
      } finally {
        exit.mockRestore();
        log.mockRestore();
        error.mockRestore();
        await rm(directory, { recursive: true, force: true });
      }
    }
  );
});
