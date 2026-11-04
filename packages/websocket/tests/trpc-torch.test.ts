import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { torchRouter } from "../src/trpc/routers/torch.js";
import type { Context } from "../src/trpc/context.js";
import { Workflow, Job } from "@nodetool-ai/models";
import { executeTorch } from "../src/lib/torch-workflow.js";

const state = vi.hoisted(() => ({
  save: (): Promise<void> => Promise.resolve()
}));

vi.mock("@nodetool-ai/models", () => ({
  Workflow: { findForEdit: vi.fn() },
  Job: Object.assign(
    vi.fn(function (
      this: Record<string, unknown>,
      data: Record<string, unknown>
    ) {
      Object.assign(this, data, {
        id: "0123456789abcdef0123456789abcdef",
        save: vi.fn(() => state.save()),
        markRunning: vi.fn(),
        markCompleted: vi.fn()
      });
    }),
    { find: vi.fn() }
  )
}));
vi.mock("../src/lib/torch-workflow.js", async (original) => ({
  ...(await original<typeof import("../src/lib/torch-workflow.js")>()),
  executeTorch: vi.fn().mockResolvedValue({ manifest: {}, outputs: null }),
  torchInstalled: vi.fn().mockResolvedValue(true),
  torchTargets: vi.fn().mockResolvedValue(["cpu"])
}));
vi.mock("../src/job-run-registry.js", () => ({
  jobRunRegistry: { open: vi.fn(() => ({ finish: vi.fn() })) }
}));
const ctx = { userId: "owner", torchLocalPeer: true } as unknown as Context; // Router uses only authenticated identity and local provenance.
const input = {
  workflow_id: "0123456789ab",
  action: "compile",
  target: "cpu"
} as const;
beforeEach(() => {
  vi.clearAllMocks();
  state.save = () => Promise.resolve();
  vi.stubEnv("HOST", "127.0.0.1");
  vi.stubEnv("NODETOOL_ENV", "development");
  vi.stubEnv("NODETOOL_TORCH_LOCAL", "1");
});
afterEach(() => vi.unstubAllEnvs());
describe("local Torch router", () => {
  it("refuses compilation unless the local operator explicitly enables it", async () => {
    vi.stubEnv("NODETOOL_TORCH_LOCAL", "");
    await expect(
      torchRouter.createCaller(ctx).start(input)
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(Workflow.findForEdit).not.toHaveBeenCalled();
  });
  it("refuses remote peers even on an opted-in server", async () => {
    await expect(
      torchRouter.createCaller({ ...ctx, torchLocalPeer: false }).start(input)
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("requires edit access before reading or compiling the graph", async () => {
    vi.mocked(Workflow.findForEdit).mockResolvedValue(null);
    await expect(
      torchRouter.createCaller(ctx).start(input)
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(executeTorch).not.toHaveBeenCalled();
  });
  it("reserves compilation before awaiting job persistence", async () => {
    // Partial fixture contains precisely the fields the router reads.
    vi.mocked(Workflow.findForEdit).mockResolvedValue({
      id: "0123456789abcdef0123456789abcdef",
      user_id: "owner",
      name: "Torch",
      project_id: "default",
      settings: { execution: { kind: "torch", version: 1 } },
      graph: { nodes: [], edges: [] }
    } as unknown as Awaited<ReturnType<typeof Workflow.findForEdit>>);
    let release: (() => void) | undefined;
    state.save = () =>
      new Promise<void>((resolve) => {
        release = resolve;
      });
    const first = torchRouter.createCaller(ctx).start(input);
    await vi.waitFor(() => expect(Job).toHaveBeenCalledOnce());
    await expect(
      torchRouter.createCaller(ctx).start(input)
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    state.save = () => Promise.resolve();
    release?.();
    await expect(first).resolves.toEqual({
      job_id: "0123456789abcdef0123456789abcdef"
    });
    await vi.waitFor(() => expect(executeTorch).toHaveBeenCalledOnce());
    expect(Workflow.findForEdit).toHaveBeenCalledWith("owner", "0123456789ab");
  });
  it("reports actual target capabilities", async () => {
    await expect(torchRouter.createCaller(ctx).capabilities()).resolves.toEqual(
      { enabled: true, reason: null, targets: ["cpu"] }
    );
  });
  it("resolves job prefixes within the authenticated user's scope", async () => {
    vi.mocked(Job.find).mockResolvedValue(null);
    await expect(
      torchRouter.createCaller(ctx).status({ job_id: "0123456789ab" })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(Job.find).toHaveBeenCalledWith("owner", "0123456789ab");
  });
});
