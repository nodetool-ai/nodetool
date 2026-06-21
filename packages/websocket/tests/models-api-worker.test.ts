/**
 * Tests for the worker-scoped HuggingFace model routes in models-api.ts.
 *
 * scope="worker" routes the list/delete/download to the attached worker's
 * Python bridge; scope="local" (default) keeps the existing local-FS behavior.
 * The download relay pipes the bridge's progress frames onto the existing
 * /ws/download socket sink.
 */
import { describe, it, expect, vi } from "vitest";
import {
  handleModelsApiRequest,
  relayWorkerDownload,
  type ModelsApiDeps
} from "../src/models-api.js";

// ── Fakes ──────────────────────────────────────────────────────────────────

interface FakeBridgeOverrides {
  listCachedModels?: ReturnType<typeof vi.fn>;
  deleteCachedModel?: ReturnType<typeof vi.fn>;
  downloadModel?: ReturnType<typeof vi.fn>;
  supportsModelManagement?: () => boolean;
}

function fakeBridge(overrides: FakeBridgeOverrides = {}) {
  return {
    listCachedModels:
      overrides.listCachedModels ?? vi.fn().mockResolvedValue([]),
    deleteCachedModel:
      overrides.deleteCachedModel ?? vi.fn().mockResolvedValue(true),
    downloadModel: overrides.downloadModel ?? vi.fn().mockResolvedValue(undefined),
    supportsModelManagement: overrides.supportsModelManagement ?? (() => true)
  } as unknown as ModelsApiDeps["pythonBridge"];
}

function fakeWorkerManager(active: unknown) {
  return {
    getActiveWorker: vi.fn().mockResolvedValue(active)
  } as unknown as ModelsApiDeps["workerManager"];
}

const ATTACHED = { id: "w1", status: "attached" };

function listRequest(scope?: string): Request {
  const qs = scope ? `?scope=${scope}` : "";
  return new Request(`http://localhost/api/models/huggingface${qs}`, {
    method: "GET"
  });
}

function deleteRequest(repoId: string, scope?: string): Request {
  const scopePart = scope ? `&scope=${scope}` : "";
  return new Request(
    `http://localhost/api/models/huggingface?repo_id=${encodeURIComponent(
      repoId
    )}${scopePart}`,
    { method: "DELETE" }
  );
}

// ── List ─────────────────────────────────────────────────────────────────────

describe("GET /api/models/huggingface scope=worker", () => {
  it("routes to pythonBridge.listCachedModels when a worker is attached", async () => {
    const listCachedModels = vi
      .fn()
      .mockResolvedValue([
        { id: "org/m", name: "org/m", repo_id: "org/m", downloaded: true }
      ]);
    const deps: ModelsApiDeps = {
      pythonBridge: fakeBridge({ listCachedModels }),
      workerManager: fakeWorkerManager(ATTACHED)
    };

    const res = await handleModelsApiRequest(listRequest("worker"), deps);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    const body = (await res!.json()) as Array<{ repo_id: string }>;
    expect(listCachedModels).toHaveBeenCalledOnce();
    expect(body[0].repo_id).toBe("org/m");
  });

  it("returns 409 with a clear reason when no worker is attached", async () => {
    const deps: ModelsApiDeps = {
      pythonBridge: fakeBridge(),
      workerManager: fakeWorkerManager(null)
    };

    const res = await handleModelsApiRequest(listRequest("worker"), deps);
    expect(res!.status).toBe(409);
    const body = (await res!.json()) as { detail: string };
    expect(body.detail).toMatch(/No worker attached/i);
  });

  it("returns 500 (not 409) when worker support is not configured", async () => {
    // No workerManager in deps = server wiring problem, distinct from the
    // runtime "no worker attached" 409.
    const deps: ModelsApiDeps = { pythonBridge: fakeBridge() };

    const res = await handleModelsApiRequest(listRequest("worker"), deps);
    expect(res!.status).toBe(500);
    const body = (await res!.json()) as { detail: string };
    expect(body.detail).toMatch(/not configured/i);
  });

  it("returns 409 when the attached worker image is too old", async () => {
    const deps: ModelsApiDeps = {
      pythonBridge: fakeBridge({ supportsModelManagement: () => false }),
      workerManager: fakeWorkerManager(ATTACHED)
    };

    const res = await handleModelsApiRequest(listRequest("worker"), deps);
    expect(res!.status).toBe(409);
    const body = (await res!.json()) as { detail: string };
    expect(body.detail).toMatch(/too old/i);
  });

  it("scope=local (default) does not touch the bridge", async () => {
    const listCachedModels = vi.fn();
    const deps: ModelsApiDeps = {
      pythonBridge: fakeBridge({ listCachedModels }),
      workerManager: fakeWorkerManager(ATTACHED)
    };

    const res = await handleModelsApiRequest(listRequest(), deps);
    expect(res!.status).toBe(200);
    expect(listCachedModels).not.toHaveBeenCalled();
  });
});

// ── Delete ───────────────────────────────────────────────────────────────────

describe("DELETE /api/models/huggingface scope=worker", () => {
  it("deletes via the bridge when scope=worker", async () => {
    const deleteCachedModel = vi.fn().mockResolvedValue(true);
    const deps: ModelsApiDeps = {
      pythonBridge: fakeBridge({ deleteCachedModel }),
      workerManager: fakeWorkerManager(ATTACHED)
    };

    const res = await handleModelsApiRequest(
      deleteRequest("org/m", "worker"),
      deps
    );
    expect(res!.status).toBe(200);
    expect(await res!.json()).toBe(true);
    expect(deleteCachedModel).toHaveBeenCalledWith("org/m");
  });

  it("returns 409 when no worker is attached", async () => {
    const deleteCachedModel = vi.fn();
    const deps: ModelsApiDeps = {
      pythonBridge: fakeBridge({ deleteCachedModel }),
      workerManager: fakeWorkerManager(null)
    };

    const res = await handleModelsApiRequest(
      deleteRequest("org/m", "worker"),
      deps
    );
    expect(res!.status).toBe(409);
    expect(deleteCachedModel).not.toHaveBeenCalled();
  });

  it("scope=local does not touch the bridge", async () => {
    const deleteCachedModel = vi.fn();
    const deps: ModelsApiDeps = {
      pythonBridge: fakeBridge({ deleteCachedModel }),
      workerManager: fakeWorkerManager(ATTACHED)
    };

    // No worker bridge call regardless of result; local path returns boolean.
    const res = await handleModelsApiRequest(deleteRequest("org/m"), deps);
    expect(res!.status).toBe(200);
    expect(deleteCachedModel).not.toHaveBeenCalled();
  });
});

// ── Download relay ───────────────────────────────────────────────────────────

describe("relayWorkerDownload", () => {
  it("pipes bridge progress frames to the socket sink and resolves on completion", async () => {
    const sent: Array<Record<string, unknown>> = [];
    const socket = { send: (s: string) => sent.push(JSON.parse(s)) };
    const downloadModel = vi.fn(
      async (
        _req: unknown,
        onProgress: (u: Record<string, unknown>) => void
      ) => {
        onProgress({
          status: "start",
          repo_id: "org/m",
          path: null,
          model_type: null,
          downloaded_bytes: 0,
          total_bytes: 100,
          downloaded_files: 0,
          current_files: [],
          total_files: 1
        });
        onProgress({
          status: "progress",
          repo_id: "org/m",
          path: null,
          model_type: null,
          downloaded_bytes: 100,
          total_bytes: 100,
          downloaded_files: 1,
          current_files: ["m.bin"],
          total_files: 1
        });
      }
    );
    const bridge = fakeBridge({ downloadModel });
    const workerManager = fakeWorkerManager(ATTACHED);

    await relayWorkerDownload(socket, bridge, workerManager, {
      command: "start_download",
      repo_id: "org/m",
      model_type: "hf.model"
    });

    expect(sent.map((s) => s.status)).toEqual(["start", "progress"]);
    expect(downloadModel).toHaveBeenCalledOnce();
    // Request forwards the repo + optional fields.
    expect(downloadModel.mock.calls[0][0]).toMatchObject({
      repo_id: "org/m",
      model_type: "hf.model"
    });
  });

  it("sends an error frame when no worker is attached", async () => {
    const sent: Array<Record<string, unknown>> = [];
    const socket = { send: (s: string) => sent.push(JSON.parse(s)) };
    const downloadModel = vi.fn();
    const bridge = fakeBridge({ downloadModel });
    const workerManager = fakeWorkerManager(null);

    await relayWorkerDownload(socket, bridge, workerManager, {
      command: "start_download",
      repo_id: "org/m"
    });

    expect(sent[0].status).toBe("error");
    expect(sent[0].error).toMatch(/No worker attached/i);
    expect(downloadModel).not.toHaveBeenCalled();
  });

  it("sends an error frame when the worker image is too old", async () => {
    const sent: Array<Record<string, unknown>> = [];
    const socket = { send: (s: string) => sent.push(JSON.parse(s)) };
    const downloadModel = vi.fn();
    const bridge = fakeBridge({
      downloadModel,
      supportsModelManagement: () => false
    });
    const workerManager = fakeWorkerManager(ATTACHED);

    await relayWorkerDownload(socket, bridge, workerManager, {
      command: "start_download",
      repo_id: "org/m"
    });

    expect(sent[0].status).toBe("error");
    expect(sent[0].error).toMatch(/too old/i);
    expect(downloadModel).not.toHaveBeenCalled();
  });

  it("surfaces a download failure (e.g. detach mid-download) as an error frame", async () => {
    const sent: Array<Record<string, unknown>> = [];
    const socket = { send: (s: string) => sent.push(JSON.parse(s)) };
    const downloadModel = vi.fn(
      async (
        _req: unknown,
        onProgress: (u: Record<string, unknown>) => void
      ) => {
        onProgress({
          status: "start",
          repo_id: "org/m",
          path: null,
          model_type: null,
          downloaded_bytes: 0,
          total_bytes: 100,
          downloaded_files: 0,
          current_files: [],
          total_files: 1
        });
        throw new Error("worker detached");
      }
    );
    const bridge = fakeBridge({ downloadModel });
    const workerManager = fakeWorkerManager(ATTACHED);

    await relayWorkerDownload(socket, bridge, workerManager, {
      command: "start_download",
      repo_id: "org/m"
    });

    expect(sent.map((s) => s.status)).toEqual(["start", "error"]);
    expect(sent[1].error).toMatch(/worker detached/i);
    expect(sent[1].repo_id).toBe("org/m");
  });
});

// ── Download cancel correlation ──────────────────────────────────────────────

describe("relayWorkerDownload cancel correlation", () => {
  const okBridge = () =>
    fakeBridge({ downloadModel: vi.fn().mockResolvedValue(undefined) });

  it("passes the composite cancel id (repo/path) as the bridge requestId", async () => {
    const socket = { send: () => {} };
    const bridge = okBridge();
    const downloadModel = bridge.downloadModel as ReturnType<typeof vi.fn>;

    await relayWorkerDownload(socket, bridge, fakeWorkerManager(ATTACHED), {
      command: "start_download",
      repo_id: "org/m",
      path: "weights.bin"
    });

    // Must match the web's cancel id: path ? repo + "/" + path : repo.
    expect(downloadModel.mock.calls[0][2]).toBe("org/m/weights.bin");
  });

  it("uses the bare repo_id as the requestId when there is no path", async () => {
    const socket = { send: () => {} };
    const bridge = okBridge();
    const downloadModel = bridge.downloadModel as ReturnType<typeof vi.fn>;

    await relayWorkerDownload(socket, bridge, fakeWorkerManager(ATTACHED), {
      command: "start_download",
      repo_id: "org/m"
    });

    expect(downloadModel.mock.calls[0][2]).toBe("org/m");
  });

  it("forwards an explicit requestId to the bridge", async () => {
    const socket = { send: () => {} };
    const bridge = okBridge();
    const downloadModel = bridge.downloadModel as ReturnType<typeof vi.fn>;

    await relayWorkerDownload(
      socket,
      bridge,
      fakeWorkerManager(ATTACHED),
      { command: "start_download", repo_id: "org/m", path: "weights.bin" },
      "explicit-id"
    );

    expect(downloadModel.mock.calls[0][2]).toBe("explicit-id");
  });

  it("does not emit a duplicate error frame when the worker already forwarded one", async () => {
    const sent: Array<Record<string, unknown>> = [];
    const socket = { send: (s: string) => sent.push(JSON.parse(s)) };
    const downloadModel = vi.fn(
      async (
        _req: unknown,
        onProgress: (u: Record<string, unknown>) => void
      ) => {
        onProgress({
          status: "start",
          repo_id: "org/m",
          path: null,
          model_type: null,
          downloaded_bytes: 0,
          total_bytes: 100,
          downloaded_files: 0,
          current_files: [],
          total_files: 1
        });
        onProgress({
          status: "error",
          repo_id: "org/m",
          path: null,
          model_type: null,
          downloaded_bytes: 0,
          total_bytes: 0,
          downloaded_files: 0,
          current_files: [],
          total_files: 0,
          error: "disk full"
        });
        throw new Error("disk full");
      }
    );
    const bridge = fakeBridge({ downloadModel });

    await relayWorkerDownload(socket, bridge, fakeWorkerManager(ATTACHED), {
      command: "start_download",
      repo_id: "org/m"
    });

    // The worker's verbatim error frame is the only error frame; the catch
    // does not pile on a second one.
    const errorFrames = sent.filter((s) => s.status === "error");
    expect(errorFrames).toHaveLength(1);
    expect(errorFrames[0].error).toBe("disk full");
  });
});
