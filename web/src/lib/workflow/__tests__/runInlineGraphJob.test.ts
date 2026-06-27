import { runInlineGraphJob } from "../runInlineGraphJob";
import { globalWebSocketManager } from "../../websocket/GlobalWebSocketManager";
import { getRunSignature } from "../../../stores/runSignatures";

jest.mock("../../websocket/GlobalWebSocketManager", () => {
  let captured: ((m: Record<string, unknown>) => void) | undefined;
  return {
    globalWebSocketManager: {
      ensureConnection: jest.fn().mockResolvedValue(undefined),
      send: jest.fn().mockResolvedValue(undefined),
      subscribe: jest.fn(
        (_key: string, h: (m: Record<string, unknown>) => void) => {
          captured = h;
          return jest.fn();
        }
      ),
      __emit: (m: Record<string, unknown>) => captured?.(m)
    }
  };
});
jest.mock("../../env", () => ({ isLocalhost: true }));
jest.mock("../../supabaseClient", () => ({
  supabase: { auth: { getSession: jest.fn() } }
}));
// runInlineGraphJob generates the job id via crypto.randomUUID(); stub it for
// stable assertions (jsdom may not provide a native randomUUID).
if (typeof globalThis.crypto === "undefined") {
  (globalThis as { crypto: Crypto }).crypto = {} as Crypto;
}
(globalThis.crypto as { randomUUID: () => string }).randomUUID = () => "job-x";
jest.mock("../../../stores/BASE_URL", () => ({ BASE_URL: "http://localhost" }));
jest.mock("../../../stores/MetadataStore", () => ({
  __esModule: true,
  default: { getState: () => ({ getMetadata: () => undefined }) }
}));

describe("runInlineGraphJob", () => {
  it("opts the inline run into concurrency so it does not serialize behind other runs", async () => {
    const graph = {
      nodes: [{ id: "n1", type: "x.Y", data: {} }],
      edges: []
    } as never;

    const done = runInlineGraphJob({ graph, workflowId: "wf" });
    // Let ensureConnection + send resolve.
    await Promise.resolve();
    await Promise.resolve();

    expect(globalWebSocketManager.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "run_job",
        data: expect.objectContaining({ concurrent: true, workflow_id: "wf" })
      })
    );

    // Resolve the pending run so the promise settles.
    (
      globalWebSocketManager as unknown as {
        __emit: (m: Record<string, unknown>) => void;
      }
    ).__emit({
      type: "job_update",
      status: "completed",
      job_id: "job-x",
      workflow_id: "wf",
      result: { outputs: {} }
    });
    await done;
  });

  it("records inputSignatures under the dispatched jobId and clears them on finish", async () => {
    const graph = {
      nodes: [{ id: "n1", type: "x.Y", data: {} }],
      edges: []
    } as never;

    const done = runInlineGraphJob({
      graph,
      workflowId: "wf",
      inputSignatures: { n1: "sig-n1" }
    });
    // Let ensureConnection + send resolve so the job id is generated and the
    // signatures are recorded before sending.
    await Promise.resolve();
    await Promise.resolve();

    // Stamped under the dispatched jobId (crypto.randomUUID stubbed → "job-x").
    expect(getRunSignature("job-x", "n1")).toBe("sig-n1");

    (
      globalWebSocketManager as unknown as {
        __emit: (m: Record<string, unknown>) => void;
      }
    ).__emit({
      type: "job_update",
      status: "completed",
      job_id: "job-x",
      workflow_id: "wf",
      result: { outputs: {} }
    });
    await done;

    // finish() drops the entry once the run settles.
    expect(getRunSignature("job-x", "n1")).toBeUndefined();
  });
});
