import type { ProviderCallFailed } from "@nodetool-ai/protocol";
import {
  failuresForRun,
  latestRecentFailure,
  recordProviderCallFailure,
  useProviderCallFailureStore,
  type RecordedProviderCallFailure
} from "../ProviderCallFailureStore";

function failure(overrides: Partial<ProviderCallFailed> = {}): ProviderCallFailed {
  return {
    type: "provider_call_failed",
    provider: "openai",
    model: "gpt-5.4-mini",
    operation: "generateMessages",
    kind: "rate_limit",
    status: 429,
    message: "slow down",
    timestamp: "2026-01-02T03:04:05.000Z",
    ...overrides
  };
}

function recorded(
  overrides: Partial<RecordedProviderCallFailure> = {}
): RecordedProviderCallFailure {
  return { ...failure(), receivedAt: Date.now(), ...overrides };
}

beforeEach(() => {
  useProviderCallFailureStore.getState().clear();
});

describe("useProviderCallFailureStore", () => {
  it("keeps recorded failures newest last", () => {
    recordProviderCallFailure(failure({ provider: "openai" }));
    recordProviderCallFailure(failure({ provider: "anthropic" }));
    const { failures } = useProviderCallFailureStore.getState();
    expect(failures.map((f) => f.provider)).toEqual(["openai", "anthropic"]);
  });

  it("stamps when this browser saw the failure", () => {
    recordProviderCallFailure(failure());
    expect(
      useProviderCallFailureStore.getState().failures[0].receivedAt
    ).toBeGreaterThan(0);
  });

  it("drops the oldest past the cap", () => {
    for (let i = 0; i < 30; i++) {
      recordProviderCallFailure(failure({ message: `failure ${i}` }));
    }
    const { failures } = useProviderCallFailureStore.getState();
    expect(failures).toHaveLength(25);
    expect(failures[0].message).toBe("failure 5");
  });
});

describe("failuresForRun", () => {
  const failures = [
    recorded({ job_id: "job-1", workflow_id: "wf-1" }),
    recorded({ job_id: "job-2", workflow_id: "wf-2" }),
    recorded({ job_id: null, workflow_id: "wf-1" })
  ];

  it("matches on the job", () => {
    expect(failuresForRun(failures, { jobId: "job-2" })).toHaveLength(1);
  });

  it("falls back to the workflow for a call the relay never stamped", () => {
    expect(failuresForRun(failures, { workflowId: "wf-1" })).toHaveLength(2);
  });

  it("returns nothing when the caller names no run", () => {
    expect(failuresForRun(failures, {})).toEqual([]);
  });
});

describe("latestRecentFailure", () => {
  it("returns the last failure inside the window", () => {
    const now = 1_000_000;
    const last = recorded({ receivedAt: now - 1000, provider: "anthropic" });
    expect(
      latestRecentFailure([recorded({ receivedAt: now - 2000 }), last], now)
    ).toBe(last);
  });

  it("returns nothing when the last failure is stale", () => {
    const now = 1_000_000;
    expect(
      latestRecentFailure([recorded({ receivedAt: now - 10 * 60 * 1000 })], now)
    ).toBeUndefined();
  });

  it("returns nothing when nothing failed", () => {
    expect(latestRecentFailure([])).toBeUndefined();
  });
});
