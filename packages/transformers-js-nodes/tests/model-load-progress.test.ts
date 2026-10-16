import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  activeModelLoads,
  resetModelLoadsForTesting,
  subscribeModelLoads,
  type ModelLoadUpdate
} from "@nodetool-ai/runtime";
import {
  trackModelLoad,
  watchModelLoadEvents,
  type TjsProgressCallback
} from "../src/model-load-progress.js";
import {
  __setTransformersModuleForTesting,
  getPipeline,
  setTransformersJsCacheDir
} from "../src/transformers-base.js";
import { downloadTransformersJsModel } from "../src/tjs-downloader.js";

const REPO = "org/model";

let cacheDir: string;
let updates: ModelLoadUpdate[];

beforeEach(async () => {
  cacheDir = await mkdtemp(join(tmpdir(), "tjs-load-"));
  setTransformersJsCacheDir(cacheDir);
  resetModelLoadsForTesting();
  updates = [];
  subscribeModelLoads((update) => updates.push(update));
});

afterEach(async () => {
  __setTransformersModuleForTesting(null);
  setTransformersJsCacheDir(null);
  resetModelLoadsForTesting();
  await rm(cacheDir, { recursive: true, force: true });
});

/** What Transformers.js sends for one file: the same for a fetch and a cache read. */
const sendFile = (
  progress: TjsProgressCallback,
  file: string,
  total: number
): void => {
  progress({ status: "initiate", name: REPO, file });
  progress({ status: "download", name: REPO, file });
  progress({ status: "progress", name: REPO, file, loaded: total / 2, total });
  progress({ status: "progress", name: REPO, file, loaded: total, total });
  progress({ status: "done", name: REPO, file });
};

describe("trackModelLoad", () => {
  it("reports a download when a file is missing from the cache", async () => {
    // Each read of the clock is a throttle interval later.
    let clock = 0;
    await trackModelLoad(
      REPO,
      async (progress) => {
        sendFile(progress, "onnx/model.onnx", 400);
        return "loaded";
      },
      () => (clock += 1000)
    );

    expect(updates.map((u) => u.phase)).toEqual([
      "loading",
      "downloading",
      "downloading",
      "downloading",
      "ready"
    ]);
    expect(updates.at(-1)).toMatchObject({
      repo_id: REPO,
      runtime: "transformers-js",
      loaded_bytes: 400,
      total_bytes: 400
    });
    expect(activeModelLoads()).toEqual([]);
  });

  it("reports a cache read as loading, never as a download", async () => {
    await mkdir(join(cacheDir, REPO, "onnx"), { recursive: true });
    await writeFile(join(cacheDir, REPO, "onnx/model.onnx"), "bytes");

    await trackModelLoad(REPO, async (progress) => {
      sendFile(progress, "onnx/model.onnx", 400);
      return "loaded";
    });

    expect(updates.map((u) => u.phase)).not.toContain("downloading");
    expect(updates.at(-1)?.phase).toBe("ready");
  });

  it("keeps the state of a load in progress for a late subscriber", async () => {
    let finish: (() => void) | undefined;
    const load = trackModelLoad(
      REPO,
      (progress) =>
        new Promise<string>((resolve) => {
          progress({ status: "download", name: REPO, file: "a.onnx" });
          finish = () => resolve("loaded");
        })
    );
    await Promise.resolve();

    expect(activeModelLoads()).toMatchObject([
      { repo_id: REPO, phase: "downloading" }
    ]);
    finish?.();
    await load;
    expect(activeModelLoads()).toEqual([]);
  });

  it("reports an error and passes the failure on", async () => {
    await expect(
      trackModelLoad(REPO, async () => {
        throw new Error("network down");
      })
    ).rejects.toThrow("network down");
    expect(updates.at(-1)).toMatchObject({
      phase: "error",
      error: "network down"
    });
  });

  it("throttles progress updates", async () => {
    await trackModelLoad(
      REPO,
      async (progress) => {
        progress({ status: "download", name: REPO, file: "a.onnx" });
        for (let loaded = 1; loaded <= 50; loaded += 1) {
          progress({
            status: "progress",
            name: REPO,
            file: "a.onnx",
            loaded,
            total: 50
          });
        }
        return "loaded";
      },
      () => 0
    );
    // Start, the switch to downloading and the end: no per-chunk updates.
    expect(updates).toHaveLength(3);
  });

  it("hands the raw events to a watcher of the repo", async () => {
    const seen: string[] = [];
    const unwatch = watchModelLoadEvents(REPO, (info) =>
      seen.push(String(info.status))
    );
    await trackModelLoad(REPO, async (progress) => {
      sendFile(progress, "a.onnx", 10);
      return "loaded";
    });
    unwatch();
    expect(seen).toEqual(["initiate", "download", "progress", "progress", "done"]);
  });
});

describe("a model manager download during a run", () => {
  it("joins the run's load instead of fetching the files again", async () => {
    let calls = 0;
    let release: (() => void) | undefined;
    __setTransformersModuleForTesting({
      pipeline: (async (
        _task: string,
        _model?: string,
        options?: Record<string, unknown>
      ) => {
        calls += 1;
        const progress = options?.progress_callback as TjsProgressCallback;
        progress({ status: "download", name: REPO, file: "a.onnx" });
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        progress({
          status: "progress",
          name: REPO,
          file: "a.onnx",
          loaded: 10,
          total: 10
        });
        return () => "result";
      }) as never
    });

    const run = getPipeline<object>({
      task: "text-classification",
      model: REPO
    });
    const seen: string[] = [];
    const download = downloadTransformersJsModel(REPO, {
      task: "text-classification",
      onProgress: (update) => seen.push(update.status)
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    release?.();
    await Promise.all([run, download]);

    expect(calls).toBe(1);
    expect(seen).toContain("progress");
  });
});
