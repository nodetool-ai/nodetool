import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const list = vi.fn();
const status = vi.fn();
const stop = vi.fn();

vi.mock("@nodetool-ai/compute", () => ({
  WorkerManager: class {
    list = list;
    status = status;
    stop = stop;
  }
}));

import { WORKER_CAPABILITIES } from "../src/capabilities/workers.js";
import {
  listWorkersSpec,
  stopWorkerSpec
} from "../src/capabilities/workers.specs.js";

const ID_A = "aaaaaaaaaaaa00000000000000000001";
const ID_B = "bbbbbbbbbbbb00000000000000000002";
const ID_B2 = "bbbbbbbbbbbb00000000000000000003";

function instance(id: string, workerStatus = "running") {
  return {
    id,
    profile_name: "comfy",
    target: "runpod",
    provider_ref: "pod",
    ws_url: "wss://secret-8188.proxy.runpod.net",
    token: null,
    status: workerStatus,
    attached_to: null,
    created_at: "2026-11-04T00:00:00.000Z",
    last_activity_at: "2026-11-04T00:00:00.000Z",
    estimated_cost_usd: 0.59
  };
}

function call(name: string, params: Record<string, unknown> = {}) {
  const capability = WORKER_CAPABILITIES.find((c) => c.spec.name === name);
  if (!capability) {
    throw new Error(`No capability ${name}`);
  }
  // The implementations do not read the run.
  return capability.impl(undefined as never, params);
}

beforeEach(() => {
  vi.clearAllMocks();
  list.mockResolvedValue([instance(ID_A), instance(ID_B), instance(ID_B2)]);
  status.mockResolvedValue("running");
  stop.mockImplementation(async (id: string) => instance(id, "stopped"));
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("list_workers", () => {
  it("returns the cost and omits the connection URL", async () => {
    const result = await call("list_workers");
    expect(JSON.stringify(result)).not.toContain("secret-8188");
    expect(result).toMatchObject({
      workers: [{ id: ID_A, status: "running", hourly_cost_usd: 0.59 }, {}, {}]
    });
  });

  it("is a read, and stopping needs a human", () => {
    expect(listWorkersSpec.category).toBe("read");
    expect(stopWorkerSpec.category).toBe("external");
  });
});

describe("worker id resolution", () => {
  it("accepts the full id and an exact 12-character prefix", async () => {
    await call("get_worker_status", { worker_id: ID_B });
    await call("get_worker_status", { worker_id: ID_A.slice(0, 12) });
    expect(status.mock.calls).toEqual([[ID_B], [ID_A]]);
  });

  it("rejects an ambiguous prefix", async () => {
    await expect(
      call("stop_worker", { worker_id: ID_B.slice(0, 12) })
    ).rejects.toThrow("ambiguous");
    expect(stop).not.toHaveBeenCalled();
  });

  it("rejects a prefix of any other length", async () => {
    await expect(
      call("stop_worker", { worker_id: ID_A.slice(0, 8) })
    ).rejects.toThrow("not found");
    expect(stop).not.toHaveBeenCalled();
  });
});

describe("stop_worker", () => {
  it("stops a live worker", async () => {
    const result = await call("stop_worker", { worker_id: ID_A });
    expect(stop).toHaveBeenCalledWith(ID_A);
    expect(result).toMatchObject({ id: ID_A, status: "stopped" });
  });

  it("does not call the provider for a worker that is already stopped", async () => {
    list.mockResolvedValue([instance(ID_A, "stopped")]);
    await call("stop_worker", { worker_id: ID_A });
    expect(stop).not.toHaveBeenCalled();
  });
});

describe("on a production server", () => {
  beforeEach(() => {
    vi.stubEnv("NODETOOL_ENV", "production");
  });

  it("lists nothing and never reaches the manager", async () => {
    await expect(call("list_workers")).resolves.toEqual({ workers: [] });
    expect(list).not.toHaveBeenCalled();
  });

  it("refuses status and stop", async () => {
    await expect(call("stop_worker", { worker_id: ID_A })).rejects.toThrow(
      "disabled in production"
    );
    await expect(call("get_worker_status", { worker_id: ID_A })).rejects.toThrow(
      "disabled in production"
    );
    expect(stop).not.toHaveBeenCalled();
  });
});
