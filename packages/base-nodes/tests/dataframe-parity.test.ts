import { describe, expect, it } from "vitest";
import { makeRegistry, makeRunner } from "./e2e/helpers.js";
import type { Edge, NodeDescriptor } from "@nodetool/protocol";
import {
  AddColumnNode,
  AggregateNode,
  AppendDataframeNode,
  ConstantStringNode,
  DropDuplicatesNode,
  DropNANode,
  ExtractColumnNode,
  FillNANode,
  FilterDataframeNode,
  FindRowNode,
  FromListNode,
  ImportCSVNode,
  MergeDataframeNode,
  OutputNode,
  RenameNode,
  SelectColumnNode,
  SortByColumnNode,
  ToListNode,
} from "../src/index.js";

async function run<T extends { process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> }>(
  NodeClass: new () => T,
  inputs: Record<string, unknown>,
) {
  return new NodeClass().process(inputs);
}

async function runWorkflow(nodes: NodeDescriptor[], edges: Edge[]) {
  return makeRunner(makeRegistry()).run(
    { job_id: `dataframe-parity-${Date.now()}` },
    { nodes, edges },
  );
}

function constantStringNode(id: string, value: string): NodeDescriptor {
  return { id, type: ConstantStringNode.nodeType, properties: { value } };
}

function outputValue(
  result: Awaited<ReturnType<typeof runWorkflow>>,
  name: string,
): unknown {
  return result.outputs[name]?.[0];
}

describe("dataframe parity: direct transforms", () => {
  it("round-trips from-list to-list and preserves scalar values", async () => {
    const rows = [
      { a: 1, b: "x" },
      { a: 2, b: "y" },
    ];

    const dataframe = await run(FromListNode, { values: rows });
    await expect(
      run(ToListNode, { dataframe: dataframe.output }),
    ).resolves.toEqual({ output: rows });
  });

  it("matches select, extract, add, merge, append, rename, and fillna behavior", async () => {
    const base = {
      rows: [
        { a: 1, b: 3, c: 5 },
        { a: 2, b: 4, c: 6 },
      ],
    };

    await expect(
      run(SelectColumnNode, { dataframe: base, columns: "a,b" }),
    ).resolves.toEqual({
      output: {
        rows: [
          { a: 1, b: 3 },
          { a: 2, b: 4 },
        ],
      },
    });

    await expect(
      run(ExtractColumnNode, { dataframe: base, column_name: "b" }),
    ).resolves.toEqual({ output: [3, 4] });

    await expect(
      run(AddColumnNode, { dataframe: base, column_name: "d", values: [9, 8] }),
    ).resolves.toEqual({
      output: {
        rows: [
          { a: 1, b: 3, c: 5, d: 9 },
          { a: 2, b: 4, c: 6, d: 8 },
        ],
      },
    });

    await expect(
      run(MergeDataframeNode, {
        dataframe_a: { rows: [{ x: 1 }, { x: 2 }] },
        dataframe_b: { rows: [{ y: 3 }, { y: 4 }] },
      }),
    ).resolves.toEqual({
      output: {
        rows: [
          { x: 1, y: 3 },
          { x: 2, y: 4 },
        ],
      },
    });

    await expect(
      run(AppendDataframeNode, {
        dataframe_a: { rows: [{ x: 1, y: 3 }] },
        dataframe_b: { rows: [{ x: 2, y: 4 }] },
      }),
    ).resolves.toEqual({
      output: {
        rows: [
          { x: 1, y: 3 },
          { x: 2, y: 4 },
        ],
      },
    });

    await expect(
      run(RenameNode, {
        dataframe: { rows: [{ emp_name: "Alice", department: "Engineering" }] },
        rename_map: "emp_name:name,department:dept",
      }),
    ).resolves.toEqual({
      output: {
        rows: [{ name: "Alice", dept: "Engineering" }],
      },
    });

    await expect(
      run(FillNANode, {
        dataframe: { rows: [{ reading: 22.5 }, { reading: null }, { reading: 19.3 }] },
        value: 0,
        method: "value",
        columns: "reading",
      }),
    ).resolves.toEqual({
      output: {
        rows: [{ reading: 22.5 }, { reading: 0 }, { reading: 19.3 }],
      },
    });
  });

  it("excludes missing values from mean and median fill operations", async () => {
    await expect(
      run(FillNANode, {
        dataframe: { rows: [{ x: 10 }, { x: null }, { x: 20 }] },
        method: "mean",
      }),
    ).resolves.toEqual({
      output: {
        rows: [{ x: 10 }, { x: 15 }, { x: 20 }],
      },
    });

    await expect(
      run(FillNANode, {
        dataframe: { rows: [{ x: 10 }, { x: null }, { x: 20 }, { x: 30 }] },
        method: "median",
      }),
    ).resolves.toEqual({
      output: {
        rows: [{ x: 10 }, { x: 20 }, { x: 20 }, { x: 30 }],
      },
    });
  });
});

describe("dataframe parity: workflow ETL scenarios", () => {
  const employeeCsv =
    "emp_name,department,salary\n" +
    "Alice,Engineering,120000\n" +
    "Bob,Sales,85000\n" +
    "Carol,Engineering,115000\n" +
    "Dave,Marketing,78000\n" +
    "Eve,Engineering,130000\n";

  const sensorCsv = "sensor,reading\nA,22.5\nB,\nC,19.3\n";
  const salesCsv = "region,revenue\nNorth,1000\nNorth,1500\nSouth,800\nSouth,900\n";
  const dedupCsv = "sensor,reading\nA,10.0\nA,10.0\nB,20.0\n";
  const ticketCsv = "ticket,priority\nT-100,low\nT-200,high\nT-300,medium\n";

  it("imports employee csv to rows with numeric salary values", async () => {
    const result = await runWorkflow(
      [
        constantStringNode("csv", employeeCsv),
        { id: "import", type: ImportCSVNode.nodeType },
        { id: "list", type: ToListNode.nodeType },
        { id: "out", type: OutputNode.nodeType, name: "rows" },
      ],
      [
        { source: "csv", sourceHandle: "output", target: "import", targetHandle: "csv_data" },
        { source: "import", sourceHandle: "output", target: "list", targetHandle: "dataframe" },
        { source: "list", sourceHandle: "output", target: "out", targetHandle: "value" },
      ],
    );

    const rows = outputValue(result, "rows") as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(5);
    expect(rows[0].emp_name).toBe("Alice");
    expect(rows[0].salary).toBe(120000);
  });

  it("renames, filters, sorts, extracts, and selects like the Python employee workflow", async () => {
    const renamed = await runWorkflow(
      [
        constantStringNode("csv", employeeCsv),
        { id: "import", type: ImportCSVNode.nodeType },
        {
          id: "rename",
          type: RenameNode.nodeType,
          properties: { rename_map: "emp_name:name,department:dept" },
        },
        { id: "list", type: ToListNode.nodeType },
        { id: "out", type: OutputNode.nodeType, name: "rows" },
      ],
      [
        { source: "csv", sourceHandle: "output", target: "import", targetHandle: "csv_data" },
        { source: "import", sourceHandle: "output", target: "rename", targetHandle: "dataframe" },
        { source: "rename", sourceHandle: "output", target: "list", targetHandle: "dataframe" },
        { source: "list", sourceHandle: "output", target: "out", targetHandle: "value" },
      ],
    );
    expect((outputValue(renamed, "rows") as Array<Record<string, unknown>>)[0]).toEqual({
      name: "Alice",
      dept: "Engineering",
      salary: 120000,
    });

    const filtered = await runWorkflow(
      [
        constantStringNode("csv", employeeCsv),
        { id: "import", type: ImportCSVNode.nodeType },
        {
          id: "filter",
          type: FilterDataframeNode.nodeType,
          properties: { condition: "department == 'Engineering'" },
        },
        { id: "list", type: ToListNode.nodeType },
        { id: "out", type: OutputNode.nodeType, name: "rows" },
      ],
      [
        { source: "csv", sourceHandle: "output", target: "import", targetHandle: "csv_data" },
        { source: "import", sourceHandle: "output", target: "filter", targetHandle: "df" },
        { source: "filter", sourceHandle: "output", target: "list", targetHandle: "dataframe" },
        { source: "list", sourceHandle: "output", target: "out", targetHandle: "value" },
      ],
    );
    expect((outputValue(filtered, "rows") as Array<Record<string, unknown>>).map((row) => row.emp_name))
      .toEqual(["Alice", "Carol", "Eve"]);

    const sorted = await runWorkflow(
      [
        constantStringNode("csv", employeeCsv),
        { id: "import", type: ImportCSVNode.nodeType },
        { id: "sort", type: SortByColumnNode.nodeType, properties: { column: "salary" } },
        { id: "list", type: ToListNode.nodeType },
        { id: "out", type: OutputNode.nodeType, name: "rows" },
      ],
      [
        { source: "csv", sourceHandle: "output", target: "import", targetHandle: "csv_data" },
        { source: "import", sourceHandle: "output", target: "sort", targetHandle: "df" },
        { source: "sort", sourceHandle: "output", target: "list", targetHandle: "dataframe" },
        { source: "list", sourceHandle: "output", target: "out", targetHandle: "value" },
      ],
    );
    expect((outputValue(sorted, "rows") as Array<Record<string, unknown>>).map((row) => row.salary))
      .toEqual([78000, 85000, 115000, 120000, 130000]);

    const extracted = await runWorkflow(
      [
        constantStringNode("csv", employeeCsv),
        { id: "import", type: ImportCSVNode.nodeType },
        { id: "extract", type: ExtractColumnNode.nodeType, properties: { column_name: "salary" } },
        { id: "out", type: OutputNode.nodeType, name: "values" },
      ],
      [
        { source: "csv", sourceHandle: "output", target: "import", targetHandle: "csv_data" },
        { source: "import", sourceHandle: "output", target: "extract", targetHandle: "dataframe" },
        { source: "extract", sourceHandle: "output", target: "out", targetHandle: "value" },
      ],
    );
    expect(outputValue(extracted, "values")).toEqual([120000, 85000, 115000, 78000, 130000]);

    const selected = await runWorkflow(
      [
        constantStringNode("csv", employeeCsv),
        { id: "import", type: ImportCSVNode.nodeType },
        { id: "select", type: SelectColumnNode.nodeType, properties: { columns: "emp_name,salary" } },
        { id: "list", type: ToListNode.nodeType },
        { id: "out", type: OutputNode.nodeType, name: "rows" },
      ],
      [
        { source: "csv", sourceHandle: "output", target: "import", targetHandle: "csv_data" },
        { source: "import", sourceHandle: "output", target: "select", targetHandle: "dataframe" },
        { source: "select", sourceHandle: "output", target: "list", targetHandle: "dataframe" },
        { source: "list", sourceHandle: "output", target: "out", targetHandle: "value" },
      ],
    );
    expect(Object.keys((outputValue(selected, "rows") as Array<Record<string, unknown>>)[0]))
      .toEqual(["emp_name", "salary"]);
  });

  it("matches sensor cleaning semantics for fillna, dropna, and dedupe", async () => {
    const filled = await runWorkflow(
      [
        constantStringNode("csv", sensorCsv),
        { id: "import", type: ImportCSVNode.nodeType },
        {
          id: "fill",
          type: FillNANode.nodeType,
          properties: { value: 0, method: "value", columns: "reading" },
        },
        { id: "list", type: ToListNode.nodeType },
        { id: "out", type: OutputNode.nodeType, name: "rows" },
      ],
      [
        { source: "csv", sourceHandle: "output", target: "import", targetHandle: "csv_data" },
        { source: "import", sourceHandle: "output", target: "fill", targetHandle: "dataframe" },
        { source: "fill", sourceHandle: "output", target: "list", targetHandle: "dataframe" },
        { source: "list", sourceHandle: "output", target: "out", targetHandle: "value" },
      ],
    );
    expect((outputValue(filled, "rows") as Array<Record<string, unknown>>).map((row) => row.reading))
      .toEqual([22.5, 0, 19.3]);

    const dropped = await runWorkflow(
      [
        constantStringNode("csv", sensorCsv),
        { id: "import", type: ImportCSVNode.nodeType },
        { id: "drop", type: DropNANode.nodeType },
        { id: "list", type: ToListNode.nodeType },
        { id: "out", type: OutputNode.nodeType, name: "rows" },
      ],
      [
        { source: "csv", sourceHandle: "output", target: "import", targetHandle: "csv_data" },
        { source: "import", sourceHandle: "output", target: "drop", targetHandle: "df" },
        { source: "drop", sourceHandle: "output", target: "list", targetHandle: "dataframe" },
        { source: "list", sourceHandle: "output", target: "out", targetHandle: "value" },
      ],
    );
    expect(outputValue(dropped, "rows")).toEqual([
      { sensor: "A", reading: 22.5 },
      { sensor: "C", reading: 19.3 },
    ]);

    const deduped = await runWorkflow(
      [
        constantStringNode("csv", dedupCsv),
        { id: "import", type: ImportCSVNode.nodeType },
        { id: "drop", type: DropDuplicatesNode.nodeType },
        { id: "list", type: ToListNode.nodeType },
        { id: "out", type: OutputNode.nodeType, name: "rows" },
      ],
      [
        { source: "csv", sourceHandle: "output", target: "import", targetHandle: "csv_data" },
        { source: "import", sourceHandle: "output", target: "drop", targetHandle: "df" },
        { source: "drop", sourceHandle: "output", target: "list", targetHandle: "dataframe" },
        { source: "list", sourceHandle: "output", target: "out", targetHandle: "value" },
      ],
    );
    expect(outputValue(deduped, "rows")).toEqual([
      { sensor: "A", reading: 10 },
      { sensor: "B", reading: 20 },
    ]);
  });

  it("aggregates, merges, appends, finds rows, and supports an end-to-end ETL flow", async () => {
    const aggregated = await runWorkflow(
      [
        constantStringNode("csv", salesCsv),
        { id: "import", type: ImportCSVNode.nodeType },
        {
          id: "agg",
          type: AggregateNode.nodeType,
          properties: { columns: "region", aggregation: "sum" },
        },
        { id: "list", type: ToListNode.nodeType },
        { id: "out", type: OutputNode.nodeType, name: "rows" },
      ],
      [
        { source: "csv", sourceHandle: "output", target: "import", targetHandle: "csv_data" },
        { source: "import", sourceHandle: "output", target: "agg", targetHandle: "dataframe" },
        { source: "agg", sourceHandle: "output", target: "list", targetHandle: "dataframe" },
        { source: "list", sourceHandle: "output", target: "out", targetHandle: "value" },
      ],
    );
    expect(outputValue(aggregated, "rows")).toEqual([
      { region: "North", revenue: 2500 },
      { region: "South", revenue: 1700 },
    ]);

    const merged = await runWorkflow(
      [
        constantStringNode("left", "product\nA\nB\n"),
        constantStringNode("right", "price\n9.99\n14.50\n"),
        { id: "import-left", type: ImportCSVNode.nodeType },
        { id: "import-right", type: ImportCSVNode.nodeType },
        { id: "merge", type: MergeDataframeNode.nodeType },
        { id: "list", type: ToListNode.nodeType },
        { id: "out", type: OutputNode.nodeType, name: "rows" },
      ],
      [
        { source: "left", sourceHandle: "output", target: "import-left", targetHandle: "csv_data" },
        { source: "right", sourceHandle: "output", target: "import-right", targetHandle: "csv_data" },
        { source: "import-left", sourceHandle: "output", target: "merge", targetHandle: "dataframe_a" },
        { source: "import-right", sourceHandle: "output", target: "merge", targetHandle: "dataframe_b" },
        { source: "merge", sourceHandle: "output", target: "list", targetHandle: "dataframe" },
        { source: "list", sourceHandle: "output", target: "out", targetHandle: "value" },
      ],
    );
    expect(outputValue(merged, "rows")).toEqual([
      { product: "A", price: 9.99 },
      { product: "B", price: 14.5 },
    ]);

    const appended = await runWorkflow(
      [
        constantStringNode("a", "sku,qty\nX,3\n"),
        constantStringNode("b", "sku,qty\nY,7\n"),
        { id: "import-a", type: ImportCSVNode.nodeType },
        { id: "import-b", type: ImportCSVNode.nodeType },
        { id: "append", type: AppendDataframeNode.nodeType },
        { id: "list", type: ToListNode.nodeType },
        { id: "out", type: OutputNode.nodeType, name: "rows" },
      ],
      [
        { source: "a", sourceHandle: "output", target: "import-a", targetHandle: "csv_data" },
        { source: "b", sourceHandle: "output", target: "import-b", targetHandle: "csv_data" },
        { source: "import-a", sourceHandle: "output", target: "append", targetHandle: "dataframe_a" },
        { source: "import-b", sourceHandle: "output", target: "append", targetHandle: "dataframe_b" },
        { source: "append", sourceHandle: "output", target: "list", targetHandle: "dataframe" },
        { source: "list", sourceHandle: "output", target: "out", targetHandle: "value" },
      ],
    );
    expect(outputValue(appended, "rows")).toEqual([
      { sku: "X", qty: 3 },
      { sku: "Y", qty: 7 },
    ]);

    const found = await runWorkflow(
      [
        constantStringNode("csv", ticketCsv),
        { id: "import", type: ImportCSVNode.nodeType },
        {
          id: "find",
          type: FindRowNode.nodeType,
          properties: { condition: "ticket == 'T-200'" },
        },
        { id: "list", type: ToListNode.nodeType },
        { id: "out", type: OutputNode.nodeType, name: "rows" },
      ],
      [
        { source: "csv", sourceHandle: "output", target: "import", targetHandle: "csv_data" },
        { source: "import", sourceHandle: "output", target: "find", targetHandle: "df" },
        { source: "find", sourceHandle: "output", target: "list", targetHandle: "dataframe" },
        { source: "list", sourceHandle: "output", target: "out", targetHandle: "value" },
      ],
    );
    expect(outputValue(found, "rows")).toEqual([{ ticket: "T-200", priority: "high" }]);

    const pipelineCsv =
      "dept,spend\n" +
      "Eng,500\n" +
      "Eng,\n" +
      "Sales,300\n" +
      "Sales,200\n" +
      "Eng,500\n";
    const pipeline = await runWorkflow(
      [
        constantStringNode("csv", pipelineCsv),
        { id: "import", type: ImportCSVNode.nodeType },
        {
          id: "fill",
          type: FillNANode.nodeType,
          properties: { value: 0, method: "value", columns: "spend" },
        },
        { id: "dedupe", type: DropDuplicatesNode.nodeType },
        {
          id: "agg",
          type: AggregateNode.nodeType,
          properties: { columns: "dept", aggregation: "sum" },
        },
        { id: "list", type: ToListNode.nodeType },
        { id: "out", type: OutputNode.nodeType, name: "rows" },
      ],
      [
        { source: "csv", sourceHandle: "output", target: "import", targetHandle: "csv_data" },
        { source: "import", sourceHandle: "output", target: "fill", targetHandle: "dataframe" },
        { source: "fill", sourceHandle: "output", target: "dedupe", targetHandle: "df" },
        { source: "dedupe", sourceHandle: "output", target: "agg", targetHandle: "dataframe" },
        { source: "agg", sourceHandle: "output", target: "list", targetHandle: "dataframe" },
        { source: "list", sourceHandle: "output", target: "out", targetHandle: "value" },
      ],
    );
    expect(outputValue(pipeline, "rows")).toEqual([
      { dept: "Eng", spend: 500 },
      { dept: "Sales", spend: 500 },
    ]);
  });
});
