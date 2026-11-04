import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Command } from "commander";

const createProfile = vi.fn(async (input: { name: string }) => input);
const listProfiles = vi.fn(async () => [
  { name: "saved", spec: { comfyPort: 8188 } }
]);
const provision = vi.fn(async () => ({
  id: "i1",
  ws_url: "wss://p1-8188.proxy.runpod.net",
  token: null,
  status: "running"
}));
const terminate = vi.fn(async () => {});
const waitForComfyServer = vi.fn(async () => {});

vi.mock("@nodetool-ai/compute", () => ({
  WorkerManager: class {
    createProfile = createProfile;
    listProfiles = listProfiles;
    provision = provision;
    terminate = terminate;
  },
  comfyEndpointFromWsUrl: (url: string) => url.replace("wss:", "https:"),
  waitForComfyServer
}));
vi.mock("@nodetool-ai/models", () => ({ initDb: vi.fn() }));
vi.mock("@nodetool-ai/security", () => ({ initMasterKey: vi.fn(async () => {}) }));
vi.mock("@nodetool-ai/runtime", () => ({ WebsocketPythonBridge: vi.fn() }));
vi.mock("@nodetool-ai/huggingface", () => ({ resolveWorkerHfToken: vi.fn() }));
vi.mock("@nodetool-ai/config", () => ({
  getDefaultDbPath: () => ":memory:",
  getHfHubCacheDir: () => "/tmp/nodetool-hf-cache-stub"
}));

const INLINE = ["worker", "create", "--target", "runpod", "--image", "x/comfy:1"];

let logSpy: ReturnType<typeof vi.spyOn>;
let errSpy: ReturnType<typeof vi.spyOn>;

async function run(args: string[]): Promise<void> {
  const { registerWorkerCommands } = await import("../src/commands/worker.js");
  const program = new Command();
  program.exitOverride();
  registerWorkerCommands(program);
  await program.parseAsync(["node", "test", ...args]);
}

function output(spy: ReturnType<typeof vi.spyOn>): string {
  return spy.mock.calls.map((call) => call.join(" ")).join("\n");
}

beforeEach(() => {
  vi.clearAllMocks();
  logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(process, "exit").mockImplementation((code) => {
    throw new Error(`exit ${String(code)}`);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("worker create --comfy", () => {
  it("stores the default port and prints the HTTP endpoint once ready", async () => {
    await run([...INLINE, "--comfy", "--max-lifetime", "60"]);
    expect(createProfile.mock.calls[0][0]).toMatchObject({
      spec: { comfyPort: 8188 },
      max_lifetime_minutes: 60
    });
    expect(waitForComfyServer).toHaveBeenCalledWith(
      "https://p1-8188.proxy.runpod.net",
      { timeoutMs: undefined }
    );
    expect(output(logSpy)).toContain("Endpoint: https://p1-8188.proxy.runpod.net");
  });

  it("creates from a template and honors the ready timeout", async () => {
    await run([
      "worker", "create", "--target", "runpod", "--template", "v7b5g03csk",
      "--comfy", "--max-lifetime", "60", "--ready-timeout", "45"
    ]);
    expect(createProfile.mock.calls[0][0]).toMatchObject({
      image: "runpod-template:v7b5g03csk",
      spec: { comfyPort: 8188, templateId: "v7b5g03csk" }
    });
    expect(waitForComfyServer.mock.calls[0][1]).toEqual({ timeoutMs: 2_700_000 });
  });

  it.each([
    [["--target", "runpod", "--template", "abc"], "--template requires --comfy"],
    [
      ["--target", "runpod", "--image", "x", "--template", "abc", "--comfy", "--max-lifetime", "9"],
      "not both"
    ],
    [
      ["--target", "runpod", "--image", "x", "--ready-timeout", "5"],
      "--ready-timeout works only"
    ]
  ])("rejects %j before it rents a pod", async (flags, message) => {
    await expect(run(["worker", "create", ...flags])).rejects.toThrow("exit 1");
    expect(output(errSpy)).toContain(message);
    expect(provision).not.toHaveBeenCalled();
  });

  it("accepts a custom port", async () => {
    await run([...INLINE, "--comfy", "3000", "--max-lifetime", "60"]);
    expect(createProfile.mock.calls[0][0]).toMatchObject({
      spec: { comfyPort: 3000 }
    });
  });

  it.each([
    [["--comfy"], "--max-lifetime"],
    [["--comfy", "--max-lifetime", "60", "--idle-timeout", "5"], "--idle-timeout"],
    [["--comfy", "--max-lifetime", "60", "--attach"], "--attach"],
    [["--comfy", "70000", "--max-lifetime", "60"], "expected a port"]
  ])("rejects %j before it rents a pod", async (flags, message) => {
    await expect(run([...INLINE, ...flags])).rejects.toThrow("exit 1");
    expect(output(errSpy)).toContain(message);
    expect(provision).not.toHaveBeenCalled();
  });

  it("rejects a target other than runpod", async () => {
    await expect(
      run([
        "worker", "create", "--target", "vast", "--image", "x",
        "--comfy", "--max-lifetime", "60"
      ])
    ).rejects.toThrow("exit 1");
    expect(output(errSpy)).toContain("--target runpod");
    expect(provision).not.toHaveBeenCalled();
  });

  it("terminates the pod when ComfyUI never answers", async () => {
    waitForComfyServer.mockRejectedValueOnce(new Error("did not answer"));
    await expect(
      run([...INLINE, "--comfy", "--max-lifetime", "60"])
    ).rejects.toThrow("exit 1");
    expect(terminate).toHaveBeenCalledWith("i1");
    expect(output(errSpy)).toContain("did not answer");
  });

  it("treats a saved ComfyUI profile as a ComfyUI server", async () => {
    await expect(
      run(["worker", "create", "--profile", "saved", "--attach"])
    ).rejects.toThrow("exit 1");
    expect(provision).not.toHaveBeenCalled();

    await run(["worker", "create", "--profile", "saved"]);
    expect(waitForComfyServer).toHaveBeenCalled();
  });
});

describe("worker terminate", () => {
  it("destroys the named worker", async () => {
    await run(["worker", "terminate", "i1"]);
    expect(terminate).toHaveBeenCalledWith("i1");
    expect(output(logSpy)).toContain("volume is deleted");
  });
});
