import { describe, it, expect, vi, beforeEach } from "vitest";

const runInSandbox = vi.fn(async () => ({
  success: true as const,
  result: { ok: true }
}));

vi.mock("@nodetool-ai/agents/js-sandbox", () => ({
  runInSandbox
}));

// Import the source module so vitest processes it and the mock above applies.
const { CodeNode } = await import("../src/nodes/code-node");

/** The `limits` object handed to the sandbox by the last call. */
function lastLimits(): Record<string, unknown> {
  const call = runInSandbox.mock.calls.at(-1) as unknown as [
    { limits?: Record<string, unknown> }
  ];
  return call[0].limits ?? {};
}

describe("CodeNode — sandbox limits", () => {
  beforeEach(() => {
    runInSandbox.mockClear();
  });

  it("converts max_response_mb to bytes", async () => {
    await new CodeNode({ code: "return {}", max_response_mb: 5 }).process();
    expect(lastLimits().maxResponseBodyBytes).toBe(5 * 1024 * 1024);
  });

  it("defaults max_response_mb to one megabyte", async () => {
    await new CodeNode({ code: "return {}" }).process();
    expect(lastLimits().maxResponseBodyBytes).toBe(1024 * 1024);
  });

  it("does not clamp above the sandbox ceiling — the sandbox does that", async () => {
    await new CodeNode({ code: "return {}", max_response_mb: 500 }).process();
    expect(lastLimits().maxResponseBodyBytes).toBe(500 * 1024 * 1024);
  });

  it("does not send a userAgent", async () => {
    await new CodeNode({ code: "return {}" }).process();
    expect(lastLimits().userAgent).toBeUndefined();
  });

  it("passes limits on the streaming path too", async () => {
    runInSandbox.mockResolvedValueOnce({
      success: true as const,
      result: [{ a: 1 }]
    } as never);
    const node = new CodeNode({ code: "yield({ a: 1 });", max_response_mb: 3 });
    for await (const _ of node.genProcess()) {
      // drain
    }
    expect(lastLimits().maxResponseBodyBytes).toBe(3 * 1024 * 1024);
  });
});
