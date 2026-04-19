import { describe, it, expect } from "vitest";
import { SessionStore } from "../src/session/SessionStore.js";
import type {
  Sandbox,
  SandboxProvider,
  SandboxOptions
} from "../src/SandboxProvider.js";
import { ToolClient } from "../src/ToolClient.js";

function makeFakeSandbox(sessionId: string): Sandbox & {
  released: boolean;
  paused: boolean;
  resumed: boolean;
} {
  const state = { released: false, paused: false, resumed: false };
  const sb: Sandbox & typeof state = {
    sessionId,
    endpoint: { toolUrl: "http://fake" },
    client: new ToolClient({ baseUrl: "http://fake" }),
    async release() {
      state.released = true;
    },
    async pause() {
      state.paused = true;
    },
    async resume() {
      state.paused = false;
      state.resumed = true;
    },
    ...state
  };
  // Proxy state so the sandbox object reflects live flags even after the
  // test function reads .released etc.
  Object.defineProperty(sb, "released", { get: () => state.released });
  Object.defineProperty(sb, "paused", { get: () => state.paused });
  Object.defineProperty(sb, "resumed", { get: () => state.resumed });
  return sb;
}

function makeProvider(): {
  provider: SandboxProvider;
  created: Array<{ sessionId: string; sandbox: ReturnType<typeof makeFakeSandbox> }>;
} {
  const created: Array<{ sessionId: string; sandbox: ReturnType<typeof makeFakeSandbox> }> = [];
  const provider: SandboxProvider = {
    async acquire(options: SandboxOptions) {
      const sandbox = makeFakeSandbox(options.sessionId);
      created.push({ sessionId: options.sessionId, sandbox });
      return sandbox;
    }
  };
  return { provider, created };
}

describe("SessionStore", () => {
  it("acquires a fresh sandbox for a new session id", async () => {
    const { provider, created } = makeProvider();
    const store = new SessionStore({ provider, sweepIntervalMs: 60_000 });
    try {
      const sb = await store.acquire("s1");
      expect(sb.sessionId).toBe("s1");
      expect(created).toHaveLength(1);
      expect(store.size()).toBe(1);
    } finally {
      await store.close();
    }
  });

  it("returns the same sandbox on subsequent acquires with the same id", async () => {
    const { provider, created } = makeProvider();
    const store = new SessionStore({ provider, sweepIntervalMs: 60_000 });
    try {
      const a = await store.acquire("s1");
      const b = await store.acquire("s1");
      expect(a).toBe(b);
      expect(created).toHaveLength(1);
    } finally {
      await store.close();
    }
  });

  it("auto-resumes a paused sandbox on re-acquire", async () => {
    const { provider, created } = makeProvider();
    const store = new SessionStore({
      provider,
      sweepIntervalMs: 60_000,
      idlePauseSeconds: 0.001,
      idleTtlSeconds: 3600
    });
    try {
      await store.acquire("s1");
      await new Promise((r) => setTimeout(r, 10));
      await store._sweepForTests();
      expect(created[0].sandbox.paused).toBe(true);
      await store.acquire("s1");
      expect(created[0].sandbox.resumed).toBe(true);
    } finally {
      await store.close();
    }
  });

  it("releases idle sandboxes past the TTL on sweep", async () => {
    const { provider, created } = makeProvider();
    const store = new SessionStore({
      provider,
      sweepIntervalMs: 60_000,
      idleTtlSeconds: 0.001
    });
    try {
      await store.acquire("s1");
      await new Promise((r) => setTimeout(r, 10));
      await store._sweepForTests();
      expect(created[0].sandbox.released).toBe(true);
      expect(store.has("s1")).toBe(false);
    } finally {
      await store.close();
    }
  });

  it("touches reset the idle timer", async () => {
    const { provider, created } = makeProvider();
    const store = new SessionStore({
      provider,
      sweepIntervalMs: 60_000,
      idleTtlSeconds: 0.05
    });
    try {
      await store.acquire("s1");
      for (let i = 0; i < 6; i++) {
        await new Promise((r) => setTimeout(r, 10));
        store.touch("s1");
      }
      await store._sweepForTests();
      expect(created[0].sandbox.released).toBe(false);
    } finally {
      await store.close();
    }
  });

  it("keeps a warm pool topped up and uses a pre-warmed sandbox on first acquire", async () => {
    const { provider, created } = makeProvider();
    const store = new SessionStore({
      provider,
      sweepIntervalMs: 60_000,
      warmPoolSize: 2
    });
    try {
      // Wait for the warm pool to fill in the background.
      for (let i = 0; i < 50 && store.warmCount() < 2; i++) {
        await new Promise((r) => setTimeout(r, 5));
      }
      expect(store.warmCount()).toBe(2);
      const warmIds = created.map((c) => c.sessionId);
      expect(warmIds.every((id) => id.startsWith("warm-"))).toBe(true);

      const sb = await store.acquire("real-1");
      expect(sb.sessionId).toMatch(/^warm-/);
      expect(store.warmCount()).toBeGreaterThanOrEqual(1);
    } finally {
      await store.close();
    }
  });

  it("bypasses the warm pool when per-call options are provided", async () => {
    const { provider, created } = makeProvider();
    const store = new SessionStore({
      provider,
      sweepIntervalMs: 60_000,
      warmPoolSize: 1
    });
    try {
      for (let i = 0; i < 50 && store.warmCount() < 1; i++) {
        await new Promise((r) => setTimeout(r, 5));
      }
      expect(store.warmCount()).toBe(1);

      // Per-call options must NOT be silently dropped by taking a warm
      // sandbox that was created with defaults.
      const sb = await store.acquire("with-opts", {
        workspaceDir: "/mnt/work"
      });
      expect(sb.sessionId).toBe("with-opts");
      expect(store.warmCount()).toBe(1);
      // The last created record is the with-opts sandbox, provisioned fresh.
      expect(created[created.length - 1].sessionId).toBe("with-opts");
    } finally {
      await store.close();
    }
  });

  it("close() releases every active and warm sandbox", async () => {
    const { provider, created } = makeProvider();
    const store = new SessionStore({
      provider,
      sweepIntervalMs: 60_000,
      warmPoolSize: 1
    });
    await store.acquire("s1");
    for (let i = 0; i < 50 && store.warmCount() < 1; i++) {
      await new Promise((r) => setTimeout(r, 5));
    }
    await store.close();
    expect(created.every((c) => c.sandbox.released)).toBe(true);
  });
});
