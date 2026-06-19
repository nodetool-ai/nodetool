import { describe, expect, it, vi } from "vitest";

import { runReaperOnce, startReaper } from "../reaper.js";
import type { ReaperDeps } from "../reaper.js";
import type { WorkerInstance, WorkerProfile } from "@nodetool-ai/models";

// ---------------------------------------------------------------------------
// Fakes — a profile lookup, a list of live instances, and a recording
// `WorkerManager.stop`. The reaper takes an injected clock so idle/TTL windows
// are exercised deterministically without real wall-clock waits.
// ---------------------------------------------------------------------------

const NOW_MS = Date.parse("2026-06-08T12:00:00.000Z");

function minutesAgo(minutes: number): string {
  return new Date(NOW_MS - minutes * 60_000).toISOString();
}

function makeProfile(
  name: string,
  overrides: Partial<WorkerProfile> = {}
): WorkerProfile {
  return {
    id: `profile-${name}`,
    name,
    target: "runpod",
    image: "ghcr.io/nodetool-ai/nodetool-worker:0.7.3",
    spec: {},
    token_policy: "generate",
    idle_timeout_minutes: null,
    max_lifetime_minutes: null,
    created_at: minutesAgo(1000),
    updated_at: minutesAgo(1000),
    ...overrides,
  };
}

function makeInstance(
  id: string,
  overrides: Partial<WorkerInstance> = {}
): WorkerInstance {
  return {
    id,
    profile_name: "p",
    target: "runpod",
    provider_ref: `pod-${id}`,
    ws_url: "wss://pod-7777.proxy.runpod.net",
    token: null,
    status: "running",
    attached_to: null,
    created_at: minutesAgo(5),
    last_activity_at: minutesAgo(0),
    estimated_cost_usd: null,
    ...overrides,
  };
}

function makeDeps(
  instances: WorkerInstance[],
  profiles: Record<string, WorkerProfile>
): {
  deps: ReaperDeps;
  stop: ReturnType<typeof vi.fn>;
  terminate: ReturnType<typeof vi.fn>;
} {
  const stop = vi.fn(async (_id: string) => {});
  const terminate = vi.fn(async (_id: string) => {});
  const deps: ReaperDeps = {
    manager: {
      list: vi.fn(async () => instances),
      stop,
      terminate,
    },
    getProfile: vi.fn(async (name: string) => profiles[name] ?? null),
    now: () => NOW_MS,
  };
  return { deps, stop, terminate };
}

describe("runReaperOnce — idle auto-stop", () => {
  it("stops an instance idle longer than its profile's idle_timeout_minutes", async () => {
    const profile = makeProfile("idle-30", { idle_timeout_minutes: 30 });
    const instance = makeInstance("i1", {
      profile_name: "idle-30",
      last_activity_at: minutesAgo(45),
    });
    const { deps, stop } = makeDeps([instance], { "idle-30": profile });

    await runReaperOnce(deps);

    expect(stop).toHaveBeenCalledWith("i1");
  });

  it("does not stop an instance within its idle window", async () => {
    const profile = makeProfile("idle-30", { idle_timeout_minutes: 30 });
    const instance = makeInstance("i1", {
      profile_name: "idle-30",
      last_activity_at: minutesAgo(10),
    });
    const { deps, stop } = makeDeps([instance], { "idle-30": profile });

    await runReaperOnce(deps);

    expect(stop).not.toHaveBeenCalled();
  });
});

describe("runReaperOnce — hard TTL", () => {
  it("TERMINATES an instance older than max_lifetime_minutes (destroys volume)", async () => {
    const profile = makeProfile("ttl-60", { max_lifetime_minutes: 60 });
    const instance = makeInstance("i1", {
      profile_name: "ttl-60",
      created_at: minutesAgo(90),
      last_activity_at: minutesAgo(0),
    });
    const { deps, stop, terminate } = makeDeps([instance], {
      "ttl-60": profile,
    });

    await runReaperOnce(deps);

    expect(terminate).toHaveBeenCalledWith("i1");
    expect(stop).not.toHaveBeenCalled();
  });

  it("does not touch an instance within its lifetime window", async () => {
    const profile = makeProfile("ttl-60", { max_lifetime_minutes: 60 });
    const instance = makeInstance("i1", {
      profile_name: "ttl-60",
      created_at: minutesAgo(30),
      last_activity_at: minutesAgo(0),
    });
    const { deps, stop, terminate } = makeDeps([instance], {
      "ttl-60": profile,
    });

    await runReaperOnce(deps);

    expect(stop).not.toHaveBeenCalled();
    expect(terminate).not.toHaveBeenCalled();
  });

  it("TERMINATES when both idle and TTL have fired (destroy wins over pause)", async () => {
    const profile = makeProfile("both", {
      idle_timeout_minutes: 30,
      max_lifetime_minutes: 60,
    });
    const instance = makeInstance("i1", {
      profile_name: "both",
      created_at: minutesAgo(90),
      last_activity_at: minutesAgo(90),
    });
    const { deps, stop, terminate } = makeDeps([instance], { both: profile });

    await runReaperOnce(deps);

    expect(terminate).toHaveBeenCalledWith("i1");
    expect(stop).not.toHaveBeenCalled();
  });
});

describe("runReaperOnce — no limits / missing profile", () => {
  it("ignores instances whose profile sets neither limit", async () => {
    const profile = makeProfile("no-limits");
    const instance = makeInstance("i1", {
      profile_name: "no-limits",
      created_at: minutesAgo(1000),
      last_activity_at: minutesAgo(1000),
    });
    const { deps, stop } = makeDeps([instance], { "no-limits": profile });

    await runReaperOnce(deps);

    expect(stop).not.toHaveBeenCalled();
  });

  it("ignores already-stopped instances", async () => {
    const profile = makeProfile("idle-30", { idle_timeout_minutes: 30 });
    const instance = makeInstance("i1", {
      profile_name: "idle-30",
      status: "stopped",
      last_activity_at: minutesAgo(999),
    });
    const { deps, stop } = makeDeps([instance], { "idle-30": profile });

    await runReaperOnce(deps);

    expect(stop).not.toHaveBeenCalled();
  });

  it("ignores instances whose profile cannot be resolved", async () => {
    const instance = makeInstance("i1", {
      profile_name: "gone",
      last_activity_at: minutesAgo(999),
    });
    const { deps, stop } = makeDeps([instance], {});

    await runReaperOnce(deps);

    expect(stop).not.toHaveBeenCalled();
  });
});

describe("runReaperOnce — multiple instances", () => {
  it("pauses idle instances and terminates TTL-expired ones, leaving fresh alone", async () => {
    const idleProfile = makeProfile("idle-30", { idle_timeout_minutes: 30 });
    const ttlProfile = makeProfile("ttl-60", { max_lifetime_minutes: 60 });
    const freshIdle = makeInstance("fresh", {
      profile_name: "idle-30",
      last_activity_at: minutesAgo(5),
    });
    const staleIdle = makeInstance("stale", {
      profile_name: "idle-30",
      last_activity_at: minutesAgo(40),
    });
    const oldTtl = makeInstance("old", {
      profile_name: "ttl-60",
      created_at: minutesAgo(120),
      last_activity_at: minutesAgo(0),
    });
    const { deps, stop, terminate } = makeDeps([freshIdle, staleIdle, oldTtl], {
      "idle-30": idleProfile,
      "ttl-60": ttlProfile,
    });

    await runReaperOnce(deps);

    // Idle-but-not-expired → pause; TTL-expired → terminate; fresh → untouched.
    expect(stop).toHaveBeenCalledWith("stale");
    expect(stop).toHaveBeenCalledTimes(1);
    expect(terminate).toHaveBeenCalledWith("old");
    expect(terminate).toHaveBeenCalledTimes(1);
  });
});

describe("startReaper", () => {
  it("schedules runReaperOnce on the interval and returns a stop handle", () => {
    vi.useFakeTimers();
    try {
      const { deps } = makeDeps([], {});
      const runOnce = vi.spyOn(deps.manager, "list");

      const handle = startReaper(deps, 1000);
      expect(runOnce).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1000);
      expect(runOnce).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(1000);
      expect(runOnce).toHaveBeenCalledTimes(2);

      handle();
      vi.advanceTimersByTime(5000);
      expect(runOnce).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
