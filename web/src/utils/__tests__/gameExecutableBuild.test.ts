import { TextDecoder as NodeTextDecoder, TextEncoder as NodeTextEncoder } from "util";

import { restFetch } from "../../lib/rest-fetch";
import { buildGameExecutable, GameExecutableBuildError, type GameExecutableBuildEvent } from "../gameExecutableBuild";

jest.mock("../../lib/rest-fetch", () => ({ restFetch: jest.fn() }));

const mockFetch = restFetch as jest.Mock;
const encoder = new NodeTextEncoder();

beforeAll(() => {
  Object.assign(globalThis, { TextDecoder: globalThis.TextDecoder ?? NodeTextDecoder });
});

beforeEach(() => mockFetch.mockReset());

/** A response whose body arrives in the given chunks, split wherever the test chooses. */
function streamed(chunks: readonly string[]): unknown {
  const queue = chunks.map((chunk) => encoder.encode(chunk));
  return {
    ok: true,
    status: 200,
    body: { getReader: () => ({ read: async () => queue.length > 0 ? { done: false, value: queue.shift() } : { done: true, value: undefined } }) }
  };
}

describe("buildGameExecutable", () => {
  it("passes each event on as it arrives, across chunk boundaries, and resolves with the result", async () => {
    mockFetch.mockResolvedValue(streamed([
      "{\"type\":\"status\",\"message\":\"Compiling Cave Run with cargo\",\"project_path\":\"/w/p\"}\n{\"type\":\"log\",\"li",
      "ne\":\"   Compiling tauri v2\"}\n",
      "{\"type\":\"done\",\"binary_path\":\"/w/p/bin/cave-run\",\"project_path\":\"/w/p\"}"
    ]));
    const events: GameExecutableBuildEvent[] = [];
    const done = await buildGameExecutable("a/b", (event) => events.push(event));
    expect(mockFetch).toHaveBeenCalledWith("/api/games/a%2Fb/build-executable", { method: "POST", signal: undefined });
    expect(events.map((event) => event.type)).toEqual(["status", "log", "done"]);
    expect(events[1]).toEqual({ type: "log", line: "   Compiling tauri v2" });
    expect(done.binary_path).toBe("/w/p/bin/cave-run");
  });

  it("rejects with the build's error and the package it is missing", async () => {
    mockFetch.mockResolvedValue(streamed(["{\"type\":\"error\",\"detail\":\"cargo was not found\",\"runtime_package\":\"rust\"}\n"]));
    const failure = buildGameExecutable("id", () => undefined);
    await expect(failure).rejects.toThrow("cargo was not found");
    await expect(failure).rejects.toMatchObject({ runtimePackage: "rust" });
  });

  it("reads a refused request's detail and package", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 503, text: async () => JSON.stringify({ detail: "Install Rust", runtime_package: "rust" }) });
    const failure = buildGameExecutable("id", () => undefined);
    await expect(failure).rejects.toBeInstanceOf(GameExecutableBuildError);
    await expect(failure).rejects.toMatchObject({ message: "Install Rust", runtimePackage: "rust" });
  });

  it("fails when the stream ends without a result", async () => {
    mockFetch.mockResolvedValue(streamed(["{\"type\":\"log\",\"line\":\"Compiling\"}\n"]));
    await expect(buildGameExecutable("id", () => undefined)).rejects.toThrow("stopped before it finished");
  });
});
