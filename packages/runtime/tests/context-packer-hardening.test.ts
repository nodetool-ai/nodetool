/**
 * Mutation-hardening tests for the context packer.
 *
 * Pins the token-budget arithmetic and the per-message token estimate at exact
 * boundaries: the keep/drop decisions reveal the precise token cost of each
 * message kind (null, string, text block, non-text block) and of the system
 * prompt. See MUTATION_TESTING.md.
 */
import { describe, it, expect } from "vitest";
import { packContext } from "../src/context-packer.js";
import type { Message } from "../src/providers/types.js";

const user = (content: Message["content"]): Message =>
  ({ role: "user", content }) as Message;

describe("estimateMessageTokens — content kinds", () => {
  it("treats null/undefined content as 1 token (no crash)", () => {
    expect(packContext([user(null)], "", 1).messages).toHaveLength(1);
    expect(
      packContext([user(undefined as unknown as null)], "", 1).messages
    ).toHaveLength(1);
  });

  it("estimates a string by its length, not as a block array", () => {
    // "ab" = 2 chars = 1 token; iterating it as a char array would cost 2×100.
    expect(packContext([user("ab")], "", 1).messages).toHaveLength(1);
  });

  it("sums text-block lengths (kept at 2 tokens, dropped at 1)", () => {
    const msg = user([{ type: "text", text: "a".repeat(8) }] as never);
    expect(packContext([msg], "", 2).messages).toHaveLength(1);
    expect(packContext([msg], "", 1).messages).toHaveLength(0);
  });

  it("charges a non-text block 100 chars = 25 tokens (kept at 25, dropped at 24)", () => {
    const msg = user([{ type: "image" }] as never);
    expect(packContext([msg], "", 25).messages).toHaveLength(1);
    expect(packContext([msg], "", 24).messages).toHaveLength(0);
  });
});

describe("system-prompt truncation", () => {
  it("truncates to maxTokens × 4 chars when the prompt exceeds budget", () => {
    const sys = "x".repeat(40); // 10 tokens
    const result = packContext([], sys, 5);
    expect(result.systemPrompt).toHaveLength(20); // 5 tokens × 4 chars
  });
});

describe("remaining-budget arithmetic", () => {
  const sys = "x".repeat(20); // 5 tokens, no truncation at maxTokens=10

  it("subtracts system tokens from the budget (4-token message fits in 5)", () => {
    const msg = user("a".repeat(16)); // 4 tokens
    expect(packContext([msg], sys, 10).messages).toHaveLength(1);
  });

  it("subtracts system tokens from the budget (6-token message exceeds 5)", () => {
    const msg = user("a".repeat(24)); // 6 tokens
    expect(packContext([msg], sys, 10).messages).toHaveLength(0);
  });

  it("returns no messages when the system prompt consumes the whole budget", () => {
    // remaining === 0; a zero-token (empty) message must NOT be kept.
    expect(packContext([user("")], sys, 5).messages).toHaveLength(0);
  });
});

describe("message keep/drop loop", () => {
  it("keeps a message that costs exactly the remaining budget", () => {
    const msg = user("a".repeat(8)); // 2 tokens
    expect(packContext([msg], "", 2).messages).toHaveLength(1);
  });

  it("stops at the first (most recent) message that does not fit", () => {
    const older = user("abcd"); // 1 token, would fit alone
    const recent = user("a".repeat(40)); // 10 tokens, does not fit
    // Most-recent-first; the over-budget recent message must halt the scan so
    // the older one is NOT kept.
    expect(packContext([older, recent], "", 3).messages).toHaveLength(0);
  });
});
