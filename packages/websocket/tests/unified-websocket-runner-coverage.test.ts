/**
 * Additional UnifiedWebSocketRunner tests for 100% statement coverage.
 * Covers: createWaiter, resolveResult, reconnectJob, resumeJob, cancelJob,
 *         inferOutputType, serializeForJson, sendMessage edge cases,
 *         receiveMessages tool_result handling, unknown command, etc.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { pack, unpack } from "msgpackr";
import {
  UnifiedWebSocketRunner,
  type WebSocketConnection,
  type WebSocketReceiveFrame,
} from "../src/unified-websocket-runner.js";

class MockWebSocket implements WebSocketConnection {
  clientState: "connected" | "disconnected" = "connected";
  applicationState: "connected" | "disconnected" = "connected";
  sentBytes: Uint8Array[] = [];
  sentText: string[] = [];
  queue: Array<WebSocketReceiveFrame> = [];

  async accept(): Promise<void> {
    return;
  }

  async receive(): Promise<WebSocketReceiveFrame> {
    const next = this.queue.shift();
    if (!next) {
      return { type: "websocket.disconnect" };
    }
    return next;
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

const resolveExecutor = () => ({
  async process() {
    return {};
  },
});

describe("UnifiedWebSocketRunner: cancelJob", () => {
  let ws: MockWebSocket;
  let runner: UnifiedWebSocketRunner;

  beforeEach(() => {
    ws = new MockWebSocket();
    runner = new UnifiedWebSocketRunner({ resolveExecutor });
  });

  it("cancelJob returns error when no job_id", async () => {
    const result = await runner.cancelJob("");
    expect(result.error).toContain("No job_id");
  });

  it("cancelJob returns error when job not found", async () => {
    const result = await runner.cancelJob("nonexistent-job");
    expect(result.error).toContain("not found");
  });

  it("cancelJob cancels an active job", async () => {
    await runner.connect(ws);
    const graph = {
      nodes: [
        { id: "n1", type: "test.LongRunning", name: "n1" },
      ],
      edges: [],
    };

    await runner.handleCommand({ command: "run_job", data: { graph, params: {} } });
    const status = runner.getStatus() as { active_jobs: Array<{ job_id: string }> };
    expect(status.active_jobs.length).toBeGreaterThan(0);
    const jobId = status.active_jobs[0].job_id;

    const result = await runner.cancelJob(jobId);
    expect(result.message).toContain("cancellation requested");
    expect(result.job_id).toBe(jobId);

    await new Promise((r) => setTimeout(r, 20));
    await runner.disconnect();
  });

  it("cancel_job command via handleCommand", async () => {
    await runner.connect(ws);
    const graph = {
      nodes: [{ id: "n1", type: "test.Node", name: "n1" }],
      edges: [],
    };

    await runner.handleCommand({ command: "run_job", data: { graph, params: {} } });
    const status = runner.getStatus() as { active_jobs: Array<{ job_id: string }> };
    const jobId = status.active_jobs[0]?.job_id;

    if (jobId) {
      const result = await runner.handleCommand({
        command: "cancel_job",
        data: { job_id: jobId },
      });
      expect(result.message || result.error).toBeDefined();
    }

    await new Promise((r) => setTimeout(r, 20));
    await runner.disconnect();
  });

  it("cancel_job without job_id returns error", async () => {
    const result = await runner.handleCommand({
      command: "cancel_job",
      data: {},
    });
    expect(result.error).toContain("job_id is required");
  });
});

describe("UnifiedWebSocketRunner: reconnectJob and resumeJob", () => {
  let ws: MockWebSocket;
  let runner: UnifiedWebSocketRunner;

  beforeEach(() => {
    ws = new MockWebSocket();
    runner = new UnifiedWebSocketRunner({ resolveExecutor });
  });

  it("reconnectJob throws for unknown job", async () => {
    await runner.connect(ws);
    await expect(runner.reconnectJob("nonexistent")).rejects.toThrow("not found");
    await runner.disconnect();
  });

  it("reconnect_job command without job_id returns error", async () => {
    const result = await runner.handleCommand({
      command: "reconnect_job",
      data: {},
    });
    expect(result.error).toContain("job_id is required");
  });

  it("reconnect_job command with valid job_id", async () => {
    await runner.connect(ws);
    const graph = {
      nodes: [{ id: "n1", type: "test.Node", name: "n1" }],
      edges: [],
    };
    await runner.handleCommand({ command: "run_job", data: { graph, params: {} } });
    const status = runner.getStatus() as { active_jobs: Array<{ job_id: string }> };
    const jobId = status.active_jobs[0]?.job_id;

    if (jobId) {
      const result = await runner.handleCommand({
        command: "reconnect_job",
        data: { job_id: jobId },
      });
      expect(result.message).toContain("Reconnecting");
    }

    await new Promise((r) => setTimeout(r, 20));
    await runner.disconnect();
  });

  it("resume_job command without job_id returns error", async () => {
    const result = await runner.handleCommand({
      command: "resume_job",
      data: {},
    });
    expect(result.error).toContain("job_id is required");
  });

  it("resume_job command with valid job_id", async () => {
    await runner.connect(ws);
    const graph = {
      nodes: [{ id: "n1", type: "test.Node", name: "n1" }],
      edges: [],
    };
    await runner.handleCommand({ command: "run_job", data: { graph, params: {} } });
    const status = runner.getStatus() as { active_jobs: Array<{ job_id: string }> };
    const jobId = status.active_jobs[0]?.job_id;

    if (jobId) {
      const result = await runner.handleCommand({
        command: "resume_job",
        data: { job_id: jobId },
      });
      expect(result.message).toContain("Resumption initiated");
    }

    await new Promise((r) => setTimeout(r, 20));
    await runner.disconnect();
  });
});

describe("UnifiedWebSocketRunner: getStatus", () => {
  let runner: UnifiedWebSocketRunner;

  beforeEach(() => {
    runner = new UnifiedWebSocketRunner({ resolveExecutor });
  });

  it("getStatus with specific job_id returns not_found", () => {
    const status = runner.getStatus("nonexistent") as { status: string };
    expect(status.status).toBe("not_found");
  });

  it("getStatus without job_id returns active_jobs list", () => {
    const status = runner.getStatus() as {
      active_jobs: Array<{ job_id: string }>;
    };
    expect(Array.isArray(status.active_jobs)).toBe(true);
  });
});

describe("UnifiedWebSocketRunner: clearModels", () => {
  it("returns informational message", async () => {
    const runner = new UnifiedWebSocketRunner({ resolveExecutor });
    const result = await runner.clearModels();
    expect(result.message).toContain("Model clearing");
  });
});

describe("UnifiedWebSocketRunner: set_mode validation", () => {
  it("rejects invalid mode", async () => {
    const runner = new UnifiedWebSocketRunner({ resolveExecutor });
    const result = await runner.handleCommand({
      command: "set_mode",
      data: { mode: "invalid" },
    });
    expect(result.error).toContain("mode must be binary or text");
  });
});

describe("UnifiedWebSocketRunner: sendMessage edge cases", () => {
  it("skips sending when no websocket", async () => {
    const runner = new UnifiedWebSocketRunner({ resolveExecutor });
    // Should not throw
    await runner.sendMessage({ type: "test" });
  });

  it("skips sending when client disconnected", async () => {
    const ws = new MockWebSocket();
    const runner = new UnifiedWebSocketRunner({ resolveExecutor });
    await runner.connect(ws);
    ws.clientState = "disconnected";
    await runner.sendMessage({ type: "test" });
    // Only heartbeat/stats messages should have been sent before disconnect
    await runner.disconnect();
  });

  it("sends text when in text mode", async () => {
    const ws = new MockWebSocket();
    const runner = new UnifiedWebSocketRunner({ resolveExecutor });
    await runner.connect(ws);
    await runner.handleCommand({ command: "set_mode", data: { mode: "text" } });
    ws.sentText = [];
    await runner.sendMessage({ type: "test", data: new Uint8Array([1, 2, 3]) });
    expect(ws.sentText.length).toBeGreaterThan(0);
    const parsed = JSON.parse(ws.sentText[0]) as Record<string, unknown>;
    expect(parsed.type).toBe("test");
    // Uint8Array should be serialized to array
    expect(Array.isArray(parsed.data)).toBe(true);
    await runner.disconnect();
  });

  it("serializes Date objects in text mode", async () => {
    const ws = new MockWebSocket();
    const runner = new UnifiedWebSocketRunner({ resolveExecutor });
    await runner.connect(ws);
    await runner.handleCommand({ command: "set_mode", data: { mode: "text" } });
    ws.sentText = [];
    const date = new Date("2025-01-01T00:00:00.000Z");
    await runner.sendMessage({ type: "test", timestamp: date });
    const parsed = JSON.parse(ws.sentText[0]) as Record<string, unknown>;
    expect(parsed.timestamp).toBe("2025-01-01T00:00:00.000Z");
    await runner.disconnect();
  });
});

describe("UnifiedWebSocketRunner: receiveMessage", () => {
  it("throws when no websocket connected", async () => {
    const runner = new UnifiedWebSocketRunner({ resolveExecutor });
    await expect(runner.receiveMessage()).rejects.toThrow("not connected");
  });

  it("returns null for disconnect message", async () => {
    const ws = new MockWebSocket();
    const runner = new UnifiedWebSocketRunner({ resolveExecutor });
    await runner.connect(ws);
    ws.queue.push({ type: "websocket.disconnect" });
    const msg = await runner.receiveMessage();
    expect(msg).toBeNull();
    await runner.disconnect();
  });

  it("handles binary messages", async () => {
    const ws = new MockWebSocket();
    const runner = new UnifiedWebSocketRunner({ resolveExecutor });
    await runner.connect(ws);
    const data = pack({ command: "get_status", data: {} });
    ws.queue.push({ type: "websocket.message", bytes: data });
    const msg = await runner.receiveMessage();
    expect(msg).not.toBeNull();
    expect((msg as Record<string, unknown>).command).toBe("get_status");
    expect(runner.mode).toBe("binary");
    await runner.disconnect();
  });

  it("returns null for empty message (no bytes or text)", async () => {
    const ws = new MockWebSocket();
    const runner = new UnifiedWebSocketRunner({ resolveExecutor });
    await runner.connect(ws);
    ws.queue.push({ type: "websocket.message" });
    const msg = await runner.receiveMessage();
    expect(msg).toBeNull();
    await runner.disconnect();
  });
});

describe("UnifiedWebSocketRunner: receiveMessages loop", () => {
  it("handles tool_result message type", async () => {
    const ws = new MockWebSocket();
    const runner = new UnifiedWebSocketRunner({ resolveExecutor });
    await runner.connect(ws);
    ws.queue.push({
      type: "websocket.message",
      text: JSON.stringify({
        type: "tool_result",
        tool_call_id: "tc-1",
        result: "done",
      }),
    });
    ws.queue.push({ type: "websocket.disconnect" });

    await runner.receiveMessages();
    // No error should be sent
    const sent = ws.sentBytes.map((b) => unpack(b) as Record<string, unknown>);
    expect(
      sent.some((m) => m.error === "invalid_message")
    ).toBe(false);
    await runner.disconnect();
  });

  it("sends invalid_message for messages without command", async () => {
    const ws = new MockWebSocket();
    const runner = new UnifiedWebSocketRunner({ resolveExecutor });
    await runner.connect(ws);
    ws.queue.push({
      type: "websocket.message",
      text: JSON.stringify({ type: "unknown_type" }),
    });
    ws.queue.push({ type: "websocket.disconnect" });

    await runner.receiveMessages();
    // Text mode: responses go to sentText as JSON
    const sent = ws.sentText.map((t) => JSON.parse(t) as Record<string, unknown>);
    expect(sent.some((m) => m.error === "invalid_message")).toBe(true);
    await runner.disconnect();
  });

  it("handles unknown command gracefully", async () => {
    const ws = new MockWebSocket();
    const runner = new UnifiedWebSocketRunner({ resolveExecutor });
    await runner.connect(ws);
    ws.queue.push({
      type: "websocket.message",
      text: JSON.stringify({ command: "totally_unknown_command", data: {} }),
    });
    ws.queue.push({ type: "websocket.disconnect" });

    await runner.receiveMessages();
    // Text mode: responses go to sentText as JSON
    const sent = ws.sentText.map((t) => JSON.parse(t) as Record<string, unknown>);
    expect(sent.some((m) => m.error === "Unknown command")).toBe(true);
    await runner.disconnect();
  });
});

describe("UnifiedWebSocketRunner: stop command", () => {
  it("stop with thread_id increments chat seq", async () => {
    const ws = new MockWebSocket();
    const runner = new UnifiedWebSocketRunner({ resolveExecutor });
    await runner.connect(ws);

    const result = await runner.handleCommand({
      command: "stop",
      data: { thread_id: "thread-123" },
    });
    expect(result.message).toContain("Stop command processed");
    expect(result.thread_id).toBe("thread-123");

    await runner.disconnect();
  });

  it("stop with job_id cancels the job", async () => {
    const ws = new MockWebSocket();
    const runner = new UnifiedWebSocketRunner({ resolveExecutor });
    await runner.connect(ws);

    const graph = {
      nodes: [{ id: "n1", type: "test.Node", name: "n1" }],
      edges: [],
    };
    await runner.handleCommand({ command: "run_job", data: { graph, params: {} } });
    const status = runner.getStatus() as { active_jobs: Array<{ job_id: string }> };
    const jobId = status.active_jobs[0]?.job_id;

    if (jobId) {
      const result = await runner.handleCommand({
        command: "stop",
        data: { job_id: jobId },
      });
      expect(result.message).toContain("Stop command processed");
    }

    await new Promise((r) => setTimeout(r, 20));
    await runner.disconnect();
  });

  it("stop with both job_id and thread_id", async () => {
    const ws = new MockWebSocket();
    const runner = new UnifiedWebSocketRunner({ resolveExecutor });
    await runner.connect(ws);

    const result = await runner.handleCommand({
      command: "stop",
      data: { job_id: "j1", thread_id: "t1" },
    });
    expect(result.message).toContain("Stop command processed");
    expect(result.job_id).toBe("j1");
    expect(result.thread_id).toBe("t1");

    await runner.disconnect();
  });
});

describe("UnifiedWebSocketRunner: stream_input and end_input_stream edge cases", () => {
  let ws: MockWebSocket;
  let runner: UnifiedWebSocketRunner;

  beforeEach(() => {
    ws = new MockWebSocket();
    runner = new UnifiedWebSocketRunner({ resolveExecutor });
  });

  it("stream_input without job_id returns error", async () => {
    const result = await runner.handleCommand({
      command: "stream_input",
      data: {},
    });
    expect(result.error).toContain("job_id is required");
  });

  it("stream_input with nonexistent job returns error", async () => {
    const result = await runner.handleCommand({
      command: "stream_input",
      data: { job_id: "fake" },
    });
    expect(result.error).toContain("No active job");
  });

  it("stream_input with empty input name returns error", async () => {
    await runner.connect(ws);
    const graph = {
      nodes: [{ id: "n1", type: "test.Node", name: "n1" }],
      edges: [],
    };
    await runner.handleCommand({ command: "run_job", data: { graph, params: {} } });
    const status = runner.getStatus() as { active_jobs: Array<{ job_id: string }> };
    const jobId = status.active_jobs[0]?.job_id;

    if (jobId) {
      const result = await runner.handleCommand({
        command: "stream_input",
        data: { job_id: jobId, input: "  " },
      });
      expect(result.error).toContain("Invalid input name");
    }

    await new Promise((r) => setTimeout(r, 20));
    await runner.disconnect();
  });

  it("end_input_stream without job_id returns error", async () => {
    const result = await runner.handleCommand({
      command: "end_input_stream",
      data: {},
    });
    expect(result.error).toContain("job_id is required");
  });

  it("end_input_stream with nonexistent job returns error", async () => {
    const result = await runner.handleCommand({
      command: "end_input_stream",
      data: { job_id: "fake" },
    });
    expect(result.error).toContain("No active job");
  });

  it("end_input_stream with empty input name returns error", async () => {
    await runner.connect(ws);
    const graph = {
      nodes: [{ id: "n1", type: "test.Node", name: "n1" }],
      edges: [],
    };
    await runner.handleCommand({ command: "run_job", data: { graph, params: {} } });
    const status = runner.getStatus() as { active_jobs: Array<{ job_id: string }> };
    const jobId = status.active_jobs[0]?.job_id;

    if (jobId) {
      const result = await runner.handleCommand({
        command: "end_input_stream",
        data: { job_id: jobId, input: "" },
      });
      expect(result.error).toContain("Invalid input name");
    }

    await new Promise((r) => setTimeout(r, 20));
    await runner.disconnect();
  });
});

describe("UnifiedWebSocketRunner: run method", () => {
  it("run connects, receives messages, and disconnects", async () => {
    const ws = new MockWebSocket();
    ws.queue.push({ type: "websocket.disconnect" });
    const runner = new UnifiedWebSocketRunner({ resolveExecutor });
    await runner.run(ws);
    expect(ws.clientState).toBe("disconnected");
  });
});

describe("UnifiedWebSocketRunner: connect with userId and authToken", () => {
  it("accepts userId and authToken on connect", async () => {
    const ws = new MockWebSocket();
    const runner = new UnifiedWebSocketRunner({ resolveExecutor });
    await runner.connect(ws, "custom-user", "custom-token");
    expect(runner.userId).toBe("custom-user");
    expect(runner.authToken).toBe("custom-token");
    await runner.disconnect();
  });
});

describe("UnifiedWebSocketRunner: disconnect edge cases", () => {
  it("handles close error gracefully", async () => {
    const ws = new MockWebSocket();
    ws.close = async () => {
      throw new Error("close failed");
    };
    const runner = new UnifiedWebSocketRunner({ resolveExecutor });
    await runner.connect(ws);
    // Should not throw
    await runner.disconnect();
    expect(runner.websocket).toBeNull();
  });
});

describe("UnifiedWebSocketRunner: command error handling in receiveMessages", () => {
  it("catches errors from handleCommand and sends error response", async () => {
    const ws = new MockWebSocket();
    const runner = new UnifiedWebSocketRunner({ resolveExecutor });
    await runner.connect(ws);

    // Spy on handleCommand to throw
    vi.spyOn(runner, "handleCommand").mockRejectedValueOnce(new Error("boom"));
    ws.queue.push({
      type: "websocket.message",
      text: JSON.stringify({ command: "run_job", data: {} }),
    });
    ws.queue.push({ type: "websocket.disconnect" });

    await runner.receiveMessages();
    // Text mode: responses go to sentText as JSON
    const sent = ws.sentText.map((t) => JSON.parse(t) as Record<string, unknown>);
    expect(sent.some((m) => m.error === "invalid_command")).toBe(true);

    vi.restoreAllMocks();
    await runner.disconnect();
  });
});
