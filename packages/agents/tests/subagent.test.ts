import { describe, it, expect, vi } from "vitest";
import { ProcessingContext } from "@nodetool-ai/runtime";
import type { ProcessingMessage, StepResult } from "@nodetool-ai/protocol";
import {
  enterSubAgentDepth,
  forwardSubAgentStream,
  settleResultValue,
  settleStepResult,
  tagSubAgentMessage
} from "../src/subagent.js";
import { SUBTASK_DEPTH_KEY } from "../src/tools/subtask-fields.js";

function stepResult(overrides: Partial<StepResult>): StepResult {
  return {
    type: "step_result",
    step_id: "s1",
    task_id: "t1",
    result: null,
    ...overrides
  } as StepResult;
}

function logMsg(content: string): ProcessingMessage {
  return {
    type: "log_update",
    node_id: "n",
    node_name: "n",
    content,
    severity: "info"
  } as ProcessingMessage;
}

describe("settleStepResult", () => {
  it("reports the protocol-level error field as failure", () => {
    expect(settleStepResult(stepResult({ error: "boom" }))).toEqual({
      ok: false,
      error: "boom"
    });
  });

  it("returns null when the step carried no result", () => {
    expect(settleStepResult(stepResult({ result: null }))).toBeNull();
  });

  it("treats the sole-key {error} failure payload as failure", () => {
    expect(
      settleStepResult(stepResult({ result: { error: "Step failed" } }))
    ).toEqual({ ok: false, error: "Step failed" });
  });

  it("without a schema, treats any string error property as failure", () => {
    expect(
      settleStepResult(stepResult({ result: { error: "bad", data: 1 } }))
    ).toEqual({ ok: false, error: "bad" });
  });

  it("with a schema, passes a multi-key result containing `error` through", () => {
    const result = { error: "none", data: 1 };
    expect(
      settleStepResult(stepResult({ result }), { hasOutputSchema: true })
    ).toEqual({ ok: true, result });
  });

  it("with a schema, preserves a sole-key {error} result", () => {
    const result = { error: "valid business field" };
    expect(
      settleStepResult(stepResult({ result }), {
        hasOutputSchema: true
      })
    ).toEqual({ ok: true, result });
  });

  it("passes prose results through", () => {
    expect(settleStepResult(stepResult({ result: "a report" }))).toEqual({
      ok: true,
      result: "a report"
    });
  });
});

describe("settleResultValue", () => {
  it("returns null for a step that produced nothing", () => {
    expect(settleResultValue(null)).toBeNull();
    expect(settleResultValue(undefined)).toBeNull();
  });

  it("treats a non-empty string `error` as the failure payload", () => {
    expect(settleResultValue({ error: "Step failed: boom" })).toEqual({
      ok: false,
      error: "Step failed: boom"
    });
  });

  it("does not treat an empty `error` string as a failure", () => {
    const result = { error: "" };
    expect(settleResultValue(result)).toEqual({ ok: true, result });
  });

  // An array is a fan-out step's per-item results. Whether it failed is a
  // question about its items, so the array itself never settles as a failure.
  it("never settles an array as a failure", () => {
    const result = [{ error: "a" }, { error: "b" }];
    expect(settleResultValue(result)).toEqual({ ok: true, result });
  });

  it("passes an object with `error` through when a schema declared it", () => {
    const result = { error: "a business field", data: 1 };
    expect(settleResultValue(result, { hasOutputSchema: true })).toEqual({
      ok: true,
      result
    });
  });
});

describe("tagSubAgentMessage", () => {
  it("returns the message unchanged when no tag applies", () => {
    const msg = logMsg("hi");
    expect(tagSubAgentMessage(msg, {})).toBe(msg);
  });

  it("clones and tags without mutating the original", () => {
    const msg = logMsg("hi");
    const tagged = tagSubAgentMessage(msg, {
      parentToolCallId: "call_1",
      depth: 2
    }) as unknown as Record<string, unknown>;
    expect(tagged.parent_tool_call_id).toBe("call_1");
    expect(tagged.subtask_depth).toBe(2);
    expect("parent_tool_call_id" in msg).toBe(false);
  });

  it("tags parent_tool_call_id alone when no depth is given", () => {
    const tagged = tagSubAgentMessage(logMsg("hi"), {
      parentToolCallId: "call_1"
    }) as unknown as Record<string, unknown>;
    expect(tagged.parent_tool_call_id).toBe("call_1");
    expect("subtask_depth" in tagged).toBe(false);
  });
});

describe("forwardSubAgentStream", () => {
  async function* producer(): AsyncGenerator<ProcessingMessage, string> {
    yield logMsg("one");
    yield logMsg("two");
    return "done";
  }

  it("forwards every tagged event and returns the generator's value", async () => {
    const seen: Array<Record<string, unknown>> = [];
    const out = await forwardSubAgentStream(producer(), {
      forward: (m) => {
        seen.push(m as unknown as Record<string, unknown>);
      },
      parentToolCallId: "call_9",
      depth: 1
    });
    expect(out).toEqual({ aborted: false, value: "done" });
    expect(seen.map((m) => m.content)).toEqual(["one", "two"]);
    expect(seen.every((m) => m.parent_tool_call_id === "call_9")).toBe(true);
    expect(seen.every((m) => m.subtask_depth === 1)).toBe(true);
  });

  it("a broken forwarder does not kill the stream", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const out = await forwardSubAgentStream(producer(), {
        forward: () => {
          throw new Error("socket gone");
        },
        label: "run_subtask"
      });
      expect(out).toEqual({ aborted: false, value: "done" });
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it("stops driving the generator once the signal aborts", async () => {
    const controller = new AbortController();
    let produced = 0;
    async function* slow(): AsyncGenerator<ProcessingMessage, string> {
      for (;;) {
        produced++;
        yield logMsg(`n${produced}`);
      }
    }
    const out = await forwardSubAgentStream(slow(), {
      forward: () => {
        if (produced === 2) controller.abort();
      },
      signal: controller.signal
    });
    expect(out).toEqual({ aborted: true, value: null });
    expect(produced).toBeLessThanOrEqual(3);
  });

  it("returns when aborted while waiting for the next event", async () => {
    const controller = new AbortController();
    let release: (() => void) | undefined;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });

    async function* blockedProducer(): AsyncGenerator<
      ProcessingMessage,
      string
    > {
      yield logMsg("first");
      await blocked;
      yield logMsg("second");
      return "done";
    }

    const resultPromise = forwardSubAgentStream(blockedProducer(), {
      forward: () => {
        controller.abort();
      },
      signal: controller.signal
    });

    try {
      await expect(resultPromise).resolves.toEqual({
        aborted: true,
        value: null
      });
    } finally {
      release?.();
    }
  });
});

describe("enterSubAgentDepth", () => {
  function makeCtx(): ProcessingContext {
    return new ProcessingContext({ jobId: "j", userId: "u" });
  }

  it("bumps the depth on a copied context, leaving the parent untouched", () => {
    const ctx = makeCtx();
    const gate = enterSubAgentDepth(ctx, 3);
    expect(gate.ok).toBe(true);
    if (gate.ok) {
      expect(gate.depth).toBe(1);
      expect(gate.childCtx.get<number>(SUBTASK_DEPTH_KEY)).toBe(1);
    }
    expect(ctx.get<number>(SUBTASK_DEPTH_KEY) ?? 0).toBe(0);
  });

  it("refuses past maxDepth with the standard error object", () => {
    const ctx = makeCtx();
    ctx.set(SUBTASK_DEPTH_KEY, 2);
    const gate = enterSubAgentDepth(ctx, 2, "search");
    expect(gate.ok).toBe(false);
    if (!gate.ok) {
      expect(gate.refusal.error).toBe("max_recursion_depth_reached");
      expect(gate.refusal.depth).toBe(2);
      expect(gate.refusal.max_depth).toBe(2);
      expect(String(gate.refusal.message)).toContain("another search");
    }
  });
});
