/**
 * Mutation-hardening tests for the context packer.
 *
 * Pins the token-budget arithmetic and the per-message token estimate at exact
 * boundaries: the keep/drop decisions reveal the precise token cost of each
 * message kind (null, string, text block, non-text block) and of the system
 * prompt. Costs are derived from the shared `countTokens` so the assertions
 * track the real js-tiktoken tokenization rather than a char-based proxy.
 * See MUTATION_TESTING.md.
 */
import { describe, it, expect } from "vitest";
import { packContext } from "../src/context-packer.js";
import { countTokens } from "../src/token-counter.js";
import type { Message } from "../src/providers/types.js";

const user = (content: Message["content"]): Message =>
  ({ role: "user", content }) as Message;

/**
 * Assert a message is kept when the budget exactly equals its token `cost` and
 * dropped when one token short. Requires `cost >= 2` so the short budget stays
 * above 0 and is not swallowed by the `remaining <= 0` short-circuit.
 */
function expectKeepDrop(msg: Message, cost: number): void {
  expect(cost).toBeGreaterThanOrEqual(2);
  expect(packContext([msg], "", cost).messages).toHaveLength(1);
  expect(packContext([msg], "", cost - 1).messages).toHaveLength(0);
}

describe("estimateMessageTokens — content kinds", () => {
  it("treats null/undefined content as 1 token (no crash)", () => {
    expect(packContext([user(null)], "", 1).messages).toHaveLength(1);
    expect(
      packContext([user(undefined as unknown as null)], "", 1).messages
    ).toHaveLength(1);
  });

  it("estimates a string by its token count, not as a block array", () => {
    // Iterating the string as a MessageContent[] would charge 25 tokens per
    // character; the real cost is just the token count of the text.
    const text = "the quick brown fox jumps";
    expectKeepDrop(user(text), countTokens(text));
  });

  it("sums text-block token counts across parts", () => {
    const a = "the quick brown fox";
    const b = "jumps over the lazy dog";
    const msg = user([
      { type: "text", text: a },
      { type: "text", text: b }
    ] as never);
    expectKeepDrop(msg, countTokens(a) + countTokens(b));
  });

  it("charges a non-text block 25 tokens (kept at 25, dropped at 24)", () => {
    expectKeepDrop(user([{ type: "image" }] as never), 25);
  });
});

describe("system-prompt truncation", () => {
  it("truncates a system prompt that exceeds the budget down to the budget", () => {
    const sys = "x".repeat(200);
    expect(countTokens(sys)).toBeGreaterThan(5);
    const result = packContext([], sys, 5);
    expect(countTokens(result.systemPrompt)).toBeLessThanOrEqual(5);
    expect(countTokens(result.systemPrompt)).toBeGreaterThan(0);
    expect(result.systemPrompt.length).toBeLessThan(sys.length);
  });
});

describe("remaining-budget arithmetic", () => {
  const sys = "you are a helpful assistant";
  const sysCost = countTokens(sys);
  const text = "the quick brown fox jumps over";
  const msgCost = countTokens(text);

  it("subtracts system tokens from the budget (message fits exactly)", () => {
    expect(
      packContext([user(text)], sys, sysCost + msgCost).messages
    ).toHaveLength(1);
  });

  it("subtracts system tokens from the budget (one token short drops it)", () => {
    expect(
      packContext([user(text)], sys, sysCost + msgCost - 1).messages
    ).toHaveLength(0);
  });

  it("returns no messages when the system prompt consumes the whole budget", () => {
    // remaining === 0; a zero-token (empty) message must NOT be kept.
    expect(packContext([user("")], sys, sysCost).messages).toHaveLength(0);
  });
});

describe("message keep/drop loop", () => {
  it("keeps a message that costs exactly the remaining budget", () => {
    const text = "the quick brown fox jumps";
    expectKeepDrop(user(text), countTokens(text));
  });

  it("stops at the first (most recent) message that does not fit", () => {
    const older = user("ab"); // tiny, would fit alone
    const recent = user("a".repeat(400)); // many tokens, does not fit
    const budget = countTokens("ab") + 1;
    expect(countTokens("a".repeat(400))).toBeGreaterThan(budget);
    // Most-recent-first; the over-budget recent message must halt the scan so
    // the older one is NOT kept.
    expect(packContext([older, recent], "", budget).messages).toHaveLength(0);
  });
});
