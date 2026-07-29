/**
 * AddSubtitles must not let ordinary punctuation in subtitle text break the
 * ffmpeg -vf filtergraph. It writes each chunk's text to a temp file and points
 * drawtext at it with `textfile=`, so commas/semicolons/quotes never reach the
 * filter string.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { promises as fs } from "node:fs";

let execFileCalls: Array<{ cmd: string; args: string[] }> = [];

vi.mock("node:child_process", async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>;
  const mockExecFile = (cmd: string, args: string[]) => {
    execFileCalls.push({ cmd, args: [...args] });
  };
  (mockExecFile as { [k: symbol]: unknown })[
    Symbol.for("nodejs.util.promisify.custom")
  ] = (cmd: string, args: string[]) => {
    execFileCalls.push({ cmd, args: [...args] });
    // ffmpeg "fails" so no real output file is read; args are captured above.
    return Promise.reject(new Error("mock ffmpeg: no real execution"));
  };
  return { ...original, execFile: mockExecFile };
});

const { AddSubtitlesVideoNode } = await import("@nodetool-ai/video-nodes");

function videoRef(bytes: number[]) {
  return {
    type: "video",
    uri: "",
    data: Buffer.from(new Uint8Array(bytes)).toString("base64")
  };
}

/** The -vf argument passed to the (single) ffmpeg invocation. */
function vfArg(): string {
  const call = execFileCalls.find((c) => c.cmd === "ffmpeg");
  if (!call) return "";
  const i = call.args.indexOf("-vf");
  return i >= 0 ? call.args[i + 1] : "";
}

beforeEach(() => {
  execFileCalls = [];
});

describe("AddSubtitlesVideoNode — punctuation-safe drawtext", () => {
  it("routes text through textfile= and keeps punctuation out of the filter", async () => {
    const writeSpy = vi.spyOn(fs, "writeFile");
    try {
      const node = new AddSubtitlesVideoNode();
      node.assign({
        video: videoRef([1, 2, 3, 4]),
        chunks: [
          { text: "Hello, world; [take 1] 100% 'quoted'", timestamp: [0, 2] }
        ]
      });
      await node.process().catch(() => undefined);

      const vf = vfArg();
      // Uses a textfile, not an inline text='...'.
      expect(vf).toContain("textfile=");
      expect(vf).toContain("expansion=none");
      expect(vf).not.toContain("text='Hello");
      // The punctuation that would break the filtergraph never appears in it.
      expect(vf).not.toContain("Hello, world");
      // Exactly one drawtext filter for one chunk.
      expect((vf.match(/drawtext=/g) || []).length).toBe(1);

      // The literal subtitle text (with its punctuation) was written to a file.
      const wrote = writeSpy.mock.calls.some(
        (c) =>
          String(c[0]).includes("sub_") &&
          c[1] === "Hello, world; [take 1] 100% 'quoted'"
      );
      expect(wrote).toBe(true);
    } finally {
      writeSpy.mockRestore();
    }
  });

  it("emits one drawtext per non-empty chunk", async () => {
    const node = new AddSubtitlesVideoNode();
    node.assign({
      video: videoRef([1, 2, 3, 4]),
      chunks: [
        { text: "first, line", timestamp: [0, 1] },
        { text: "second; line", timestamp: [1, 2] },
        { text: "   ", timestamp: [2, 3] } // blank → skipped
      ]
    });
    await node.process().catch(() => undefined);

    const vf = vfArg();
    expect((vf.match(/drawtext=/g) || []).length).toBe(2);
  });

  it("sanitizes the font name so it cannot break the filter", async () => {
    const node = new AddSubtitlesVideoNode();
    node.assign({
      video: videoRef([1, 2, 3, 4]),
      font: { type: "font", name: "Ev;il,Font]" },
      chunks: [{ text: "hi", timestamp: [0, 1] }]
    });
    await node.process().catch(() => undefined);

    const vf = vfArg();
    expect(vf).toContain("font='EvilFont'");
  });
});
