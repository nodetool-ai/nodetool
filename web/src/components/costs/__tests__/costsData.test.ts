import {
  providerColor,
  providerLabel,
  groupExecutions,
  executionsToCsv,
  formatMoney,
  splitMoney,
  formatPercent,
  formatRuntime,
  formatTokens,
  formatWhen,
  formatAxisDate,
  formatRangeLabel,
  type Execution
} from "../costsData";

const exec = (over: Partial<Execution> = {}): Execution => ({
  id: "e1",
  title: "GPT-4o",
  category: "llm",
  workflow: "Newsletter",
  providerId: "openai",
  model: "gpt-4o",
  tokensIn: 100,
  tokensOut: 50,
  runtimeSec: 1.5,
  status: "ok",
  timestamp: new Date(2026, 4, 29, 17, 47),
  cost: 0.01,
  ...over
});

describe("provider presentation", () => {
  it("uses preset labels and colours for known providers", () => {
    expect(providerLabel("openai")).toBe("OpenAI");
    expect(providerColor("openai")).toBe("#4FD18B");
    expect(providerLabel("fal")).toBe("fal.ai");
  });

  it("falls back deterministically for unknown providers", () => {
    expect(providerLabel("some_provider")).toBe("Some Provider");
    expect(providerColor("mystery")).toMatch(/^#[0-9A-F]{6}$/i);
    expect(providerColor("mystery")).toBe(providerColor("mystery"));
  });
});

describe("formatting", () => {
  it("formats money with adaptive precision", () => {
    expect(formatMoney(0)).toBe("$0");
    expect(formatMoney(0.0008)).toBe("$0.0008");
    expect(formatMoney(0.0062)).toBe("$0.0062");
    expect(formatMoney(0.011)).toBe("$0.011");
    expect(formatMoney(0.981)).toBe("$0.981");
    expect(formatMoney(1.35)).toBe("$1.35");
  });

  it("splits money into whole and decimal parts", () => {
    expect(splitMoney(3.356)).toEqual({ whole: "$3", decimal: ".36" });
    expect(splitMoney(161)).toEqual({ whole: "$161", decimal: ".00" });
  });

  it("formats runtime, tokens, percent and dates", () => {
    expect(formatPercent(0.3605)).toBe("36%");
    expect(formatRuntime(1.5)).toBe("1.5s");
    expect(formatTokens(null)).toBe("—");
    expect(formatTokens(380)).toBe("380");
    expect(formatTokens(1200)).toBe("1.2k");
    expect(formatWhen(new Date(2026, 4, 29, 17, 47))).toBe("May 29, 17:47");
    expect(formatWhen(new Date(2026, 4, 29, 7, 5))).toBe("May 29, 07:05");
    expect(formatAxisDate(new Date(2026, 4, 16))).toBe("5/16");
    expect(formatRangeLabel(new Date(2026, 4, 16), new Date(2026, 4, 29))).toBe(
      "May 16 – May 29, 2026"
    );
  });
});

describe("groupExecutions", () => {
  const execs: Execution[] = [
    exec({ id: "a", providerId: "openai", model: "gpt-4o", cost: 2 }),
    exec({ id: "b", providerId: "openai", model: "gpt-4o-mini", cost: 1 }),
    exec({ id: "c", providerId: "anthropic", model: "claude", cost: 4 })
  ];

  it("aggregates by provider with shares summing to 1, sorted by cost", () => {
    const rows = groupExecutions(execs, "provider");
    expect(rows.map((r) => r.name)).toEqual(["Anthropic", "OpenAI"]);
    expect(rows[0]).toMatchObject({ executions: 1, cost: 4 });
    expect(rows[1]).toMatchObject({ executions: 2, cost: 3 });
    expect(rows.reduce((a, r) => a + r.share, 0)).toBeCloseTo(1, 6);
  });

  it("aggregates by model", () => {
    const rows = groupExecutions(execs, "model");
    expect(rows.map((r) => r.name)).toEqual([
      "claude",
      "gpt-4o",
      "gpt-4o-mini"
    ]);
  });
});

describe("executionsToCsv", () => {
  it("produces a header row plus one row per execution", () => {
    const csv = executionsToCsv([exec({ id: "x1" }), exec({ id: "x2" })]);
    const lines = csv.split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain("cost_usd");
    expect(lines[1]).toContain("x1");
  });

  it("escapes commas in workflow names", () => {
    const csv = executionsToCsv([exec({ workflow: "with, comma" })]);
    expect(csv).toContain('"with, comma"');
  });
});
