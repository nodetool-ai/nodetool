/**
 * A terminal ffmpeg failure on an effect node must throw an error carrying
 * ffmpeg's stderr — never silently pass the unchanged input through (a no-op
 * effect indistinguishable from a real one).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

function ffmpegFailure(): Error & { code: number; stderr: string } {
  const e = new Error("ffmpeg exited with code 1") as Error & {
    code: number;
    stderr: string;
  };
  e.code = 1;
  e.stderr = "Error reinitializing filters! Invalid argument";
  return e;
}

vi.mock("node:child_process", async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>;
  const mockExecFile = (_cmd: string, _args: string[]) => undefined;
  (mockExecFile as { [k: symbol]: unknown })[
    Symbol.for("nodejs.util.promisify.custom")
  ] = () => Promise.reject(ffmpegFailure());
  return { ...original, execFile: mockExecFile };
});

const { DenoiseVideoNode, SetSpeedVideoNode } = await import(
  "@nodetool-ai/video-nodes"
);

function videoRef(bytes: number[]) {
  return {
    type: "video",
    uri: "",
    data: Buffer.from(new Uint8Array(bytes)).toString("base64")
  };
}

beforeEach(() => {});

describe("effect nodes throw on terminal ffmpeg failure", () => {
  it("DenoiseVideoNode rejects and includes ffmpeg stderr", async () => {
    const node = new DenoiseVideoNode();
    node.assign({ video: videoRef([1, 2, 3, 4]), strength: 5 });
    await expect(node.process()).rejects.toThrow(/reinitializing filters/);
  });

  it("SetSpeedVideoNode throws when even the video-only fallback fails", async () => {
    // The audio+video attempt is allowed to fall back; the video-only attempt is
    // terminal and must surface the failure, not return the input unchanged.
    const node = new SetSpeedVideoNode();
    node.assign({ video: videoRef([1, 2, 3, 4]), speed_factor: 2 });
    await expect(node.process()).rejects.toThrow(/ffmpeg failed/);
  });
});
