import {
  PROVIDERS,
  dailySeries,
  executions,
  executionCount,
  failedCount,
  grandTotal,
  avgPerExecution,
  topCostDriver,
  groupExecutions,
  daysForRange,
  executionsForRange,
  executionsToCsv,
  formatMoney,
  splitMoney,
  formatPercent,
  formatRuntime,
  formatTokens,
  formatWhen,
  formatAxisDate,
  formatRangeLabel,
  type ProviderId
} from "../costsData";

describe("costsData", () => {
  it("exposes six providers in legend order", () => {
    expect(PROVIDERS.map((p) => p.id)).toEqual([
      "openai",
      "anthropic",
      "replicate",
      "fal",
      "huggingface",
      "local"
    ]);
  });

  it("has a 14-day series whose per-provider column sums match the totals", () => {
    expect(dailySeries).toHaveLength(14);
    for (const p of PROVIDERS) {
      const sum = dailySeries.reduce((acc, d) => acc + d.values[p.id], 0);
      expect(sum).toBeCloseTo(p.total, 6);
    }
  });

  it("derives the grand total from provider totals", () => {
    expect(grandTotal).toBeCloseTo(3.356, 6);
    expect(formatMoney(grandTotal)).toBe("$3.36");
  });

  it("generates a stable set of 161 executions with 9 failures", () => {
    expect(executionCount).toBe(161);
    expect(executions).toHaveLength(161);
    expect(failedCount).toBe(9);
  });

  it("sorts the pinned rows to the top, most recent first", () => {
    expect(executions[0].id).toBe("exec_42s");
    expect(executions[0].title).toBe("Caption (BLIP-2)");
    expect(executions[1].title).toBe("Whisper v3");
    // strictly descending timestamps
    for (let i = 1; i < executions.length; i++) {
      expect(executions[i - 1].timestamp.getTime()).toBeGreaterThanOrEqual(
        executions[i].timestamp.getTime()
      );
    }
  });

  it("computes a consistent average per execution", () => {
    expect(avgPerExecution).toBeCloseTo(grandTotal / 161, 6);
    expect(formatMoney(avgPerExecution)).toBe("$0.021");
  });

  it("computes the top cost driver share", () => {
    expect(formatPercent(topCostDriver.cost / grandTotal)).toBe("36%");
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

    it("formats runtime, tokens and dates", () => {
      expect(formatRuntime(1.5)).toBe("1.5s");
      expect(formatTokens(null)).toBe("—");
      expect(formatTokens(380)).toBe("380");
      expect(formatTokens(1200)).toBe("1.2k");
      expect(formatWhen(new Date(2026, 4, 29, 17, 47))).toBe("May 29, 17:47");
      expect(formatWhen(new Date(2026, 4, 29, 7, 5))).toBe("May 29, 07:05");
      expect(formatAxisDate(new Date(2026, 4, 16))).toBe("5/16");
      expect(
        formatRangeLabel(new Date(2026, 4, 16), new Date(2026, 4, 29))
      ).toBe("May 16 – May 29, 2026");
    });
  });

  describe("grouping", () => {
    it("aggregates by provider with shares summing to 1", () => {
      const rows = groupExecutions(executions, "provider");
      expect(rows.length).toBeGreaterThan(0);
      const shareSum = rows.reduce((a, r) => a + r.share, 0);
      expect(shareSum).toBeCloseTo(1, 6);
      // sorted by cost descending
      for (let i = 1; i < rows.length; i++) {
        expect(rows[i - 1].cost).toBeGreaterThanOrEqual(rows[i].cost);
      }
    });

    it("aggregates by workflow across the four workflows", () => {
      const rows = groupExecutions(executions, "workflow");
      expect(rows.length).toBeLessThanOrEqual(4);
      const execSum = rows.reduce((a, r) => a + r.executions, 0);
      expect(execSum).toBe(161);
    });
  });

  describe("range filtering", () => {
    it("slices the series to the requested window", () => {
      expect(daysForRange("7d")).toHaveLength(7);
      expect(daysForRange("14d")).toHaveLength(14);
      expect(daysForRange("30d")).toHaveLength(14);
      expect(daysForRange("90d")).toHaveLength(14);
    });

    it("keeps only executions inside the window", () => {
      const sevenDay = executionsForRange("7d");
      const fourteenDay = executionsForRange("14d");
      expect(sevenDay.length).toBeLessThanOrEqual(fourteenDay.length);
      expect(fourteenDay).toHaveLength(161);
    });
  });

  describe("csv export", () => {
    it("produces a header row plus one row per execution", () => {
      const subset = executions.slice(0, 5);
      const csv = executionsToCsv(subset);
      const lines = csv.split("\n");
      expect(lines).toHaveLength(6);
      expect(lines[0]).toContain("cost_usd");
      expect(lines[1]).toContain("exec_42s");
    });

    it("escapes commas in workflow names", () => {
      const row = {
        ...executions[0],
        workflow: "with, comma"
      };
      const csv = executionsToCsv([row]);
      expect(csv).toContain('"with, comma"');
    });
  });
});

// Light type-level guard: ProviderId stays in sync with PROVIDERS.
const _providerIds: ProviderId[] = PROVIDERS.map((p) => p.id);
void _providerIds;
