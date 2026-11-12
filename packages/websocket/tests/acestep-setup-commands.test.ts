import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AceStepSetupOperation } from "@nodetool-ai/protocol";
import { AceStepProvider } from "@nodetool-ai/runtime";

const mocks = vi.hoisted(() => ({
  isAdmin: vi.fn(async () => true),
  listeners: new Set<(operation: unknown) => void>(),
  service: {
    status: vi.fn(),
    startInstall: vi.fn(),
    startModelDownload: vi.fn(),
    cancel: vi.fn(),
    subscribe: vi.fn()
  }
}));
vi.mock("../src/lib/admin.js", () => ({ isAdmin: mocks.isAdmin }));
vi.mock("../src/acestep-setup.js", () => ({ aceStepSetupService: () => mocks.service }));

const { CommandRouter } = await import("../src/session/commands.js");
type Deps = ConstructorParameters<typeof CommandRouter>[0];

const status = { remote: false, operation: null };
const operation: AceStepSetupOperation = {
  id: "a".repeat(32), kind: "models", set: "first_run", state: "done", stage: "Done", percent: 100,
  downloaded_bytes: 1, total_bytes: 1, file: null, file_index: 0, file_count: 0, error: null, error_code: null
};

const resolveProvider = vi.fn(async (_providerId: string, _userId: string): Promise<unknown> => undefined);

function harness() {
  const sent: Array<Record<string, unknown>> = [];
  const router = new CommandRouter({
    session: {
      appSession: null,
      resolveProvider,
      requireUserId: () => "u1",
      send: async (message: Record<string, unknown>) => { sent.push(message); },
      logError: vi.fn()
    },
    host: {},
    jobs: {}
  } as unknown as Deps);
  return { router, sent };
}

beforeEach(() => {
  vi.clearAllMocks();
  resolveProvider.mockImplementation(async () => undefined);
  mocks.listeners.clear();
  mocks.isAdmin.mockResolvedValue(true);
  mocks.service.status.mockResolvedValue(status);
  mocks.service.subscribe.mockImplementation((listener: (operation: unknown) => void) => {
    mocks.listeners.add(listener);
    return () => mocks.listeners.delete(listener);
  });
});

describe("acestep setup commands", () => {
  it("answers acestep_setup_status with an rpc_response", async () => {
    const { router, sent } = harness();
    expect(await router.handle("acestep_setup_status", {}, "r1")).toBeNull();
    expect(sent).toEqual([
      { type: "rpc_response", request_id: "r1", command: "acestep_setup_status", result: { accepted: true, reason: null, status } }
    ]);
  });

  it("reads the setup status with the requesting user's acestep settings (item 3)", async () => {
    resolveProvider.mockImplementation(
      async () => new AceStepProvider({ ACESTEP_SERVER_URL: "http://10.0.0.2:8085" })
    );
    const { router } = harness();
    await router.handle("acestep_setup_status", {}, "r8");
    await router.handle("acestep_download_models", { set: "add_instrument" }, "r9");
    expect(resolveProvider).toHaveBeenCalledWith("acestep", "u1");
    const resolution = { remote: true, binary: null, modelsDir: null };
    expect(mocks.service.status).toHaveBeenCalledWith(resolution);
    expect(mocks.service.startModelDownload).toHaveBeenCalledWith("add_instrument", resolution);
  });

  it("requires a request id", async () => {
    const { router } = harness();
    expect(await router.handle("acestep_setup_status", {})).toEqual({ error: "request_id is required for RPC commands" });
  });

  it("starts a model download for the named set and pushes progress until it ends", async () => {
    mocks.service.startModelDownload.mockImplementation(async () => {
      for (const listener of mocks.listeners) {
        listener({ ...operation, state: "running" });
        listener(operation);
      }
      return { accepted: true, reason: null, status };
    });
    const { router, sent } = harness();
    await router.handle("acestep_download_models", { set: "first_run" }, "r2");
    expect(mocks.service.startModelDownload).toHaveBeenCalledWith("first_run", undefined);
    expect(sent.map((m) => m.type)).toEqual(["acestep_setup_progress", "acestep_setup_progress", "rpc_response"]);
    expect((sent[1]?.operation as AceStepSetupOperation).state).toBe("done");
    expect(mocks.listeners.size).toBe(0);
  });

  it("rejects an unknown model set", async () => {
    const { router, sent } = harness();
    await router.handle("acestep_download_models", { set: "everything" }, "r3");
    expect(mocks.service.startModelDownload).not.toHaveBeenCalled();
    expect(sent[0]).toMatchObject({ type: "rpc_response", request_id: "r3", error: expect.anything() });
  });

  it("refuses install, download and cancel for a user who is not an admin", async () => {
    mocks.isAdmin.mockResolvedValue(false);
    const { router, sent } = harness();
    await router.handle("acestep_install", {}, "r4");
    await router.handle("acestep_setup_cancel", {}, "r5");
    expect(mocks.service.startInstall).not.toHaveBeenCalled();
    expect(mocks.service.cancel).not.toHaveBeenCalled();
    expect(sent.map((m) => (m.result as { reason: string }).reason)).toEqual(["not_admin", "not_admin"]);
  });

  it("drops the progress subscription when the service refuses", async () => {
    mocks.service.startInstall.mockResolvedValue({ accepted: false, reason: "blocked", status });
    const { router, sent } = harness();
    await router.handle("acestep_install", {}, "r6");
    expect(mocks.listeners.size).toBe(0);
    expect(sent[0]).toMatchObject({ result: { accepted: false, reason: "blocked" } });
  });

  it("refuses the commands for a published app session", async () => {
    const router = new CommandRouter({
      session: { appSession: { applicationId: "app" } }, host: {}, jobs: {}
    } as unknown as Deps);
    expect(await router.handle("acestep_install", {}, "r7")).toEqual({
      error: "This command is not available for a published app"
    });
  });
});
