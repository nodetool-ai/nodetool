/**
 * The blocking wait of `render_timeline` against the budget it really runs on.
 *
 * A `wait: true` render called from `execute_code` shares a clock with the
 * CodeAct action, and the sandbox aborts the action with `Execution cancelled`
 * — a message naming neither the render nor its job id. The ceiling here is
 * what keeps the render's own timeout the one that fires.
 */

import { describe, expect, it } from "vitest";

import { renderWaitBudget } from "../src/capabilities/timelines.js";
import {
  DEFAULT_RENDER_TIMEOUT_MS,
  MAX_RENDER_TIMEOUT_MS
} from "../src/capabilities/timelines.specs.js";
import { DEFAULT_CODEACT_ACTION_TIMEOUT_MS } from "../src/codeact/codeact-executor.js";

describe("render_timeline wait budget", () => {
  it("keeps the ceiling well below the CodeAct action budget", () => {
    expect(MAX_RENDER_TIMEOUT_MS).toBeLessThanOrEqual(
      DEFAULT_CODEACT_ACTION_TIMEOUT_MS / 2
    );
    expect(DEFAULT_RENDER_TIMEOUT_MS).toBeLessThanOrEqual(
      MAX_RENDER_TIMEOUT_MS
    );
  });

  it("clamps a wait above the ceiling and says it did", () => {
    const { timeoutMs, clampNote } = renderWaitBudget(600_000);
    expect(timeoutMs).toBe(MAX_RENDER_TIMEOUT_MS);
    expect(clampNote).toContain("600000");
    expect(clampNote).toContain(String(MAX_RENDER_TIMEOUT_MS));
    // The note has to point somewhere, not just refuse.
    expect(clampNote).toContain("wait: false");
    expect(clampNote).toContain("preview_scale");
  });

  it("leaves a wait within the ceiling alone and says nothing", () => {
    const { timeoutMs, clampNote } = renderWaitBudget(30_000);
    expect(timeoutMs).toBe(30_000);
    expect(clampNote).toBeNull();
  });

  it("falls back to the default when no timeout is named", () => {
    expect(renderWaitBudget(undefined).timeoutMs).toBe(
      DEFAULT_RENDER_TIMEOUT_MS
    );
    expect(renderWaitBudget(undefined).clampNote).toBeNull();
  });
});
