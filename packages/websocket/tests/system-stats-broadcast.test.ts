/**
 * The `system_stats` broadcast feeds the editor's CPU/RAM readout
 * (`web/src/components/panels/PanelBottom.tsx`) and the Model Manager's
 * hardware-fit recommendations (`useHardwareProfile`). Both ship enabled, and
 * both went blank in every packaged build for the four months the broadcast
 * sat behind `NODE_ENV !== "production"` — the desktop backend
 * (`electron/src/server.ts`) and the Docker image both set that variable.
 *
 * These tests pin the production case specifically, so that gate cannot come
 * back as an optimization. The one gate that does apply is the auth mode: a
 * server enforcing auth broadcasts nothing, because the CPU and RAM it would
 * report belong to a shared container rather than to the person reading them.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { unpack } from "msgpackr";
import { systemStatsBroadcastEnabled } from "../src/system-stats.js";
import {
  WebSocketClientSession,
  type WebSocketConnection,
  type WebSocketReceiveFrame
} from "../src/websocket-client-session.js";

class MockWS implements WebSocketConnection {
  clientState: "connected" | "disconnected" = "connected";
  applicationState: "connected" | "disconnected" = "connected";
  sentBytes: Uint8Array[] = [];
  sentText: string[] = [];
  async accept(): Promise<void> {}
  async receive(): Promise<WebSocketReceiveFrame> {
    return { type: "websocket.disconnect" };
  }
  async sendBytes(data: Uint8Array): Promise<void> {
    this.sentBytes.push(data);
  }
  async sendText(data: string): Promise<void> {
    this.sentText.push(data);
  }
  async close(): Promise<void> {
    this.clientState = "disconnected";
    this.applicationState = "disconnected";
  }
}

const statsFrames = (ws: MockWS): Record<string, unknown>[] =>
  ws.sentBytes
    .map((b) => unpack(b) as Record<string, unknown>)
    .filter((m) => m["type"] === "system_stats");

const SAMPLE = {
  cpu_percent: 42,
  memory_percent: 50,
  memory_used_gb: 8,
  memory_total_gb: 16
};

/** Runner plus a call counter for the sampler, which is what a stray timer keeps alive. */
function makeRunner(options: { systemStatsEnabled?: boolean } = {}): {
  runner: WebSocketClientSession;
  samples: () => number;
} {
  let sampled = 0;
  const runner = new WebSocketClientSession({
    ...options,
    getSystemStats: () => {
      sampled += 1;
      return { ...SAMPLE };
    }
  });
  return { runner, samples: () => sampled };
}

let previousNodeEnv: string | undefined;
const previousSupabase = {
  url: process.env.SUPABASE_URL,
  key: process.env.SUPABASE_KEY
};

const setSupabaseEnv = (value: string | undefined): void => {
  for (const key of ["SUPABASE_URL", "SUPABASE_KEY"] as const) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
};

beforeEach(() => {
  vi.useFakeTimers();
  previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  // A local install: no remote identity provider configured.
  setSupabaseEnv(undefined);
});

afterEach(() => {
  vi.useRealTimers();
  for (const [key, value] of [
    ["SUPABASE_URL", previousSupabase.url],
    ["SUPABASE_KEY", previousSupabase.key]
  ] as const) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  if (previousNodeEnv === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = previousNodeEnv;
  }
});

describe("system stats broadcast", () => {
  it("primes a first sample ~1s after connect on a production build", async () => {
    const { runner } = makeRunner();
    const ws = new MockWS();
    await runner.connect(ws);

    expect(statsFrames(ws)).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1000);

    expect(statsFrames(ws)).toEqual([{ type: "system_stats", stats: SAMPLE }]);
    await runner.disconnect();
  });

  it("keeps emitting on the 5s cadence", async () => {
    const { runner } = makeRunner();
    const ws = new MockWS();
    await runner.connect(ws);

    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(10_000);

    // The 1s prime, then one per 5s interval.
    expect(statsFrames(ws)).toHaveLength(3);
    await runner.disconnect();
  });

  // `sendMessage` drops frames on a closed socket, so a leaked timer is invisible
  // in the sent bytes — count sampler calls instead. Now that every connection
  // starts this, a prime left pending outlives the socket it belonged to.
  it("stops sampling on disconnect, including a prime that has not fired yet", async () => {
    const { runner, samples } = makeRunner();
    const ws = new MockWS();
    await runner.connect(ws);

    await runner.disconnect();
    await vi.advanceTimersByTimeAsync(30_000);

    expect(samples()).toBe(0);
    expect(statsFrames(ws)).toHaveLength(0);
  });

  // A shared deployment reports the CPU and RAM of a container the user does
  // not own — wrong for them, and someone else's host capacity. The gate is on
  // the auth mode, not NODE_ENV, which the desktop app and the Docker image
  // both set to "production" while serving one user locally.
  it("sends nothing when the server enforces auth", async () => {
    setSupabaseEnv("configured");
    const { runner, samples } = makeRunner();
    const ws = new MockWS();
    await runner.connect(ws);

    await vi.advanceTimersByTimeAsync(30_000);

    expect(samples()).toBe(0);
    expect(statsFrames(ws)).toHaveLength(0);
    await runner.disconnect();
  });

  it("honors an explicit systemStatsEnabled over the auth mode", async () => {
    setSupabaseEnv("configured");
    const { runner } = makeRunner({ systemStatsEnabled: true });
    const ws = new MockWS();
    await runner.connect(ws);

    await vi.advanceTimersByTimeAsync(1000);

    expect(statsFrames(ws)).toEqual([{ type: "system_stats", stats: SAMPLE }]);
    await runner.disconnect();
  });

  it("honors NODETOOL_SYSTEM_STATS over the auth mode, both ways", async () => {
    expect(
      systemStatsBroadcastEnabled({
        SUPABASE_URL: "u",
        SUPABASE_KEY: "k",
        NODETOOL_SYSTEM_STATS: "1"
      })
    ).toBe(true);
    expect(systemStatsBroadcastEnabled({ NODETOOL_SYSTEM_STATS: "0" })).toBe(
      false
    );
    expect(systemStatsBroadcastEnabled({})).toBe(true);
    expect(
      systemStatsBroadcastEnabled({ SUPABASE_URL: "u", SUPABASE_KEY: "k" })
    ).toBe(false);
  });
});
