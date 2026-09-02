/**
 * The shared execution policy: one object every agent mode resolves its bounds
 * from, so a knob means the same thing in each mode.
 */
import { describe, it, expect } from "vitest";
import {
  DEFAULT_AGENT_POLICY,
  resolveAgentPolicy
} from "../src/agent-policy.js";

describe("resolveAgentPolicy", () => {
  it("falls back to the shared defaults", () => {
    expect(resolveAgentPolicy()).toEqual(DEFAULT_AGENT_POLICY);
  });

  it("keeps maxTokens absent when the caller sets none", () => {
    expect("maxTokens" in resolveAgentPolicy()).toBe(false);
  });

  it("overrides only what the caller supplied", () => {
    const policy = resolveAgentPolicy({ maxTokens: 512 });
    expect(policy.maxTokens).toBe(512);
    expect(policy.maxStepIterations).toBe(
      DEFAULT_AGENT_POLICY.maxStepIterations
    );
    expect(policy.maxConcurrentAgents).toBe(
      DEFAULT_AGENT_POLICY.maxConcurrentAgents
    );
  });
});
