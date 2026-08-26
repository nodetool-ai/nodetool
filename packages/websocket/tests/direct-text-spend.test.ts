/**
 * The up-front price a managed `generate_text` call reserves.
 *
 * The reservation is what stops concurrent calls from each admitting against
 * a balance none of them has spent yet, so two things must hold: the figure
 * is a real number for a curated model, and it over-books rather than
 * under-books the answer that comes back.
 */
import { describe, it, expect } from "vitest";
import { estimateDirectTextSpend } from "../src/unified-websocket-runner.js";

const messages = (chars: number) => [{ content: "x".repeat(chars) }];

describe("estimateDirectTextSpend", () => {
  it("prices a curated model through its delegate", () => {
    // nodetool/director delegates to anthropic/claude-sonnet-5; without the
    // delegate lookup the curated id prices at zero and reserves nothing.
    const usd = estimateDirectTextSpend({
      provider: "nodetool",
      model: "nodetool/director",
      messages: messages(3000),
      maxTokens: 8192
    });
    expect(usd).toBeGreaterThan(0);
  });

  it("matches what the same call costs on the delegate directly", () => {
    const managed = estimateDirectTextSpend({
      provider: "nodetool",
      model: "nodetool/director",
      messages: messages(3000),
      maxTokens: 8192
    });
    const byok = estimateDirectTextSpend({
      provider: "anthropic",
      model: "claude-sonnet-5",
      messages: messages(3000),
      maxTokens: 8192
    });
    expect(managed).toBeCloseTo(byok, 10);
  });

  it("grows with the prompt and with the output budget", () => {
    const base = estimateDirectTextSpend({
      provider: "anthropic",
      model: "claude-sonnet-5",
      messages: messages(3000),
      maxTokens: 1000
    });
    const longerPrompt = estimateDirectTextSpend({
      provider: "anthropic",
      model: "claude-sonnet-5",
      messages: messages(30000),
      maxTokens: 1000
    });
    const biggerBudget = estimateDirectTextSpend({
      provider: "anthropic",
      model: "claude-sonnet-5",
      messages: messages(3000),
      maxTokens: 8192
    });
    expect(longerPrompt).toBeGreaterThan(base);
    expect(biggerBudget).toBeGreaterThan(base);
  });

  it("assumes an output budget when the request names none", () => {
    const unbounded = estimateDirectTextSpend({
      provider: "anthropic",
      model: "claude-sonnet-5",
      messages: messages(100)
    });
    expect(unbounded).toBeGreaterThan(0);
  });

  it("estimates zero for a model no catalog prices", () => {
    // The gate still admits against the balance; the real cost is recorded
    // when the call returns.
    const usd = estimateDirectTextSpend({
      provider: "nodetool",
      model: "nodetool/not-a-real-model",
      messages: messages(3000),
      maxTokens: 8192
    });
    expect(usd).toBe(0);
  });
});
