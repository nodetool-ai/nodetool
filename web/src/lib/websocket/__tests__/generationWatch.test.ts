/**
 * The poller that makes recovery work at all after a reconnect.
 *
 * `GlobalWebSocketManager.subscribe` is a client-side map with no replay, and
 * the server writes an `rpc_response` to the socket that asked. So a reply that
 * lands while the browser is shut goes nowhere a new client can see, and one
 * that lands between a lookup and a subscription reaches no handler either.
 * Reading the row is the only mechanism that covers both.
 */

const lookupMock = jest.fn(async (_ids: readonly string[]) => new Map());
jest.mock("../lookupGenerations", () => ({
  __esModule: true,
  isSettled: (status: string) => status !== "running",
  lookupGenerations: (ids: readonly string[]) => lookupMock(ids)
}));

import {
  __resetGenerationWatchesForTests,
  watchGeneration
} from "../generationWatch";

const row = (requestId: string, status = "completed", assetIds = ["a1"]) => ({
  requestId,
  generationId: "gen-1",
  status,
  assetIds,
  error: null
});

const far = () => Date.now() + 60 * 60 * 1000;

beforeEach(() => {
  jest.useFakeTimers();
  lookupMock.mockReset();
  lookupMock.mockResolvedValue(new Map());
  __resetGenerationWatchesForTests();
});

afterEach(() => {
  __resetGenerationWatchesForTests();
  jest.useRealTimers();
});

describe("watchGeneration", () => {
  it("settles once the row reaches a terminal state", async () => {
    const settled = jest.fn();
    watchGeneration("req-1", far(), settled);

    lookupMock.mockResolvedValue(new Map([["req-1", row("req-1")]]));
    await jest.advanceTimersByTimeAsync(3_000);

    expect(settled).toHaveBeenCalledTimes(1);
    expect(settled.mock.calls[0][0]).toMatchObject({ status: "completed" });
  });

  it("keeps asking while the row is still running", async () => {
    const settled = jest.fn();
    watchGeneration("req-1", far(), settled);

    lookupMock.mockResolvedValue(
      new Map([["req-1", row("req-1", "running", [])]])
    );
    await jest.advanceTimersByTimeAsync(30_000);
    expect(settled).not.toHaveBeenCalled();
    expect(lookupMock.mock.calls.length).toBeGreaterThan(1);

    lookupMock.mockResolvedValue(new Map([["req-1", row("req-1")]]));
    await jest.advanceTimersByTimeAsync(30_000);
    expect(settled).toHaveBeenCalledTimes(1);
  });

  it("keeps asking when the row is not there yet", async () => {
    // The row is opened before the provider call, but a lookup can still race
    // ahead of it. Absent is not failed.
    const settled = jest.fn();
    watchGeneration("req-1", far(), settled);
    await jest.advanceTimersByTimeAsync(30_000);
    expect(settled).not.toHaveBeenCalled();
  });

  it("reads a completed result after the browser slept past the deadline", async () => {
    const settled = jest.fn();
    watchGeneration("req-sleep", Date.now() + 10_000, settled);
    jest.setSystemTime(Date.now() + 60 * 60 * 1000);
    lookupMock.mockResolvedValue(new Map([["req-sleep", row("req-sleep")]]));
    await jest.advanceTimersByTimeAsync(2_000);
    expect(settled).toHaveBeenCalledWith(row("req-sleep"));
  });

  it("gives up with null once the deadline passes", async () => {
    const settled = jest.fn();
    watchGeneration("req-1", Date.now() + 10_000, settled);

    lookupMock.mockResolvedValue(
      new Map([["req-1", row("req-1", "running", [])]])
    );
    await jest.advanceTimersByTimeAsync(60_000);

    expect(settled).toHaveBeenCalledTimes(1);
    expect(settled.mock.calls[0][0]).toBeNull();
  });

  it("asks for every watched id in one call, not one call per id", async () => {
    watchGeneration("req-1", far(), jest.fn());
    watchGeneration("req-2", far(), jest.fn());
    watchGeneration("req-3", far(), jest.fn());

    await jest.advanceTimersByTimeAsync(3_000);

    expect(lookupMock).toHaveBeenCalledTimes(1);
    expect([...lookupMock.mock.calls[0][0]].sort()).toEqual([
      "req-1",
      "req-2",
      "req-3"
    ]);
  });

  it("stops asking once cancelled, so a socket reply wins cleanly", async () => {
    const settled = jest.fn();
    const cancel = watchGeneration("req-1", far(), settled);
    cancel();

    lookupMock.mockResolvedValue(new Map([["req-1", row("req-1")]]));
    await jest.advanceTimersByTimeAsync(60_000);

    expect(settled).not.toHaveBeenCalled();
    expect(lookupMock).not.toHaveBeenCalled();
  });

  it("settles each watch once, even when several finish in one tick", async () => {
    const a = jest.fn();
    const b = jest.fn();
    watchGeneration("req-a", far(), a);
    watchGeneration("req-b", far(), b);

    lookupMock.mockResolvedValue(
      new Map([
        ["req-a", row("req-a")],
        ["req-b", row("req-b", "failed", [])]
      ])
    );
    await jest.advanceTimersByTimeAsync(60_000);

    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    expect(b.mock.calls[0][0]).toMatchObject({ status: "failed" });
  });

  it("stops polling entirely when nothing is left to watch", async () => {
    watchGeneration("req-1", far(), jest.fn());
    lookupMock.mockResolvedValue(new Map([["req-1", row("req-1")]]));
    await jest.advanceTimersByTimeAsync(3_000);

    const callsWhenSettled = lookupMock.mock.calls.length;
    await jest.advanceTimersByTimeAsync(120_000);
    expect(lookupMock.mock.calls.length).toBe(callsWhenSettled);
  });

  it("keeps watching the rest when one surface's landing throws", async () => {
    // The callback runs a surface's own landing code. A throw there used to
    // abandon every other request settling in the same tick — a whole board.
    const bad = jest.fn(() => {
      throw new Error("landing blew up");
    });
    const good = jest.fn();
    watchGeneration("req-bad", far(), bad);
    watchGeneration("req-good", far(), good);

    lookupMock.mockResolvedValue(
      new Map([
        ["req-bad", row("req-bad")],
        ["req-good", row("req-good")]
      ])
    );
    await jest.advanceTimersByTimeAsync(3_000);

    expect(bad).toHaveBeenCalledTimes(1);
    expect(good).toHaveBeenCalledTimes(1);
  });

  it("starts the interval over for a newly watched request", async () => {
    // Otherwise a board reattached after a long-running render inherits the
    // backed-off interval and waits 15s for its first answer.
    watchGeneration("req-slow", far(), jest.fn());
    lookupMock.mockResolvedValue(
      new Map([["req-slow", row("req-slow", "running", [])]])
    );
    await jest.advanceTimersByTimeAsync(120_000);

    const settled = jest.fn();
    watchGeneration("req-new", far(), settled);
    lookupMock.mockResolvedValue(new Map([["req-new", row("req-new")]]));

    await jest.advanceTimersByTimeAsync(2_500);
    expect(settled).toHaveBeenCalledTimes(1);
  });
});
