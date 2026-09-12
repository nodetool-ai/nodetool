/**
 * The client half of generation recovery.
 *
 * Two properties matter and neither is obvious from the happy path: an id with
 * no row must come back absent rather than failed — the row may not be open
 * yet, and reading "unknown" as "failed" throws away a render still in flight —
 * and a lookup that cannot run at all must degrade to the pre-lookup behaviour
 * rather than take every clip down with it.
 */

const rpcRequestMock = jest.fn();
jest.mock("../rpcRequest", () => ({
  __esModule: true,
  rpcRequest: (command: string, data: Record<string, unknown>) =>
    rpcRequestMock(command, data)
}));

import { isSettled, lookupGenerations } from "../lookupGenerations";

beforeEach(() => {
  rpcRequestMock.mockReset();
});

describe("isSettled", () => {
  it("counts every terminal state, and not running", () => {
    expect(isSettled("completed")).toBe(true);
    expect(isSettled("failed")).toBe(true);
    expect(isSettled("cancelled")).toBe(true);
    // The startup sweep writes this when a restart orphaned the row: nothing
    // more is coming for it either.
    expect(isSettled("interrupted")).toBe(true);
    expect(isSettled("running")).toBe(false);
  });
});

describe("lookupGenerations", () => {
  it("keys the rows it got by request id", async () => {
    rpcRequestMock.mockResolvedValue({
      generations: [
        {
          request_id: "req-1",
          generation_id: "gen-1",
          status: "completed",
          asset_ids: ["a1"],
          error: null
        }
      ]
    });

    const found = await lookupGenerations(["req-1"]);

    expect(rpcRequestMock).toHaveBeenCalledWith("lookup_generations", {
      request_ids: ["req-1"]
    });
    expect(found.get("req-1")).toEqual({
      requestId: "req-1",
      generationId: "gen-1",
      status: "completed",
      assetIds: ["a1"],
      error: null
    });
  });

  it("leaves an id with no row absent, not failed", async () => {
    rpcRequestMock.mockResolvedValue({ generations: [] });
    const found = await lookupGenerations(["req-unknown"]);
    expect(found.has("req-unknown")).toBe(false);
  });

  it("reads an unrecognised status as running, so nothing is discarded", async () => {
    rpcRequestMock.mockResolvedValue({
      generations: [{ request_id: "req-1", status: "pending" }]
    });
    expect((await lookupGenerations(["req-1"])).get("req-1")?.status).toBe(
      "running"
    );
  });

  it("yields an empty map when the lookup cannot run at all", async () => {
    // An older server that does not know the command, or a socket that will
    // not connect. The caller then subscribes, exactly as it did before this
    // existed — a failed lookup must not fail the renders.
    rpcRequestMock.mockRejectedValue(new Error("unknown command"));
    await expect(lookupGenerations(["req-1"])).resolves.toEqual(new Map());
  });

  it("asks nothing when given no ids", async () => {
    expect(await lookupGenerations([])).toEqual(new Map());
    expect(rpcRequestMock).not.toHaveBeenCalled();
  });

  it("ignores a malformed row rather than throwing on the recovery path", async () => {
    rpcRequestMock.mockResolvedValue({
      generations: [null, { status: "completed" }, "nonsense"]
    });
    await expect(lookupGenerations(["req-1"])).resolves.toEqual(new Map());
  });
});


it("recovers a batch larger than the server's request-id limit", async () => {
  const ids = Array.from({ length: 300 }, (_, index) => `req-${index}`);
  rpcRequestMock.mockImplementation(async (_command, data) => ({
    generations: data.request_ids.slice(0, 128).map((id: string) => ({
      request_id: id, generation_id: `gen-${id}`, status: "completed", asset_ids: [id]
    }))
  }));
  const found = await lookupGenerations(ids);
  expect(found.size).toBe(ids.length);
  expect(rpcRequestMock.mock.calls.every(([, data]) => data.request_ids.length <= 128)).toBe(true);
});
