/**
 * Tests for src/commands/worker.ts — the `nodetool worker` command group.
 *
 * Strategy:
 *   - Mock @nodetool-ai/compute so the command group runs against a fake
 *     WorkerManager whose methods are spies.
 *   - Mock @nodetool-ai/models, @nodetool-ai/security, @nodetool-ai/config so
 *     DB / master-key init are no-ops.
 *   - Use Commander's parseAsync on a freshly built Command per case; capture
 *     stdout/stderr via console spies.
 */

import {
  describe,
  expect,
  it,
  vi,
  beforeEach,
  afterEach,
  type MockInstance
} from "vitest";
import { Command } from "commander";

// ─── Fake WorkerManager spies ───────────────────────────────────────────────

const createProfile = vi.fn(async (input: unknown) => ({
  id: "p1",
  name: (input as { name: string }).name,
  target: (input as { target: string }).target,
  image: (input as { image: string }).image,
  spec: {},
  token_policy: "generate",
  idle_timeout_minutes: null,
  max_lifetime_minutes: null,
  created_at: "2026-06-08T00:00:00.000Z",
  updated_at: "2026-06-08T00:00:00.000Z"
}));
const listProfiles = vi.fn(async () => [
  {
    id: "p1",
    name: "hf-a40",
    target: "runpod",
    image: "ghcr.io/nodetool-ai/worker:0.7.3",
    spec: { gpu: "A40" },
    token_policy: "generate",
    idle_timeout_minutes: 30,
    max_lifetime_minutes: null,
    created_at: "2026-06-08T00:00:00.000Z",
    updated_at: "2026-06-08T00:00:00.000Z"
  }
]);
const deleteProfile = vi.fn(async (_name: string) => {});

const provisionedInstance = {
  id: "i1",
  profile_name: "hf-a40",
  target: "runpod",
  provider_ref: "pod-123",
  ws_url: "wss://pod-123-7777.proxy.runpod.net",
  token: "deadbeef",
  status: "running",
  attached_to: null,
  created_at: "2026-06-08T00:00:00.000Z",
  last_activity_at: "2026-06-08T00:00:00.000Z",
  estimated_cost_usd: null
};
const provision = vi.fn(async (_name: string) => provisionedInstance);
const attach = vi.fn(async (_id: string) => ({
  wsUrl: "wss://pod-123-7777.proxy.runpod.net",
  token: "deadbeef"
}));
const listInstances = vi.fn(async () => [provisionedInstance]);
const status = vi.fn(async (_id: string) => "running");
const stop = vi.fn(async (_id: string) => ({
  ...provisionedInstance,
  status: "stopped"
}));
const stopAll = vi.fn(async () => {});

class FakeWorkerManager {
  createProfile = createProfile;
  listProfiles = listProfiles;
  deleteProfile = deleteProfile;
  provision = provision;
  attach = attach;
  list = listInstances;
  status = status;
  stop = stop;
  stopAll = stopAll;
}

vi.mock("@nodetool-ai/compute", () => ({
  WorkerManager: FakeWorkerManager
}));

vi.mock("@nodetool-ai/models", () => ({
  initDb: vi.fn(() => {})
}));

vi.mock("@nodetool-ai/security", () => ({
  initMasterKey: vi.fn(async () => {})
}));

vi.mock("@nodetool-ai/config", () => ({
  getDefaultDbPath: () => ":memory:"
}));

// ─── Capture helpers ─────────────────────────────────────────────────────────

let exitSpy: MockInstance<(code?: number | string | null) => never>;
let logSpy: MockInstance;
let errSpy: MockInstance;

function captured(): { out: string; err: string } {
  const out = logSpy.mock.calls
    .map((c) => (c as unknown[]).map(String).join(" "))
    .join("\n");
  const err = errSpy.mock.calls
    .map((c) => (c as unknown[]).map(String).join(" "))
    .join("\n");
  return { out, err };
}

async function run(args: string[]): Promise<void> {
  const { registerWorkerCommands } = await import("../src/commands/worker.js");
  const program = new Command();
  program.exitOverride();
  registerWorkerCommands(program);
  await program.parseAsync(["node", "test", ...args]);
}

beforeEach(() => {
  exitSpy = vi.spyOn(process, "exit").mockImplementation(((_code?: number) => {
    throw new Error(`__exit_${_code ?? 0}`);
  }) as never);
  logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

  for (const fn of [
    createProfile,
    listProfiles,
    deleteProfile,
    provision,
    attach,
    listInstances,
    status,
    stop,
    stopAll
  ]) {
    fn.mockClear();
  }
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────

describe("worker profile add", () => {
  it("creates a profile with target, image, and gpu", async () => {
    await run([
      "worker",
      "profile",
      "add",
      "hf-a40",
      "--target",
      "runpod",
      "--image",
      "ghcr.io/nodetool-ai/worker:0.7.3",
      "--gpu",
      "A40"
    ]);
    expect(createProfile).toHaveBeenCalledTimes(1);
    const input = createProfile.mock.calls[0]![0] as {
      name: string;
      target: string;
      image: string;
      spec?: { gpu?: string };
    };
    expect(input.name).toBe("hf-a40");
    expect(input.target).toBe("runpod");
    expect(input.image).toBe("ghcr.io/nodetool-ai/worker:0.7.3");
    expect(input.spec?.gpu).toBe("A40");
  });

  it("rejects an unsupported --target", async () => {
    await expect(
      run([
        "worker",
        "profile",
        "add",
        "bad",
        "--target",
        "aws",
        "--image",
        "x"
      ])
    ).rejects.toThrow("__exit_1");
    expect(createProfile).not.toHaveBeenCalled();
  });
});

describe("worker profile list", () => {
  it("lists profiles in a table", async () => {
    await run(["worker", "profile", "list"]);
    expect(listProfiles).toHaveBeenCalledTimes(1);
    const { out } = captured();
    expect(out).toContain("hf-a40");
    expect(out).toContain("runpod");
  });

  it("emits JSON with --json", async () => {
    await run(["worker", "profile", "list", "--json"]);
    const { out } = captured();
    const parsed = JSON.parse(out);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0].name).toBe("hf-a40");
  });
});

describe("worker profile rm", () => {
  it("deletes the named profile", async () => {
    await run(["worker", "profile", "rm", "hf-a40"]);
    expect(deleteProfile).toHaveBeenCalledWith("hf-a40");
  });
});

describe("worker create", () => {
  it("provisions from a profile and prints id, wsUrl, and token", async () => {
    await run(["worker", "create", "--profile", "hf-a40"]);
    expect(provision).toHaveBeenCalledWith("hf-a40");
    expect(attach).not.toHaveBeenCalled();
    const { out } = captured();
    expect(out).toContain("i1");
    expect(out).toContain("wss://pod-123-7777.proxy.runpod.net");
    expect(out).toContain("deadbeef");
  });

  it("attaches when --attach is set and prints the wsUrl", async () => {
    await run(["worker", "create", "--profile", "hf-a40", "--attach"]);
    expect(provision).toHaveBeenCalledWith("hf-a40");
    expect(attach).toHaveBeenCalledWith("i1");
    const { out } = captured();
    expect(out).toContain("wss://pod-123-7777.proxy.runpod.net");
  });

  it("supports the inline --target/--gpu/--image form", async () => {
    await run([
      "worker",
      "create",
      "--target",
      "runpod",
      "--image",
      "ghcr.io/nodetool-ai/worker:0.7.3",
      "--gpu",
      "A40"
    ]);
    expect(createProfile).toHaveBeenCalledTimes(1);
    expect(provision).toHaveBeenCalledTimes(1);
  });

  it("errors when neither --profile nor inline target is given", async () => {
    await expect(run(["worker", "create"])).rejects.toThrow("__exit_1");
    expect(provision).not.toHaveBeenCalled();
  });
});

describe("worker list", () => {
  it("lists instances in a table", async () => {
    await run(["worker", "list"]);
    expect(listInstances).toHaveBeenCalledTimes(1);
    const { out } = captured();
    expect(out).toContain("i1");
    expect(out).toContain("running");
  });

  it("emits JSON with --json", async () => {
    await run(["worker", "list", "--json"]);
    const { out } = captured();
    const parsed = JSON.parse(out);
    expect(parsed[0].id).toBe("i1");
  });
});

describe("worker status", () => {
  it("refreshes an instance's status", async () => {
    await run(["worker", "status", "i1"]);
    expect(status).toHaveBeenCalledWith("i1");
    const { out } = captured();
    expect(out).toContain("running");
  });
});

describe("worker stop", () => {
  it("stops a single instance by id", async () => {
    await run(["worker", "stop", "i1"]);
    expect(stop).toHaveBeenCalledWith("i1");
    expect(stopAll).not.toHaveBeenCalled();
  });

  it("stops every instance with --all", async () => {
    await run(["worker", "stop", "--all"]);
    expect(stopAll).toHaveBeenCalledTimes(1);
    expect(stop).not.toHaveBeenCalled();
  });

  it("errors when neither an id nor --all is given", async () => {
    await expect(run(["worker", "stop"])).rejects.toThrow("__exit_1");
    expect(stop).not.toHaveBeenCalled();
    expect(stopAll).not.toHaveBeenCalled();
  });
});
