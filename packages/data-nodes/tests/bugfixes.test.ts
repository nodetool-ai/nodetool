import { describe, expect, it } from "vitest";
import {
  FilterDataframeNode,
  FindRowNode,
  SliceDataframeNode,
  JSONToDataframeNode
} from "@nodetool-ai/data-nodes";

async function run<
  T extends {
    assign(inputs: Record<string, unknown>): void;
    process(): Promise<Record<string, unknown>>;
  }
>(NodeClass: new () => T, inputs: Record<string, unknown>) {
  const node = new NodeClass();
  node.assign(inputs);
  return node.process();
}

function rowsOf(output: unknown): Array<Record<string, unknown>> {
  return (output as { rows: Array<Record<string, unknown>> }).rows;
}

describe("FilterDataframe condition semantics", () => {
  const priced = {
    rows: [{ price: 50 }, { price: 150 }, { price: 250 }]
  };

  it("evaluates chained comparisons Python-style (100 <= price <= 200)", async () => {
    const out = await run(FilterDataframeNode, {
      df: priced,
      condition: "100 <= price <= 200"
    });
    expect(rowsOf(out.output)).toEqual([{ price: 150 }]);
  });

  it("supports membership with the 'in' operator", async () => {
    const out = await run(FilterDataframeNode, {
      df: {
        rows: [
          { status: "Active" },
          { status: "Closed" },
          { status: "Pending" }
        ]
      },
      condition: "status in ['Active', 'Pending']"
    });
    expect(rowsOf(out.output).map((r) => r.status)).toEqual([
      "Active",
      "Pending"
    ]);
  });

  it("does not rewrite 'and'/'or'/'not' inside string literals", async () => {
    const out = await run(FilterDataframeNode, {
      df: {
        rows: [
          { name: "Research and Development" },
          { name: "Sales or Marketing" }
        ]
      },
      condition: "name == 'Research and Development'"
    });
    expect(rowsOf(out.output)).toEqual([
      { name: "Research and Development" }
    ]);
  });

  it("still supports and/or/not as logical operators", async () => {
    const df = { rows: [{ x: 1 }, { x: 2 }, { x: 3 }] };
    expect(
      rowsOf((await run(FilterDataframeNode, { df, condition: "x > 1 and x < 3" })).output)
    ).toEqual([{ x: 2 }]);
    expect(
      rowsOf((await run(FilterDataframeNode, { df, condition: "not (x < 3)" })).output)
    ).toEqual([{ x: 3 }]);
  });

  it("throws on an unparseable condition rather than returning empty", async () => {
    await expect(
      run(FilterDataframeNode, {
        df: { rows: [{ x: 1 }] },
        condition: "x === === 2"
      })
    ).rejects.toThrow();
  });

  it("FindRow honors the same membership semantics", async () => {
    const out = await run(FindRowNode, {
      df: {
        rows: [
          { ticket: "T-100", priority: "low" },
          { ticket: "T-200", priority: "high" }
        ]
      },
      condition: "priority in ['high', 'urgent']"
    });
    expect(rowsOf(out.output)).toEqual([{ ticket: "T-200", priority: "high" }]);
  });
});

describe("Slice negative indices", () => {
  const df = {
    rows: [{ i: 0 }, { i: 1 }, { i: 2 }, { i: 3 }, { i: 4 }]
  };

  it("treats -1 as 'through the end'", async () => {
    const out = await run(SliceDataframeNode, {
      dataframe: df,
      start_index: 0,
      end_index: -1
    });
    expect(rowsOf(out.output)).toHaveLength(5);
  });

  it("counts other negative end indices back from the end", async () => {
    const out = await run(SliceDataframeNode, {
      dataframe: df,
      start_index: 0,
      end_index: -2
    });
    expect(rowsOf(out.output).map((r) => r.i)).toEqual([0, 1, 2]);
  });
});

describe("JSONToDataframe empty input", () => {
  it("returns an empty dataframe for empty/whitespace text", async () => {
    const out = await run(JSONToDataframeNode, { text: "   " });
    expect(rowsOf(out.output)).toEqual([]);
  });
});
