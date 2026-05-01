/**
 * Tests for src/stdin.ts
 *
 * Tests slash-command handling, direct chat, WebSocket chat, and agent mode
 * by mocking readline.createInterface and all external dependencies.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// ─── Top-level mocks (hoisted by vitest) ─────────────────────────────────────

// Controllable readline mock — each test sets _nextLines before calling runStdinMode
let _nextLines: string[] = [];

vi.mock("node:readline", () => ({
  default: {
    createInterface: vi.fn(() => ({
      [Symbol.asyncIterator]: async function* () {
        for (const line of _nextLines) yield line;
      }
    }))
  },
  createInterface: vi.fn(() => ({
    [Symbol.asyncIterator]: async function* () {
      for (const line of _nextLines) yield line;
    }
  }))
}));

vi.mock("@nodetool-ai/models", () => ({
  getSecret: vi.fn(async () => null)
}));

vi.mock("@nodetool-ai/runtime", () => ({
  ProcessingContext: class {
    constructor(_o?: unknown) {}
  }
}));

vi.mock("@nodetool-ai/chat", () => ({
  processChat: vi.fn(
    async (_opts: {
      userInput: string;
      messages: unknown[];
      model: string;
      provider: unknown;
      context: unknown;
      tools: unknown[];
      callbacks: { onChunk: (t: string) => void };
    }) => {
      _opts.callbacks.onChunk("response");
    }
  )
}));

vi.mock("@nodetool-ai/agents", () => ({
  Agent: class {
    constructor(public opts: unknown) {}
    // eslint-disable-next-line @typescript-eslint/require-await
    async *execute(_ctx?: unknown) {}
  }
}));

let _mockCancelJobSpy = vi.fn();
let _mockGetStatusSpy = vi.fn();
let _mockStopSpy = vi.fn();

vi.mock("../src/websocket-client.js", () => ({
  WebSocketChatClient: class {
    constructor(_url: string) {}
    async connect() {}
    disconnect() {}
    async *chat(): AsyncGenerator<{ type: string; content?: string }> {
      yield { type: "chunk", content: "ws-response" };
      yield { type: "done" };
    }
    async *runJob(_opts: unknown): AsyncGenerator<{ type: string }> {
      yield { type: "job_update", status: "completed" };
      yield { type: "done" };
    }
    async *reconnectJob(_id: string): AsyncGenerator<{ type: string }> {
      yield { type: "job_update", status: "completed" };
      yield { type: "done" };
    }
    async *resumeJob(_id: string): AsyncGenerator<{ type: string }> {
      yield { type: "job_update", status: "completed" };
      yield { type: "done" };
    }
    cancelJob(id: string) {
      _mockCancelJobSpy(id);
    }
    getStatus(id?: string) {
      _mockGetStatusSpy(id);
    }
    stop(threadId?: string) {
      _mockStopSpy(threadId);
    }
  }
}));

vi.mock("../src/providers.js", () => ({
  createProvider: vi.fn(async () => ({ id: "openai" })),
  WebSocketProvider: class {
    constructor(_client: unknown, _model: string, _provider: string) {}
  }
}));

// ─── Captured I/O helpers ─────────────────────────────────────────────────────

let stdoutLines: string[];
let stderrLines: string[];

function captureIO() {
  stdoutLines = [];
  stderrLines = [];
  vi.spyOn(process.stdout, "write").mockImplementation((data: unknown) => {
    stdoutLines.push(String(data));
    return true;
  });
  vi.spyOn(process.stderr, "write").mockImplementation((data: unknown) => {
    stderrLines.push(String(data));
    return true;
  });
}

function releaseIO() {
  vi.restoreAllMocks();
}

// ─── Import runStdinMode once ─────────────────────────────────────────────────

import { runStdinMode } from "../src/stdin.js";

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("runStdinMode — empty / whitespace input", () => {
  beforeEach(captureIO);
  afterEach(releaseIO);

  it("completes without error when all lines are empty", async () => {
    _nextLines = ["", "   ", "\t"];
    await expect(
      runStdinMode({
        provider: "openai",
        model: "gpt-4o",
        workspaceDir: "/tmp"
      })
    ).resolves.toBeUndefined();
  });
});

describe("runStdinMode — slash commands without wsUrl", () => {
  beforeEach(captureIO);
  afterEach(releaseIO);

  it("writes 'Slash commands require --url' to stderr", async () => {
    _nextLines = ["/help"];
    await runStdinMode({
      provider: "openai",
      model: "gpt-4o",
      workspaceDir: "/tmp"
    });
    expect(stderrLines.some((s) => s.includes("Slash commands require"))).toBe(
      true
    );
  });
});

describe("runStdinMode — /help command", () => {
  beforeEach(captureIO);
  afterEach(releaseIO);

  it("writes available commands list to stdout", async () => {
    _nextLines = ["/help"];
    await runStdinMode({
      provider: "openai",
      model: "gpt-4o",
      workspaceDir: "/tmp",
      wsUrl: "ws://test"
    });
    expect(stdoutLines.some((s) => s.includes("Available commands"))).toBe(
      true
    );
  });
});

describe("runStdinMode — /stop command", () => {
  beforeEach(() => {
    _mockStopSpy = vi.fn();
    captureIO();
  });
  afterEach(releaseIO);

  it("calls stop() and writes 'Stop requested' to stderr", async () => {
    _nextLines = ["/stop"];
    await runStdinMode({
      provider: "openai",
      model: "gpt-4o",
      workspaceDir: "/tmp",
      wsUrl: "ws://test"
    });
    expect(stderrLines.some((s) => s.includes("Stop requested"))).toBe(true);
  });
});

describe("runStdinMode — /cancel command", () => {
  beforeEach(() => {
    _mockCancelJobSpy = vi.fn();
    captureIO();
  });
  afterEach(releaseIO);

  it("calls cancelJob and writes confirmation to stderr", async () => {
    _nextLines = ["/cancel job-abc"];
    await runStdinMode({
      provider: "openai",
      model: "gpt-4o",
      workspaceDir: "/tmp",
      wsUrl: "ws://test"
    });
    expect(_mockCancelJobSpy).toHaveBeenCalledWith("job-abc");
    expect(stderrLines.some((s) => s.includes("job-abc"))).toBe(true);
  });

  it("writes usage hint when job_id is missing", async () => {
    _nextLines = ["/cancel"];
    await runStdinMode({
      provider: "openai",
      model: "gpt-4o",
      workspaceDir: "/tmp",
      wsUrl: "ws://test"
    });
    expect(stderrLines.some((s) => s.includes("Usage:"))).toBe(true);
    expect(_mockCancelJobSpy).not.toHaveBeenCalled();
  });
});

describe("runStdinMode — /reconnect command", () => {
  beforeEach(captureIO);
  afterEach(releaseIO);

  it("writes reconnection message to stderr", async () => {
    _nextLines = ["/reconnect job-xyz"];
    await runStdinMode({
      provider: "openai",
      model: "gpt-4o",
      workspaceDir: "/tmp",
      wsUrl: "ws://test"
    });
    expect(stderrLines.some((s) => s.includes("job-xyz"))).toBe(true);
  });

  it("writes usage hint when job_id is missing", async () => {
    _nextLines = ["/reconnect"];
    await runStdinMode({
      provider: "openai",
      model: "gpt-4o",
      workspaceDir: "/tmp",
      wsUrl: "ws://test"
    });
    expect(stderrLines.some((s) => s.includes("Usage:"))).toBe(true);
  });
});

describe("runStdinMode — /resume command", () => {
  beforeEach(captureIO);
  afterEach(releaseIO);

  it("writes resume message to stderr", async () => {
    _nextLines = ["/resume job-r1"];
    await runStdinMode({
      provider: "openai",
      model: "gpt-4o",
      workspaceDir: "/tmp",
      wsUrl: "ws://test"
    });
    expect(stderrLines.some((s) => s.includes("job-r1"))).toBe(true);
  });

  it("writes usage hint when job_id is missing", async () => {
    _nextLines = ["/resume"];
    await runStdinMode({
      provider: "openai",
      model: "gpt-4o",
      workspaceDir: "/tmp",
      wsUrl: "ws://test"
    });
    expect(stderrLines.some((s) => s.includes("Usage:"))).toBe(true);
  });
});

describe("runStdinMode — /status command", () => {
  beforeEach(() => {
    _mockGetStatusSpy = vi.fn();
    captureIO();
  });
  afterEach(releaseIO);

  it("calls getStatus(jobId) and writes message to stderr", async () => {
    _nextLines = ["/status job-s1"];
    await runStdinMode({
      provider: "openai",
      model: "gpt-4o",
      workspaceDir: "/tmp",
      wsUrl: "ws://test"
    });
    expect(_mockGetStatusSpy).toHaveBeenCalledWith("job-s1");
    expect(stderrLines.some((s) => s.includes("job-s1"))).toBe(true);
  });

  it("calls getStatus() with no arg for all jobs", async () => {
    _nextLines = ["/status"];
    await runStdinMode({
      provider: "openai",
      model: "gpt-4o",
      workspaceDir: "/tmp",
      wsUrl: "ws://test"
    });
    expect(_mockGetStatusSpy).toHaveBeenCalledWith(undefined);
  });
});

describe("runStdinMode — unknown command", () => {
  beforeEach(captureIO);
  afterEach(releaseIO);

  it("writes 'Unknown command' to stderr", async () => {
    _nextLines = ["/notacommand"];
    await runStdinMode({
      provider: "openai",
      model: "gpt-4o",
      workspaceDir: "/tmp",
      wsUrl: "ws://test"
    });
    expect(stderrLines.some((s) => s.includes("Unknown command"))).toBe(true);
  });
});

describe("runStdinMode — direct provider chat", () => {
  beforeEach(captureIO);
  afterEach(releaseIO);

  it("calls processChat for regular messages without wsUrl", async () => {
    const { processChat } = await import("@nodetool-ai/chat");
    (processChat as ReturnType<typeof vi.fn>).mockClear();
    _nextLines = ["Hello AI"];
    await runStdinMode({
      provider: "openai",
      model: "gpt-4o",
      workspaceDir: "/tmp"
    });
    expect(processChat).toHaveBeenCalled();
  });
});

describe("runStdinMode — WebSocket chat", () => {
  beforeEach(captureIO);
  afterEach(releaseIO);

  it("writes chunk content to stdout when using wsUrl", async () => {
    _nextLines = ["Hello WS"];
    await runStdinMode({
      provider: "openai",
      model: "gpt-4o",
      workspaceDir: "/tmp",
      wsUrl: "ws://test"
    });
    expect(stdoutLines.some((s) => s.includes("ws-response"))).toBe(true);
  });
});

describe("runStdinMode — /run command", () => {
  beforeEach(captureIO);
  afterEach(releaseIO);

  it("writes 'Running workflow' to stderr", async () => {
    _nextLines = ["/run my-workflow"];
    await runStdinMode({
      provider: "openai",
      model: "gpt-4o",
      workspaceDir: "/tmp",
      wsUrl: "ws://test"
    });
    expect(stderrLines.some((s) => s.includes("my-workflow"))).toBe(true);
  });

  it("writes usage hint when workflow_id is missing", async () => {
    _nextLines = ["/run"];
    await runStdinMode({
      provider: "openai",
      model: "gpt-4o",
      workspaceDir: "/tmp",
      wsUrl: "ws://test"
    });
    expect(stderrLines.some((s) => s.includes("Usage:"))).toBe(true);
  });

  it("writes invalid JSON error when params are malformed", async () => {
    _nextLines = ["/run wf1 {not-json}"];
    await runStdinMode({
      provider: "openai",
      model: "gpt-4o",
      workspaceDir: "/tmp",
      wsUrl: "ws://test"
    });
    expect(stderrLines.some((s) => s.includes("Invalid JSON"))).toBe(true);
  });
});
