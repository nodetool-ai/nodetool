import { describe, it, expect } from "vitest";
import {
  // Data nodes
  SchemaNode,
  FilterDataframeNode,
  SliceDataframeNode,
  ImportCSVNode,
  FromListNode,
  JSONToDataframeNode,
  ToListNode,
  SelectColumnNode,
  ExtractColumnNode,
  AddColumnNode,
  MergeDataframeNode,
  AppendDataframeNode,
  JoinDataframeNode,
  RowIteratorNode,
  FindRowNode,
  SortByColumnNode,
  DropDuplicatesNode,
  DropNANode,
  AggregateNode,
  PivotNode,
  RenameNode,
  FillNANode,
  FilterNoneNode,
  // Document nodes
  SplitDocumentNode,
  SplitHTMLNode,
  SplitJSONNode,
  SplitRecursivelyNode,
  SplitMarkdownNode,
  // Code nodes
  ExecuteJavaScriptNode,
  ExecuteBashNode,
  ExecuteCommandNode,
  RunJavaScriptCommandNode,
  RunBashCommandNode,
  RunShellCommandNode,
} from "../src/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;
type DF = { rows: Row[] };

function df(rows: Row[]): DF {
  return { rows };
}

async function collectGen(
  gen: AsyncGenerator<Record<string, unknown>>
): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  for await (const item of gen) {
    out.push(item);
  }
  return out;
}

// ---------------------------------------------------------------------------
// DATA NODES
// ---------------------------------------------------------------------------

describe("data nodes", () => {
  // -- SchemaNode --
  describe("SchemaNode", () => {
    it("returns configured columns object", async () => {
      const node = new SchemaNode();
      node.assign({ columns: { name: "string", age: "int" } });
      const result = await node.process({});
      expect(result.output).toEqual({ name: "string", age: "int" });
    });

    it("returns empty object when no columns configured", async () => {
      const node = new SchemaNode();
      const result = await node.process({});
      expect(result.output).toEqual({ type: "record_type", columns: [] });
    });
  });

  // -- ImportCSVNode --
  describe("ImportCSVNode", () => {
    it("parses CSV string into dataframe rows", async () => {
      const node = new ImportCSVNode();
      const result = await node.process({
        csv_data: "name,age\nAlice,30\nBob,25",
      });
      const out = result.output as DF;
      expect(out.rows).toHaveLength(2);
      expect(out.rows[0]).toEqual({ name: "Alice", age: 30 });
      expect(out.rows[1]).toEqual({ name: "Bob", age: 25 });
    });

    it("handles empty CSV", async () => {
      const result = await new ImportCSVNode().process({ csv_data: "" });
      expect((result.output as DF).rows).toHaveLength(0);
    });

    it("handles CSV with only headers", async () => {
      const result = await new ImportCSVNode().process({
        csv_data: "a,b,c",
      });
      expect((result.output as DF).rows).toHaveLength(0);
    });
  });

  // -- FromListNode --
  describe("FromListNode", () => {
    it("converts list of dicts to dataframe", async () => {
      const result = await new FromListNode().process({
        values: [
          { x: 1, y: "a" },
          { x: 2, y: "b" },
        ],
      });
      const out = result.output as DF;
      expect(out.rows).toHaveLength(2);
      expect(out.rows[0]).toEqual({ x: 1, y: "a" });
    });

    it("throws on non-dict items", async () => {
      await expect(
        new FromListNode().process({ values: [1, 2, 3] })
      ).rejects.toThrow("List must contain dicts");
    });

    it("unwraps {value: ...} wrappers", async () => {
      const result = await new FromListNode().process({
        values: [{ score: { value: 42 } }],
      });
      expect((result.output as DF).rows[0].score).toBe(42);
    });
  });

  // -- JSONToDataframeNode --
  describe("JSONToDataframeNode", () => {
    it("parses JSON array into dataframe", async () => {
      const result = await new JSONToDataframeNode().process({
        text: '[{"a":1},{"a":2}]',
      });
      const out = result.output as DF;
      expect(out.rows).toHaveLength(2);
      expect(out.rows[0].a).toBe(1);
    });

    it("handles empty array", async () => {
      const result = await new JSONToDataframeNode().process({ text: "[]" });
      expect((result.output as DF).rows).toHaveLength(0);
    });
  });

  // -- ToListNode --
  describe("ToListNode", () => {
    it("converts dataframe rows to list", async () => {
      const result = await new ToListNode().process({
        dataframe: df([{ a: 1 }, { a: 2 }]),
      });
      expect(result.output).toEqual([{ a: 1 }, { a: 2 }]);
    });
  });

  // -- FilterDataframeNode --
  describe("FilterDataframeNode", () => {
    const data = df([
      { name: "Alice", age: 30 },
      { name: "Bob", age: 25 },
      { name: "Carol", age: 35 },
    ]);

    it("filters rows by condition", async () => {
      const result = await new FilterDataframeNode().process({
        df: data,
        condition: "age > 28",
      });
      const out = result.output as DF;
      expect(out.rows).toHaveLength(2);
      expect(out.rows.map((r) => r.name)).toEqual(["Alice", "Carol"]);
    });

    it("returns all rows when condition is empty", async () => {
      const result = await new FilterDataframeNode().process({
        df: data,
        condition: "",
      });
      expect((result.output as DF).rows).toHaveLength(3);
    });

    it("supports 'and' / 'or' keywords", async () => {
      const result = await new FilterDataframeNode().process({
        df: data,
        condition: "age > 28 and age < 35",
      });
      expect((result.output as DF).rows).toHaveLength(1);
      expect((result.output as DF).rows[0].name).toBe("Alice");
    });
  });

  // -- SliceDataframeNode --
  describe("SliceDataframeNode", () => {
    const data = df([{ v: 1 }, { v: 2 }, { v: 3 }, { v: 4 }]);

    it("slices by start and end index", async () => {
      const result = await new SliceDataframeNode().process({
        dataframe: data,
        start_index: 1,
        end_index: 3,
      });
      expect((result.output as DF).rows).toEqual([{ v: 2 }, { v: 3 }]);
    });

    it("uses full length when end_index is -1", async () => {
      const result = await new SliceDataframeNode().process({
        dataframe: data,
        start_index: 2,
        end_index: -1,
      });
      expect((result.output as DF).rows).toEqual([{ v: 3 }, { v: 4 }]);
    });
  });

  // -- SelectColumnNode --
  describe("SelectColumnNode", () => {
    it("selects subset of columns", async () => {
      const result = await new SelectColumnNode().process({
        dataframe: df([{ a: 1, b: 2, c: 3 }]),
        columns: "a,c",
      });
      expect((result.output as DF).rows[0]).toEqual({ a: 1, c: 3 });
    });

    it("returns all columns when columns string is empty", async () => {
      const result = await new SelectColumnNode().process({
        dataframe: df([{ a: 1, b: 2 }]),
        columns: "",
      });
      expect((result.output as DF).rows[0]).toEqual({ a: 1, b: 2 });
    });
  });

  // -- ExtractColumnNode --
  describe("ExtractColumnNode", () => {
    it("extracts a single column as list", async () => {
      const result = await new ExtractColumnNode().process({
        dataframe: df([{ x: 10 }, { x: 20 }, { x: 30 }]),
        column_name: "x",
      });
      expect(result.output).toEqual([10, 20, 30]);
    });
  });

  // -- AddColumnNode --
  describe("AddColumnNode", () => {
    it("adds column values to rows", async () => {
      const result = await new AddColumnNode().process({
        dataframe: df([{ a: 1 }, { a: 2 }]),
        column_name: "b",
        values: [10, 20],
      });
      const out = result.output as DF;
      expect(out.rows[0]).toEqual({ a: 1, b: 10 });
      expect(out.rows[1]).toEqual({ a: 2, b: 20 });
    });
  });

  // -- MergeDataframeNode --
  describe("MergeDataframeNode", () => {
    it("merges two dataframes column-wise", async () => {
      const result = await new MergeDataframeNode().process({
        dataframe_a: df([{ a: 1 }, { a: 2 }]),
        dataframe_b: df([{ b: 10 }, { b: 20 }]),
      });
      const out = result.output as DF;
      expect(out.rows).toEqual([
        { a: 1, b: 10 },
        { a: 2, b: 20 },
      ]);
    });

    it("handles different lengths", async () => {
      const result = await new MergeDataframeNode().process({
        dataframe_a: df([{ a: 1 }]),
        dataframe_b: df([{ b: 10 }, { b: 20 }]),
      });
      const out = result.output as DF;
      expect(out.rows).toHaveLength(2);
      expect(out.rows[1]).toEqual({ b: 20 });
    });
  });

  // -- AppendDataframeNode --
  describe("AppendDataframeNode", () => {
    it("appends rows from two dataframes", async () => {
      const result = await new AppendDataframeNode().process({
        dataframe_a: df([{ x: 1 }]),
        dataframe_b: df([{ x: 2 }]),
      });
      expect((result.output as DF).rows).toEqual([{ x: 1 }, { x: 2 }]);
    });

    it("throws when columns do not match", async () => {
      await expect(
        new AppendDataframeNode().process({
          dataframe_a: df([{ a: 1 }]),
          dataframe_b: df([{ b: 2 }]),
        })
      ).rejects.toThrow("Columns in dataframe A do not match");
    });

    it("returns other dataframe when one is empty", async () => {
      const result = await new AppendDataframeNode().process({
        dataframe_a: df([]),
        dataframe_b: df([{ x: 5 }]),
      });
      expect((result.output as DF).rows).toEqual([{ x: 5 }]);
    });
  });

  // -- JoinDataframeNode --
  describe("JoinDataframeNode", () => {
    it("inner joins on key column", async () => {
      const result = await new JoinDataframeNode().process({
        dataframe_a: df([
          { id: 1, name: "Alice" },
          { id: 2, name: "Bob" },
        ]),
        dataframe_b: df([
          { id: 1, score: 90 },
          { id: 3, score: 70 },
        ]),
        join_on: "id",
      });
      const out = result.output as DF;
      expect(out.rows).toHaveLength(1);
      expect(out.rows[0]).toEqual({ id: 1, name: "Alice", score: 90 });
    });
  });

  // -- RowIteratorNode --
  describe("RowIteratorNode", () => {
    it("yields each row with index", async () => {
      const node = new RowIteratorNode();
      const items = await collectGen(
        node.genProcess({
          dataframe: df([{ v: "a" }, { v: "b" }]),
        })
      );
      expect(items).toEqual([
        { dict: { v: "a" }, index: 0 },
        { dict: { v: "b" }, index: 1 },
      ]);
    });
  });

  // -- FindRowNode --
  describe("FindRowNode", () => {
    it("finds first matching row", async () => {
      const result = await new FindRowNode().process({
        df: df([
          { name: "Alice", age: 30 },
          { name: "Bob", age: 25 },
        ]),
        condition: "age < 28",
      });
      const out = result.output as DF;
      expect(out.rows).toHaveLength(1);
      expect(out.rows[0].name).toBe("Bob");
    });

    it("returns empty when no match", async () => {
      const result = await new FindRowNode().process({
        df: df([{ name: "Alice", age: 30 }]),
        condition: "age > 100",
      });
      expect((result.output as DF).rows).toHaveLength(0);
    });
  });

  // -- SortByColumnNode --
  describe("SortByColumnNode", () => {
    it("sorts rows ascending by column", async () => {
      const result = await new SortByColumnNode().process({
        df: df([{ name: "Carol" }, { name: "Alice" }, { name: "Bob" }]),
        column: "name",
      });
      const names = (result.output as DF).rows.map((r) => r.name);
      expect(names).toEqual(["Alice", "Bob", "Carol"]);
    });
  });

  // -- DropDuplicatesNode --
  describe("DropDuplicatesNode", () => {
    it("removes duplicate rows", async () => {
      const result = await new DropDuplicatesNode().process({
        df: df([{ a: 1 }, { a: 2 }, { a: 1 }]),
      });
      expect((result.output as DF).rows).toEqual([{ a: 1 }, { a: 2 }]);
    });
  });

  // -- DropNANode --
  describe("DropNANode", () => {
    it("removes rows with null/undefined/empty values", async () => {
      const result = await new DropNANode().process({
        df: df([
          { a: 1, b: "ok" },
          { a: null, b: "ok" },
          { a: 3, b: "" },
          { a: 4, b: "fine" },
        ]),
      });
      const out = result.output as DF;
      expect(out.rows).toEqual([
        { a: 1, b: "ok" },
        { a: 4, b: "fine" },
      ]);
    });
  });

  // -- AggregateNode --
  describe("AggregateNode", () => {
    const data = df([
      { team: "A", score: 10 },
      { team: "A", score: 20 },
      { team: "B", score: 5 },
    ]);

    it("aggregates with sum", async () => {
      const result = await new AggregateNode().process({
        dataframe: data,
        columns: "team",
        aggregation: "sum",
      });
      const out = result.output as DF;
      expect(out.rows).toHaveLength(2);
      const teamA = out.rows.find((r) => r.team === "A");
      expect(teamA?.score).toBe(30);
    });

    it("aggregates with mean", async () => {
      const result = await new AggregateNode().process({
        dataframe: data,
        columns: "team",
        aggregation: "mean",
      });
      const teamA = (result.output as DF).rows.find((r) => r.team === "A");
      expect(teamA?.score).toBe(15);
    });

    it("aggregates with count", async () => {
      const result = await new AggregateNode().process({
        dataframe: data,
        columns: "team",
        aggregation: "count",
      });
      const teamA = (result.output as DF).rows.find((r) => r.team === "A");
      expect(teamA?.score).toBe(2);
    });

    it("aggregates with min/max", async () => {
      const minResult = await new AggregateNode().process({
        dataframe: data,
        columns: "team",
        aggregation: "min",
      });
      const maxResult = await new AggregateNode().process({
        dataframe: data,
        columns: "team",
        aggregation: "max",
      });
      const minA = (minResult.output as DF).rows.find((r) => r.team === "A");
      const maxA = (maxResult.output as DF).rows.find((r) => r.team === "A");
      expect(minA?.score).toBe(10);
      expect(maxA?.score).toBe(20);
    });

    it("throws on unknown aggregation", async () => {
      await expect(
        new AggregateNode().process({
          dataframe: data,
          columns: "team",
          aggregation: "bogus",
        })
      ).rejects.toThrow("Unknown aggregation function");
    });
  });

  // -- PivotNode --
  describe("PivotNode", () => {
    it("pivots data into grouped table", async () => {
      const result = await new PivotNode().process({
        dataframe: df([
          { region: "North", product: "A", sales: 10 },
          { region: "North", product: "B", sales: 20 },
          { region: "South", product: "A", sales: 30 },
        ]),
        index: "region",
        columns: "product",
        values: "sales",
        aggfunc: "sum",
      });
      const out = result.output as DF;
      expect(out.rows).toHaveLength(2);
      const north = out.rows.find((r) => r.region === "North");
      expect(north?.A).toBe(10);
      expect(north?.B).toBe(20);
    });
  });

  // -- RenameNode --
  describe("RenameNode", () => {
    it("renames columns using map string", async () => {
      const result = await new RenameNode().process({
        dataframe: df([{ old_name: 1, keep: 2 }]),
        rename_map: "old_name:new_name",
      });
      expect((result.output as DF).rows[0]).toEqual({ new_name: 1, keep: 2 });
    });

    it("handles multiple renames", async () => {
      const result = await new RenameNode().process({
        dataframe: df([{ a: 1, b: 2 }]),
        rename_map: "a:x,b:y",
      });
      expect((result.output as DF).rows[0]).toEqual({ x: 1, y: 2 });
    });
  });

  // -- FillNANode --
  describe("FillNANode", () => {
    it("fills missing values with constant", async () => {
      const result = await new FillNANode().process({
        dataframe: df([{ a: 1, b: null }, { a: null, b: 2 }]),
        method: "value",
        value: 0,
      });
      const out = result.output as DF;
      expect(out.rows[0]).toEqual({ a: 1, b: 0 });
      expect(out.rows[1]).toEqual({ a: 0, b: 2 });
    });

    it("fills with forward method", async () => {
      const result = await new FillNANode().process({
        dataframe: df([{ v: 10 }, { v: null }, { v: null }, { v: 40 }]),
        method: "forward",
      });
      const vals = (result.output as DF).rows.map((r) => r.v);
      expect(vals).toEqual([10, 10, 10, 40]);
    });

    it("fills with backward method", async () => {
      const result = await new FillNANode().process({
        dataframe: df([{ v: null }, { v: null }, { v: 30 }]),
        method: "backward",
      });
      const vals = (result.output as DF).rows.map((r) => r.v);
      expect(vals).toEqual([30, 30, 30]);
    });

    it("fills with mean method", async () => {
      const result = await new FillNANode().process({
        dataframe: df([{ v: 10 }, { v: null }, { v: 20 }]),
        method: "mean",
      });
      const vals = (result.output as DF).rows.map((r) => r.v);
      expect(vals).toEqual([10, 15, 20]);
    });

    it("fills with median method", async () => {
      const result = await new FillNANode().process({
        dataframe: df([{ v: 10 }, { v: null }, { v: 30 }]),
        method: "median",
      });
      expect((result.output as DF).rows[1].v).toBe(20);
    });

    it("fills only specified columns", async () => {
      const result = await new FillNANode().process({
        dataframe: df([{ a: null, b: null }]),
        method: "value",
        value: 99,
        columns: "a",
      });
      const row = (result.output as DF).rows[0];
      expect(row.a).toBe(99);
      expect(row.b).toBe(null);
    });

    it("throws on unknown method", async () => {
      await expect(
        new FillNANode().process({
          dataframe: df([{ a: 1 }]),
          method: "bogus",
        })
      ).rejects.toThrow("Unknown fill method");
    });
  });

  // -- FilterNoneNode --
  describe("FilterNoneNode", () => {
    it("returns empty for null value", async () => {
      expect(await new FilterNoneNode().process({ value: null })).toEqual({
        output: [],
      });
    });

    it("returns empty for undefined value", async () => {
      expect(
        await new FilterNoneNode().process({ value: undefined })
      ).toEqual({ output: [] });
    });

    it("passes through non-null values", async () => {
      expect(await new FilterNoneNode().process({ value: "hello" })).toEqual({
        output: "hello",
      });
      expect(await new FilterNoneNode().process({ value: 0 })).toEqual({
        output: 0,
      });
    });
  });
});

// ---------------------------------------------------------------------------
// DOCUMENT NODES
// ---------------------------------------------------------------------------

describe("document nodes", () => {
  // -- SplitDocumentNode --
  describe("SplitDocumentNode", () => {
    it("splits text into chunks", async () => {
      const text = "A".repeat(100);
      const node = new SplitDocumentNode();
      const chunks = await collectGen(
        node.genProcess({
          document: { text },
          chunk_size: 30,
          chunk_overlap: 5,
        })
      );
      expect(chunks.length).toBeGreaterThan(1);
      expect((chunks[0].chunk as string).length).toBe(30);
    });

    it("returns single chunk for short text", async () => {
      const node = new SplitDocumentNode();
      const chunks = await collectGen(
        node.genProcess({
          document: { text: "short" },
          chunk_size: 100,
          chunk_overlap: 0,
        })
      );
      expect(chunks).toHaveLength(1);
      expect(chunks[0].chunk).toBe("short");
    });

    it("returns empty for empty document", async () => {
      const node = new SplitDocumentNode();
      const chunks = await collectGen(
        node.genProcess({
          document: { text: "" },
          chunk_size: 100,
          chunk_overlap: 0,
        })
      );
      expect(chunks).toHaveLength(0);
    });
  });

  // -- SplitHTMLNode --
  describe("SplitHTMLNode", () => {
    it("strips HTML tags and chunks", async () => {
      const html = "<p>Hello</p> <b>World</b> " + "x".repeat(50);
      const node = new SplitHTMLNode();
      const chunks = await collectGen(
        node.genProcess({
          document: { text: html },
          chunk_size: 20,
          chunk_overlap: 0,
        })
      );
      expect(chunks.length).toBeGreaterThan(0);
      // First chunk should not contain HTML tags
      expect(chunks[0].chunk as string).not.toContain("<");
    });
  });

  // -- SplitJSONNode --
  describe("SplitJSONNode", () => {
    it("pretty-prints and chunks JSON", async () => {
      const json = JSON.stringify({ a: 1, b: [1, 2, 3], c: "hello" });
      const node = new SplitJSONNode();
      const chunks = await collectGen(
        node.genProcess({
          document: { text: json },
          chunk_size: 20,
          chunk_overlap: 0,
        })
      );
      expect(chunks.length).toBeGreaterThan(0);
    });
  });

  // -- SplitRecursivelyNode --
  describe("SplitRecursivelyNode", () => {
    it("splits by paragraphs then chunks", async () => {
      const text = "Para one content.\n\nPara two content.\n\nPara three.";
      const node = new SplitRecursivelyNode();
      const chunks = await collectGen(
        node.genProcess({
          document: { text },
          chunk_size: 25,
          chunk_overlap: 0,
        })
      );
      expect(chunks.length).toBeGreaterThan(1);
    });
  });

  // -- SplitMarkdownNode --
  describe("SplitMarkdownNode", () => {
    it("splits markdown preserving structure", async () => {
      const md = [
        "# Heading 1",
        "Some content under heading 1.",
        "",
        "# Heading 2",
        "Some content under heading 2.",
        "More content here that should make this section long enough.",
      ].join("\n");
      const node = new SplitMarkdownNode();
      const chunks = await collectGen(
        node.genProcess({
          document: { text: md },
          chunk_size: 40,
          chunk_overlap: 0,
        })
      );
      expect(chunks.length).toBeGreaterThan(1);
      // Each chunk should be a non-empty string
      for (const c of chunks) {
        expect((c.chunk as string).length).toBeGreaterThan(0);
      }
    });

    it("returns single chunk for short markdown", async () => {
      const node = new SplitMarkdownNode();
      const chunks = await collectGen(
        node.genProcess({
          document: { text: "# Hi\nShort." },
          chunk_size: 1000,
          chunk_overlap: 0,
        })
      );
      expect(chunks).toHaveLength(1);
    });
  });
});

// ---------------------------------------------------------------------------
// CODE NODES
// ---------------------------------------------------------------------------

describe("code nodes", () => {
  // -- ExecuteJavaScriptNode --
  describe("ExecuteJavaScriptNode", () => {
    it("executes JavaScript and captures stdout", async () => {
      const node = new ExecuteJavaScriptNode();
      const result = await node.process({
        script: 'console.log(2 + 3);',
      });
      expect(result.output).toContain("5");
      expect(result.exit_code).toBe(0);
      expect(result.success).toBe(true);
    });

    it("captures stderr on error", async () => {
      const node = new ExecuteJavaScriptNode();
      const result = await node.process({
        script: "process.exit(1);",
      });
      expect(result.exit_code).toBe(1);
      expect(result.success).toBe(false);
    });

    it("returns computed values via stdout", async () => {
      const node = new ExecuteJavaScriptNode();
      const result = await node.process({
        script: 'console.log(JSON.stringify({x: 42}));',
      });
      expect(result.output).toContain('{"x":42}');
    });
  });

  // -- ExecuteBashNode --
  describe("ExecuteBashNode", () => {
    it("executes bash script", async () => {
      const node = new ExecuteBashNode();
      const result = await node.process({
        script: "echo hello-bash",
      });
      expect(result.output).toContain("hello-bash");
      expect(result.exit_code).toBe(0);
      expect(result.success).toBe(true);
    });

    it("handles variables and arithmetic", async () => {
      const node = new ExecuteBashNode();
      const result = await node.process({
        script: 'X=10; Y=20; echo $((X + Y))',
      });
      expect(result.output).toContain("30");
    });

    it("reports non-zero exit code", async () => {
      const node = new ExecuteBashNode();
      const result = await node.process({
        script: "exit 42",
      });
      expect(result.exit_code).toBe(42);
      expect(result.success).toBe(false);
    });
  });

  // -- ExecuteCommandNode --
  describe("ExecuteCommandNode", () => {
    it("executes a shell command string", async () => {
      const node = new ExecuteCommandNode();
      const result = await node.process({
        command: "echo command-test",
      });
      expect(result.output).toContain("command-test");
      expect(result.exit_code).toBe(0);
    });
  });

  // -- RunJavaScriptCommandNode --
  describe("RunJavaScriptCommandNode", () => {
    it("runs node -e with a command string", async () => {
      const node = new RunJavaScriptCommandNode();
      const result = await node.process({
        command: 'console.log("runjscmd")',
      });
      expect(result.output).toContain("runjscmd");
      expect(result.exit_code).toBe(0);
    });
  });

  // -- RunBashCommandNode --
  describe("RunBashCommandNode", () => {
    it("runs bash -c with a command string", async () => {
      const node = new RunBashCommandNode();
      const result = await node.process({
        command: 'echo "runbashcmd"',
      });
      expect(result.output).toContain("runbashcmd");
      expect(result.exit_code).toBe(0);
    });
  });

  // -- RunShellCommandNode --
  describe("RunShellCommandNode", () => {
    it("runs sh -c with a command string", async () => {
      const node = new RunShellCommandNode();
      const result = await node.process({
        command: "echo shell-cmd-test",
      });
      expect(result.output).toContain("shell-cmd-test");
      expect(result.exit_code).toBe(0);
      expect(result.success).toBe(true);
    });
  });
});
