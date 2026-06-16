/**
 * Unit tests for the autonomous security monitor: the {@link SecurityMonitor}
 * class, its verdict parsing, truncation, and the consult-bridge factory.
 *
 * The provider is a fake driving `generateMessageTraced` to return a scripted
 * {@link Message}, so the tests assert exactly what the class does with what
 * the judge returns — not the judge's reasoning itself.
 */

import { describe, expect, it, vi } from "vitest";
import type { BaseProvider, Message } from "@nodetool-ai/runtime";
import {
  SecurityMonitor,
  createSecurityMonitorConsult,
  parseVerdict,
  type PendingAction,
  type SecurityVerdict
} from "../src/security-monitor.js";
import { SECURITY_MONITOR_SYSTEM_PROMPT } from "../src/prompts/security-monitor-prompt.js";

type GenerateArgs = Parameters<BaseProvider["generateMessageTraced"]>[0];

/**
 * Build a fake provider whose `generateMessageTraced` returns the given message
 * text (string content). The returned `generateMessageTraced` is a vi.fn spy so
 * callers can assert on the arguments it was invoked with.
 */
function createJudgeProvider(replyText: string) {
  const generateMessageTraced = vi.fn(
    async (args: GenerateArgs): Promise<Message> => {
      void args;
      return { role: "assistant", content: replyText };
    }
  );
  return {
    provider: "scripted",
    generateMessageTraced
  } as unknown as BaseProvider & {
    generateMessageTraced: typeof generateMessageTraced;
  };
}

const ACTION: PendingAction = {
  name: "http_request",
  category: "external",
  args: { url: "https://example.com", method: "POST" }
};

describe("parseVerdict", () => {
  it("parses a clean JSON verdict from an assistant message", () => {
    const v = parseVerdict(
      '{"block":true,"tier":"hard","severity":"critical","reason":"exfiltration"}'
    );
    expect(v).toEqual({
      block: true,
      tier: "hard",
      severity: "critical",
      reason: "exfiltration"
    });
  });

  it("parses a verdict wrapped in prose / markdown fences via extractJSON fallback", () => {
    const v = parseVerdict(
      "Here is my verdict:\n```json\n" +
        '{"block": true, "tier": "soft", "severity": "high", "reason": "bulk delete"}\n' +
        "```\nThat is all."
    );
    expect(v?.block).toBe(true);
    expect(v?.tier).toBe("soft");
    expect(v?.severity).toBe("high");
  });

  it("parses the alternate <block>yes</block><reason>...</reason> tag form", () => {
    const v = parseVerdict(
      "<block>yes</block><tier>hard</tier><severity>critical</severity>" +
        "<reason>secrets leaving the workspace</reason>"
    );
    expect(v).toEqual({
      block: true,
      tier: "hard",
      severity: "critical",
      reason: "secrets leaving the workspace"
    });
  });

  it("returns null for garbage that contains no JSON and no tags", () => {
    expect(parseVerdict("I am not sure, maybe?")).toBeNull();
    expect(parseVerdict("")).toBeNull();
  });
});

describe("SecurityMonitor.review", () => {
  it("returns {block:false} when the judge returns an allow verdict", async () => {
    const provider = createJudgeProvider(
      '{"block": false, "tier": "none", "severity": "low", "reason": ""}'
    );
    const monitor = new SecurityMonitor({ provider, model: "judge" });
    const verdict = await monitor.review(ACTION);
    expect(verdict.block).toBe(false);
    expect(verdict.tier).toBe("none");
  });

  it("passes through a HARD block for an exfiltration-style action", async () => {
    const provider = createJudgeProvider(
      '{"block": true, "tier": "hard", "severity": "critical", "reason": "uploading secrets"}'
    );
    const monitor = new SecurityMonitor({ provider, model: "judge" });
    const verdict = await monitor.review(ACTION);
    expect(verdict).toEqual({
      block: true,
      tier: "hard",
      severity: "critical",
      reason: "uploading secrets"
    });
  });

  it("passes through a SOFT block for a destructive action", async () => {
    const provider = createJudgeProvider(
      '{"block": true, "tier": "soft", "severity": "high", "reason": "bulk file deletion"}'
    );
    const monitor = new SecurityMonitor({ provider, model: "judge" });
    const verdict = await monitor.review({
      name: "run_code",
      category: "execute",
      args: { code: "rm -rf ./data" }
    });
    expect(verdict.block).toBe(true);
    expect(verdict.tier).toBe("soft");
  });

  it("defaults to allow (block:false) on unparseable/garbage model output", async () => {
    const provider = createJudgeProvider("totally not a verdict");
    const monitor = new SecurityMonitor({ provider, model: "judge" });
    const verdict = await monitor.review(ACTION);
    expect(verdict).toEqual({
      block: false,
      reason: "",
      severity: "low",
      tier: "none"
    });
  });

  it("defaults to allow when the provider call throws", async () => {
    const generateMessageTraced = vi.fn(async () => {
      throw new Error("provider exploded");
    });
    const provider = {
      provider: "scripted",
      generateMessageTraced
    } as unknown as BaseProvider;
    const monitor = new SecurityMonitor({ provider, model: "judge" });
    const verdict = await monitor.review(ACTION);
    expect(verdict.block).toBe(false);
  });

  it("truncates oversized args JSON and transcript to the configured caps", async () => {
    const provider = createJudgeProvider(
      '{"block": false, "tier": "none", "severity": "low", "reason": ""}'
    );
    const monitor = new SecurityMonitor({
      provider,
      model: "judge",
      maxArgChars: 40,
      maxTranscriptChars: 40
    });
    await monitor.review({
      name: "http_request",
      category: "external",
      args: { payload: "x".repeat(5_000) },
      transcript: "y".repeat(5_000)
    });

    const args = provider.generateMessageTraced.mock.calls[0][0];
    const userMsg = args.messages[1].content as string;
    expect(userMsg).toContain("[truncated]");
    // The huge inputs must not survive verbatim in the prompt.
    expect(userMsg).not.toContain("x".repeat(200));
    expect(userMsg).not.toContain("y".repeat(200));
  });

  it("calls generateMessageTraced once with temperature 0 and the system prompt", async () => {
    const provider = createJudgeProvider(
      '{"block": false, "tier": "none", "severity": "low", "reason": ""}'
    );
    const monitor = new SecurityMonitor({ provider, model: "judge-model" });
    await monitor.review(ACTION);

    expect(provider.generateMessageTraced).toHaveBeenCalledTimes(1);
    const args = provider.generateMessageTraced.mock.calls[0][0];
    expect(args.temperature).toBe(0);
    expect(args.model).toBe("judge-model");
    expect(args.messages[0].role).toBe("system");
    expect(args.messages[0].content).toBe(SECURITY_MONITOR_SYSTEM_PROMPT);
    expect(args.messages[1].role).toBe("user");
  });

  it("extracts text from a parts-array message content", async () => {
    const generateMessageTraced = vi.fn(
      async (): Promise<Message> => ({
        role: "assistant",
        content: [
          { type: "text", text: '{"block": true, ' },
          { type: "text", text: '"tier": "hard", "severity": "high", "reason": "x"}' }
        ]
      })
    );
    const provider = {
      provider: "scripted",
      generateMessageTraced
    } as unknown as BaseProvider;
    const monitor = new SecurityMonitor({ provider, model: "judge" });
    const verdict = await monitor.review(ACTION);
    expect(verdict.block).toBe(true);
    expect(verdict.tier).toBe("hard");
  });
});

describe("createSecurityMonitorConsult", () => {
  it("returns a fn that forwards a PendingAction to monitor.review", async () => {
    const expected: SecurityVerdict = {
      block: true,
      tier: "soft",
      severity: "medium",
      reason: "destructive"
    };
    const monitor = {
      review: vi.fn(async () => expected)
    } as unknown as SecurityMonitor;
    const consult = createSecurityMonitorConsult(monitor);
    const result = await consult(ACTION);
    expect(result).toBe(expected);
    expect(monitor.review).toHaveBeenCalledWith(ACTION);
  });
});
