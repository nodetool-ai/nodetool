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
    image: "ghcr.io/nodetool-ai/nodetool-worker:0.7.3",
    spec: { gpu: "A40" },
    token_policy: "generate",
    idle_timeout_minutes: 30,
    max_lifetime_minutes: null,
    created_at: "2026-06-08T00:00:00.000Z",
    updated_at: "2026-06-08T00:00:00.000Z"
  }
]);
const deleteProfile = vi.fn(async (_name: string) => {});

// A realistic high-entropy bearer token (randomBytes(32).toString("hex")).
const FULL_TOKEN =
  "deadbeefcafef00d0123456789abcdef0123456789abcdef0123456789abcdef";
const provisionedInstance = {
  id: "i1",
  profile_name: "hf-a40",
  target: "runpod",
  provider_ref: "pod-123",
  ws_url: "wss://pod-123-7777.proxy.runpod.net",
  token: FULL_TOKEN,
  status: "running",
  attached_to: null,
  created_at: "2026-06-08T00:00:00.000Z",
  last_activity_at: "2026-06-08T00:00:00.000Z",
  estimated_cost_usd: null
};
const provision = vi.fn(async (_name: string) => provisionedInstance);
const attach = vi.fn(async (_id: string) => ({
  wsUrl: "wss://pod-123-7777.proxy.runpod.net",
  token: FULL_TOKEN
}));
const listInstances = vi.fn(async () => [provisionedInstance]);
const getInstance = vi.fn(async (id: string) =>
  id === provisionedInstance.id ? provisionedInstance : null
);
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
  getInstance = getInstance;
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
    getInstance,
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
      "ghcr.io/nodetool-ai/nodetool-worker:0.7.3",
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
    expect(input.image).toBe("ghcr.io/nodetool-ai/nodetool-worker:0.7.3");
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

  it.each([
    ["non-numeric", "foo"],
    ["zero", "0"],
    ["negative", "-5"]
  ])(
    "rejects a %s --idle-timeout before persisting",
    async (_label, value) => {
      await expect(
        run([
          "worker",
          "profile",
          "add",
          "x",
          "--target",
          "runpod",
          "--image",
          "img:1",
          "--idle-timeout",
          value
        ])
      ).rejects.toThrow("__exit_1");
      expect(createProfile).not.toHaveBeenCalled();
    }
  );

  it("passes a valid --idle-timeout / --max-lifetime through as integers", async () => {
    await run([
      "worker",
      "profile",
      "add",
      "x",
      "--target",
      "runpod",
      "--image",
      "img:1",
      "--idle-timeout",
      "30",
      "--max-lifetime",
      "120"
    ]);
    expect(createProfile).toHaveBeenCalledTimes(1);
    const input = createProfile.mock.calls[0]![0] as {
      idle_timeout_minutes: number | null;
      max_lifetime_minutes: number | null;
    };
    expect(input.idle_timeout_minutes).toBe(30);
    expect(input.max_lifetime_minutes).toBe(120);
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
  it("provisions from a profile and prints id and wsUrl, but never the raw token", async () => {
    await run(["worker", "create", "--profile", "hf-a40"]);
    expect(provision).toHaveBeenCalledWith("hf-a40");
    expect(attach).not.toHaveBeenCalled();
    const { out } = captured();
    expect(out).toContain("i1");
    expect(out).toContain("wss://pod-123-7777.proxy.runpod.net");
    // The full bearer token must NOT be printed to stdout.
    expect(out).not.toContain(FULL_TOKEN);
    // A short, masked preview is acceptable so the user can confirm presence.
    expect(out).toContain(FULL_TOKEN.slice(0, 8));
  });

  it("attaches when --attach is set and prints the wsUrl but never the raw token", async () => {
    await run(["worker", "create", "--profile", "hf-a40", "--attach"]);
    expect(provision).toHaveBeenCalledWith("hf-a40");
    expect(attach).toHaveBeenCalledWith("i1");
    const { out } = captured();
    expect(out).toContain("wss://pod-123-7777.proxy.runpod.net");
    // No copy-pasteable `export NODETOOL_WORKER_TOKEN=<secret>` line.
    expect(out).not.toContain(FULL_TOKEN);
    expect(out).not.toContain(`export NODETOOL_WORKER_TOKEN=${FULL_TOKEN}`);
  });

  it("supports the inline --target/--gpu/--image form", async () => {
    await run([
      "worker",
      "create",
      "--target",
      "runpod",
      "--image",
      "ghcr.io/nodetool-ai/nodetool-worker:0.7.3",
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

describe("worker token", () => {
  it("prints only the decrypted token so it pipes cleanly", async () => {
    await run(["worker", "token", "i1"]);
    expect(getInstance).toHaveBeenCalledWith("i1");
    const { out } = captured();
    // The full token IS printed here — this is the one intentional retrieval
    // path — and nothing else, so `$(nodetool worker token i1)` is exact.
    expect(out.trim()).toBe(FULL_TOKEN);
  });

  it("errors for an unknown instance id", async () => {
    await expect(run(["worker", "token", "nope"])).rejects.toThrow("__exit_1");
    const { err } = captured();
    expect(err).toMatch(/not found/i);
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
