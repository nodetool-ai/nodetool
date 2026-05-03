import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
import type { Context } from "../src/trpc/context.js";

vi.mock("node:child_process", () => ({
  execFile: vi.fn()
}));

import { execFile } from "node:child_process";

const createCaller = createCallerFactory(appRouter);

function makeCtx(overrides: Partial<Context> = {}): Context {
  return {
    userId: "user-1",
    registry: {} as never,
    apiOptions: { metadataRoots: [], registry: {} as never } as never,
    pythonBridge: {} as never,
    getPythonBridgeReady: () => false,
    ...overrides
  };
}

type ExecFileCallback = (error: Error | null, stdout: string, stderr: string) => void;
type DockerMockStep =
  | {
      kind: "ok";
      stdout: string;
    }
  | {
      kind: "error";
      stderr: string;
    };

function mockDockerSteps(steps: DockerMockStep[]): void {
  const mockExecFile = execFile as unknown as ReturnType<typeof vi.fn>;
  mockExecFile.mockReset();
  steps.forEach((step) => {
    mockExecFile.mockImplementationOnce(
      (_cmd: string, _args: string[], _options: unknown, callback: ExecFileCallback) => {
        if (step.kind === "ok") {
          callback(null, step.stdout, "");
          return;
        }
        const error = new Error("docker failed") as Error & { stderr?: string };
        error.stderr = step.stderr;
        callback(error, "", step.stderr);
      }
    );
  });
}

function ownedInspect(id: string, created: string) {
  return {
    Id: id,
    Name: `/nodetool-sandbox-${id}`,
    Created: created,
    State: { Status: "running" },
    Config: {
      Labels: {
        "com.nodetool.sandbox.managed": "true",
        "com.nodetool.sandbox.owner": "user-1"
      }
    },
    NetworkSettings: {
      Ports: {
        "6080/tcp": [{ HostIp: "127.0.0.1", HostPort: "36123" }]
      }
    }
  };
}

describe("sandboxes router", () => {
  beforeEach(() => {
    (execFile as unknown as ReturnType<typeof vi.fn>).mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("requires authentication", async () => {
    const caller = createCaller(makeCtx({ userId: null }));
    await expect(caller.sandboxes.list()).rejects.toMatchObject({
      code: "UNAUTHORIZED"
    });
  });

  it("lists only owned managed sandbox with CPU/RAM and loopback VNC URLs", async () => {
    const now = new Date(Date.now() - 120_000).toISOString();
    const ps = `${JSON.stringify({
      ID: "abc123",
      Names: "nodetool-sandbox-abc123",
      State: "running",
      Status: "Up 2 minutes"
    })}\n`;
    const inspect = JSON.stringify([ownedInspect("abc123", now)]);
    const stats = `${JSON.stringify({
      ID: "abc123",
      CPUPerc: "12.50%",
      MemUsage: "128MiB / 2GiB"
    })}\n`;
    mockDockerSteps([
      { kind: "ok", stdout: ps },
      { kind: "ok", stdout: inspect },
      { kind: "ok", stdout: stats }
    ]);

    const caller = createCaller(makeCtx());
    const result = await caller.sandboxes.list();

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      container_id: "abc123",
      name: "nodetool-sandbox-abc123",
      status: "running",
      status_text: "running",
      cpu_percent: 12.5,
      vnc_http_url: "http://127.0.0.1:36123",
      vnc_ws_url: "ws://127.0.0.1:36123"
    });
    expect(result[0]?.memory_usage_bytes).toBe(134_217_728);
    expect(result[0]?.memory_limit_bytes).toBe(2_147_483_648);
    expect(result[0]?.age_seconds).toBeGreaterThanOrEqual(100);
  });

  it("enforces one-sandbox-per-user policy", async () => {
    const now = new Date().toISOString();
    const ps = [
      { ID: "a1", Names: "nodetool-sandbox-a1" },
      { ID: "a2", Names: "nodetool-sandbox-a2" }
    ]
      .map((row) => JSON.stringify(row))
      .join("\n");
    const inspect = JSON.stringify([ownedInspect("a1", now), ownedInspect("a2", now)]);
    mockDockerSteps([
      { kind: "ok", stdout: `${ps}\n` },
      { kind: "ok", stdout: inspect }
    ]);

    const caller = createCaller(makeCtx());
    await expect(caller.sandboxes.list()).rejects.toMatchObject({
      code: "FORBIDDEN"
    });
  });

  it("blocks actions for containers not owned by current user", async () => {
    const now = new Date().toISOString();
    const inspect = JSON.stringify([
      {
        ...ownedInspect("abc123", now),
        Config: {
          Labels: {
            "com.nodetool.sandbox.managed": "true",
            "com.nodetool.sandbox.owner": "other-user"
          }
        }
      }
    ]);
    mockDockerSteps([{ kind: "ok", stdout: inspect }]);

    const caller = createCaller(makeCtx());
    await expect(
      caller.sandboxes.pause({ container_id: "abc123" })
    ).rejects.toMatchObject({
      code: "FORBIDDEN"
    });
  });

  it("propagates docker failures for lifecycle actions", async () => {
    const now = new Date().toISOString();
    const inspect = JSON.stringify([ownedInspect("abc123", now)]);
    mockDockerSteps([
      { kind: "ok", stdout: inspect },
      { kind: "error", stderr: "No such container: abc123" }
    ]);

    const caller = createCaller(makeCtx());
    await expect(
      caller.sandboxes.pause({ container_id: "abc123" })
    ).rejects.toMatchObject({
      code: "NOT_FOUND"
    });
  });

  it("parses live tool call log entries for owned sandbox", async () => {
    const now = new Date().toISOString();
    const inspect = JSON.stringify([ownedInspect("abc123", now)]);
    const logs = [
      "2026-04-19T22:00:00.000000000Z shell_exec running command",
      "2026-04-19T22:00:01.000000000Z browser_navigate https://example.com",
      "2026-04-19T22:00:02.000000000Z random line"
    ].join("\n");

    mockDockerSteps([
      { kind: "ok", stdout: inspect },
      { kind: "ok", stdout: logs }
    ]);

    const caller = createCaller(makeCtx());
    const result = await caller.sandboxes.toolCalls({
      container_id: "abc123",
      limit: 20
    });

    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({
      tool_name: "shell_exec",
      timestamp: "2026-04-19T22:00:00.000000000Z"
    });
    expect(result[1]).toMatchObject({
      tool_name: "browser_navigate"
    });
    expect(result[2]).toMatchObject({
      tool_name: null,
      message: "random line"
    });
  });
});
