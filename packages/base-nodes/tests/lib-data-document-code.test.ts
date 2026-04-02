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
      const result = await node.process();
      expect(result.output).toEqual({ name: "string", age: "int" });
    });

    it("returns empty object when no columns configured", async () => {
      const node = new SchemaNode();
      const result = await node.process();
      expect(result.output).toEqual({ type: "record_type", columns: [] });
    });
  });

  // -- ImportCSVNode --
  describe("ImportCSVNode", () => {
    it("parses CSV string into dataframe rows", async () => {
      const node = new ImportCSVNode();
      Object.assign(node, {
        csv_data: "name,age\nAlice,30\nBob,25",
      });
      const result = await node.process();
      const out = result.output as DF;
      expect(out.rows).toHaveLength(2);
      expect(out.rows[0]).toEqual({ name: "Alice", age: 30 });
      expect(out.rows[1]).toEqual({ name: "Bob", age: 25 });
    });

    it("handles empty CSV", async () => {
      const result = await Object.assign(new ImportCSVNode(), { csv_data: "" }).process();
      expect((result.output as DF).rows).toHaveLength(0);
    });

    it("handles CSV with only headers", async () => {
      const result = await Object.assign(new ImportCSVNode(), {
        csv_data: "a,b,c",
      }).process();
      expect((result.output as DF).rows).toHaveLength(0);
    });
  });

  // -- FromListNode --
  describe("FromListNode", () => {
    it("converts list of dicts to dataframe", async () => {
      const result = await Object.assign(new FromListNode(), {
        values: [
          { x: 1, y: "a" },
          { x: 2, y: "b" },
        ],
      }).process();
      const out = result.output as DF;
      expect(out.rows).toHaveLength(2);
      expect(out.rows[0]).toEqual({ x: 1, y: "a" });
    });

    it("throws on non-dict items", async () => {
      await expect(
        Object.assign(new FromListNode(), { values: [1, 2, 3] }).process()
      ).rejects.toThrow("List must contain dicts");
    });

    it("unwraps {value: ...} wrappers", async () => {
      const result = await Object.assign(new FromListNode(), {
        values: [{ score: { value: 42 } }],
      }).process();
      expect((result.output as DF).rows[0].score).toBe(42);
    });
  });

  // -- JSONToDataframeNode --
  describe("JSONToDataframeNode", () => {
    it("parses JSON array into dataframe", async () => {
      const result = await Object.assign(new JSONToDataframeNode(), {
        text: '[{"a":1},{"a":2}]',
      }).process();
      const out = result.output as DF;
      expect(out.rows).toHaveLength(2);
      expect(out.rows[0].a).toBe(1);
    });

    it("handles empty array", async () => {
      const result = await Object.assign(new JSONToDataframeNode(), { text: "[]" }).process();
      expect((result.output as DF).rows).toHaveLength(0);
    });
  });

  // -- ToListNode --
  describe("ToListNode", () => {
    it("converts dataframe rows to list", async () => {
      const result = await Object.assign(new ToListNode(), {
        dataframe: df([{ a: 1 }, { a: 2 }]),
      }).process();
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
      const result = await Object.assign(new FilterDataframeNode(), {
        df: data,
        condition: "age > 28",
      }).process();
      const out = result.output as DF;
      expect(out.rows).toHaveLength(2);
      expect(out.rows.map((r) => r.name)).toEqual(["Alice", "Carol"]);
    });

    it("returns all rows when condition is empty", async () => {
      const result = await Object.assign(new FilterDataframeNode(), {
        df: data,
        condition: "",
      }).process();
      expect((result.output as DF).rows).toHaveLength(3);
    });

    it("supports 'and' / 'or' keywords", async () => {
      const result = await Object.assign(new FilterDataframeNode(), {
        df: data,
        condition: "age > 28 and age < 35",
      }).process();
      expect((result.output as DF).rows).toHaveLength(1);
      expect((result.output as DF).rows[0].name).toBe("Alice");
    });
  });

  // -- SliceDataframeNode --
  describe("SliceDataframeNode", () => {
    const data = df([{ v: 1 }, { v: 2 }, { v: 3 }, { v: 4 }]);

    it("slices by start and end index", async () => {
      const result = await Object.assign(new SliceDataframeNode(), {
        dataframe: data,
        start_index: 1,
        end_index: 3,
      }).process();
      expect((result.output as DF).rows).toEqual([{ v: 2 }, { v: 3 }]);
    });

    it("uses full length when end_index is -1", async () => {
      const result = await Object.assign(new SliceDataframeNode(), {
        dataframe: data,
        start_index: 2,
        end_index: -1,
      }).process();
      expect((result.output as DF).rows).toEqual([{ v: 3 }, { v: 4 }]);
    });
  });

  // -- SelectColumnNode --
  describe("SelectColumnNode", () => {
    it("selects subset of columns", async () => {
      const result = await Object.assign(new SelectColumnNode(), {
        dataframe: df([{ a: 1, b: 2, c: 3 }]),
        columns: "a,c",
      }).process();
      expect((result.output as DF).rows[0]).toEqual({ a: 1, c: 3 });
    });

    it("returns all columns when columns string is empty", async () => {
      const result = await Object.assign(new SelectColumnNode(), {
        dataframe: df([{ a: 1, b: 2 }]),
        columns: "",
      }).process();
      expect((result.output as DF).rows[0]).toEqual({ a: 1, b: 2 });
    });
  });

  // -- ExtractColumnNode --
  describe("ExtractColumnNode", () => {
    it("extracts a single column as list", async () => {
      const result = await Object.assign(new ExtractColumnNode(), {
        dataframe: df([{ x: 10 }, { x: 20 }, { x: 30 }]),
        column_name: "x",
      }).process();
      expect(result.output).toEqual([10, 20, 30]);
    });
  });

  // -- AddColumnNode --
  describe("AddColumnNode", () => {
    it("adds column values to rows", async () => {
      const result = await Object.assign(new AddColumnNode(), {
        dataframe: df([{ a: 1 }, { a: 2 }]),
        column_name: "b",
        values: [10, 20],
      }).process();
      const out = result.output as DF;
      expect(out.rows[0]).toEqual({ a: 1, b: 10 });
      expect(out.rows[1]).toEqual({ a: 2, b: 20 });
    });
  });

  // -- MergeDataframeNode --
  describe("MergeDataframeNode", () => {
    it("merges two dataframes column-wise", async () => {
      const result = await Object.assign(new MergeDataframeNode(), {
        dataframe_a: df([{ a: 1 }, { a: 2 }]),
        dataframe_b: df([{ b: 10 }, { b: 20 }]),
      }).process();
      const out = result.output as DF;
      expect(out.rows).toEqual([
        { a: 1, b: 10 },
        { a: 2, b: 20 },
      ]);
    });

    it("handles different lengths", async () => {
      const result = await Object.assign(new MergeDataframeNode(), {
        dataframe_a: df([{ a: 1 }]),
        dataframe_b: df([{ b: 10 }, { b: 20 }]),
      }).process();
      const out = result.output as DF;
      expect(out.rows).toHaveLength(2);
      expect(out.rows[1]).toEqual({ b: 20 });
    });
  });

  // -- AppendDataframeNode --
  describe("AppendDataframeNode", () => {
    it("appends rows from two dataframes", async () => {
      const result = await Object.assign(new AppendDataframeNode(), {
        dataframe_a: df([{ x: 1 }]),
        dataframe_b: df([{ x: 2 }]),
      }).process();
      expect((result.output as DF).rows).toEqual([{ x: 1 }, { x: 2 }]);
    });

    it("throws when columns do not match", async () => {
      await expect(
        Object.assign(new AppendDataframeNode(), {
          dataframe_a: df([{ a: 1 }]),
          dataframe_b: df([{ b: 2 }]),
        }).process()
      ).rejects.toThrow("Columns in dataframe A do not match");
    });

    it("returns other dataframe when one is empty", async () => {
      const result = await Object.assign(new AppendDataframeNode(), {
        dataframe_a: df([]),
        dataframe_b: df([{ x: 5 }]),
      }).process();
      expect((result.output as DF).rows).toEqual([{ x: 5 }]);
    });
  });

  // -- JoinDataframeNode --
  describe("JoinDataframeNode", () => {
    it("inner joins on key column", async () => {
      const result = await Object.assign(new JoinDataframeNode(), {
        dataframe_a: df([
          { id: 1, name: "Alice" },
          { id: 2, name: "Bob" },
        ]),
        dataframe_b: df([
          { id: 1, score: 90 },
          { id: 3, score: 70 },
        ]),
        join_on: "id",
      }).process();
      const out = result.output as DF;
      expect(out.rows).toHaveLength(1);
      expect(out.rows[0]).toEqual({ id: 1, name: "Alice", score: 90 });
    });
  });

  // -- RowIteratorNode --
  describe("RowIteratorNode", () => {
    it("yields each row with index", async () => {
      const node = new RowIteratorNode();
      Object.assign(node, { dataframe: df([{ v: "a" }, { v: "b" }]) });
      const items = await collectGen(node.genProcess());
      expect(items).toEqual([
        { dict: { v: "a" }, index: 0 },
        { dict: { v: "b" }, index: 1 },
      ]);
    });
  });

  // -- FindRowNode --
  describe("FindRowNode", () => {
    it("finds first matching row", async () => {
      const result = await Object.assign(new FindRowNode(), {
        df: df([
          { name: "Alice", age: 30 },
          { name: "Bob", age: 25 },
        ]),
        condition: "age < 28",
      }).process();
      const out = result.output as DF;
      expect(out.rows).toHaveLength(1);
      expect(out.rows[0].name).toBe("Bob");
    });

    it("returns empty when no match", async () => {
      const result = await Object.assign(new FindRowNode(), {
        df: df([{ name: "Alice", age: 30 }]),
        condition: "age > 100",
      }).process();
      expect((result.output as DF).rows).toHaveLength(0);
    });
  });

  // -- SortByColumnNode --
  describe("SortByColumnNode", () => {
    it("sorts rows ascending by column", async () => {
      const result = await Object.assign(new SortByColumnNode(), {
        df: df([{ name: "Carol" }, { name: "Alice" }, { name: "Bob" }]),
        column: "name",
      }).process();
      const names = (result.output as DF).rows.map((r) => r.name);
      expect(names).toEqual(["Alice", "Bob", "Carol"]);
    });
  });

  // -- DropDuplicatesNode --
  describe("DropDuplicatesNode", () => {
    it("removes duplicate rows", async () => {
      const result = await Object.assign(new DropDuplicatesNode(), {
        df: df([{ a: 1 }, { a: 2 }, { a: 1 }]),
      }).process();
      expect((result.output as DF).rows).toEqual([{ a: 1 }, { a: 2 }]);
    });
  });

  // -- DropNANode --
  describe("DropNANode", () => {
    it("removes rows with null/undefined/empty values", async () => {
      const result = await Object.assign(new DropNANode(), {
        df: df([
          { a: 1, b: "ok" },
          { a: null, b: "ok" },
          { a: 3, b: "" },
          { a: 4, b: "fine" },
        ]),
      }).process();
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
      const result = await Object.assign(new AggregateNode(), {
        dataframe: data,
        columns: "team",
        aggregation: "sum",
      }).process();
      const out = result.output as DF;
      expect(out.rows).toHaveLength(2);
      const teamA = out.rows.find((r) => r.team === "A");
      expect(teamA?.score).toBe(30);
    });

    it("aggregates with mean", async () => {
      const result = await Object.assign(new AggregateNode(), {
        dataframe: data,
        columns: "team",
        aggregation: "mean",
      }).process();
      const teamA = (result.output as DF).rows.find((r) => r.team === "A");
      expect(teamA?.score).toBe(15);
    });

    it("aggregates with count", async () => {
      const result = await Object.assign(new AggregateNode(), {
        dataframe: data,
        columns: "team",
        aggregation: "count",
      }).process();
      const teamA = (result.output as DF).rows.find((r) => r.team === "A");
      expect(teamA?.score).toBe(2);
    });

    it("aggregates with min/max", async () => {
      const minResult = await Object.assign(new AggregateNode(), {
        dataframe: data,
        columns: "team",
        aggregation: "min",
      }).process();
      const maxResult = await Object.assign(new AggregateNode(), {
        dataframe: data,
        columns: "team",
        aggregation: "max",
      }).process();
      const minA = (minResult.output as DF).rows.find((r) => r.team === "A");
      const maxA = (maxResult.output as DF).rows.find((r) => r.team === "A");
      expect(minA?.score).toBe(10);
      expect(maxA?.score).toBe(20);
    });

    it("throws on unknown aggregation", async () => {
      await expect(
        Object.assign(new AggregateNode(), {
          dataframe: data,
          columns: "team",
          aggregation: "bogus",
        }).process()
      ).rejects.toThrow("Unknown aggregation function");
    });
  });

  // -- PivotNode --
  describe("PivotNode", () => {
    it("pivots data into grouped table", async () => {
      const result = await Object.assign(new PivotNode(), {
        dataframe: df([
          { region: "North", product: "A", sales: 10 },
          { region: "North", product: "B", sales: 20 },
          { region: "South", product: "A", sales: 30 },
        ]),
        index: "region",
        columns: "product",
        values: "sales",
        aggfunc: "sum",
      }).process();
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
      const result = await Object.assign(new RenameNode(), {
        dataframe: df([{ old_name: 1, keep: 2 }]),
        rename_map: "old_name:new_name",
      }).process();
      expect((result.output as DF).rows[0]).toEqual({ new_name: 1, keep: 2 });
    });

    it("handles multiple renames", async () => {
      const result = await Object.assign(new RenameNode(), {
        dataframe: df([{ a: 1, b: 2 }]),
        rename_map: "a:x,b:y",
      }).process();
      expect((result.output as DF).rows[0]).toEqual({ x: 1, y: 2 });
    });
  });

  // -- FillNANode --
  describe("FillNANode", () => {
    it("fills missing values with constant", async () => {
      const result = await Object.assign(new FillNANode(), {
        dataframe: df([{ a: 1, b: null }, { a: null, b: 2 }]),
        method: "value",
        value: 0,
      }).process();
      const out = result.output as DF;
      expect(out.rows[0]).toEqual({ a: 1, b: 0 });
      expect(out.rows[1]).toEqual({ a: 0, b: 2 });
    });

    it("fills with forward method", async () => {
      const result = await Object.assign(new FillNANode(), {
        dataframe: df([{ v: 10 }, { v: null }, { v: null }, { v: 40 }]),
        method: "forward",
      }).process();
      const vals = (result.output as DF).rows.map((r) => r.v);
      expect(vals).toEqual([10, 10, 10, 40]);
    });

    it("fills with backward method", async () => {
      const result = await Object.assign(new FillNANode(), {
        dataframe: df([{ v: null }, { v: null }, { v: 30 }]),
        method: "backward",
      }).process();
      const vals = (result.output as DF).rows.map((r) => r.v);
      expect(vals).toEqual([30, 30, 30]);
    });

    it("fills with mean method", async () => {
      const result = await Object.assign(new FillNANode(), {
        dataframe: df([{ v: 10 }, { v: null }, { v: 20 }]),
        method: "mean",
      }).process();
      const vals = (result.output as DF).rows.map((r) => r.v);
      expect(vals).toEqual([10, 15, 20]);
    });

    it("fills with median method", async () => {
      const result = await Object.assign(new FillNANode(), {
        dataframe: df([{ v: 10 }, { v: null }, { v: 30 }]),
        method: "median",
      }).process();
      expect((result.output as DF).rows[1].v).toBe(20);
    });

    it("fills only specified columns", async () => {
      const result = await Object.assign(new FillNANode(), {
        dataframe: df([{ a: null, b: null }]),
        method: "value",
        value: 99,
        columns: "a",
      }).process();
      const row = (result.output as DF).rows[0];
      expect(row.a).toBe(99);
      expect(row.b).toBe(null);
    });

    it("throws on unknown method", async () => {
      await expect(
        Object.assign(new FillNANode(), {
          dataframe: df([{ a: 1 }]),
          method: "bogus",
        }).process()
      ).rejects.toThrow("Unknown fill method");
    });
  });

  // -- FilterNoneNode --
  describe("FilterNoneNode", () => {
    it("returns empty for null value", async () => {
      const node = new FilterNoneNode();
      (node as any).value = null;
      expect(await node.process()).toEqual({});
    });

    it("returns empty for undefined value", async () => {
      const node = new FilterNoneNode();
      (node as any).value = undefined;
      expect(await node.process()).toEqual({});
    });

    it("passes through non-null values", async () => {
      expect(await Object.assign(new FilterNoneNode(), { value: "hello" }).process()).toEqual({
        output: "hello",
      });
      expect(await Object.assign(new FilterNoneNode(), { value: 0 }).process()).toEqual({
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
    it("splits text into chunks with correct metadata", async () => {
      const text = "A".repeat(100);
      const node = new SplitDocumentNode();
      Object.assign(node, { document: { text, uri: "test-split" }, chunk_size: 30, chunk_overlap: 5 });
      const chunks = await collectGen(node.genProcess());
      // step = 30 - 5 = 25, so chunks at 0, 25, 50, 75
      expect(chunks).toHaveLength(4);
      expect(chunks[0]).toEqual({
        chunk: "A".repeat(30),
        text: "A".repeat(30),
        source_id: "test-split",
        start_index: 0,
      });
      expect(chunks[1]).toEqual({
        chunk: "A".repeat(30),
        text: "A".repeat(30),
        source_id: "test-split",
        start_index: 25,
      });
      expect(chunks[2]).toEqual({
        chunk: "A".repeat(30),
        text: "A".repeat(30),
        source_id: "test-split",
        start_index: 50,
      });
      expect(chunks[3]).toEqual({
        chunk: "A".repeat(25),
        text: "A".repeat(25),
        source_id: "test-split",
        start_index: 75,
      });
    });

    it("returns single chunk for short text with correct fields", async () => {
      const node = new SplitDocumentNode();
      Object.assign(node, {
          document: { text: "short", uri: "my-doc" },
          chunk_size: 100,
          chunk_overlap: 0,
        });
      const chunks = await collectGen(node.genProcess());
      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toEqual({
        chunk: "short",
        text: "short",
        source_id: "my-doc",
        start_index: 0,
      });
    });

    it("falls back to 'document' source_id when no uri", async () => {
      const node = new SplitDocumentNode();
      Object.assign(node, {
          document: { text: "hello" },
          chunk_size: 100,
          chunk_overlap: 0,
        });
      const chunks = await collectGen(node.genProcess());
      expect(chunks).toHaveLength(1);
      expect(chunks[0].source_id).toBe("document");
    });

    it("returns empty for empty document", async () => {
      const node = new SplitDocumentNode();
      Object.assign(node, {
          document: { text: "" },
          chunk_size: 100,
          chunk_overlap: 0,
        });
      const chunks = await collectGen(node.genProcess());
      expect(chunks).toHaveLength(0);
    });
  });

  // -- SplitHTMLNode --
  describe("SplitHTMLNode", () => {
    it("strips HTML tags and chunks with correct metadata", async () => {
      const html = "<p>Hello</p> <b>World</b> " + "x".repeat(50);
      const node = new SplitHTMLNode();
      Object.assign(node, {
          document: { text: html, uri: "test-html" },
          chunk_size: 20,
          chunk_overlap: 0,
        });
      const chunks = await collectGen(node.genProcess());
      // After stripping: "Hello World " + "x".repeat(50) = 62 chars
      // chunk_size=20, overlap=0, step=20 => chunks at 0, 20, 40, 60
      const stripped = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      expect(chunks).toHaveLength(4);
      expect(chunks[0]).toEqual({
        chunk: stripped.slice(0, 20),
        text: stripped.slice(0, 20),
        source_id: "test-html",
        start_index: 0,
      });
      expect(chunks[1]).toEqual({
        chunk: stripped.slice(20, 40),
        text: stripped.slice(20, 40),
        source_id: "test-html",
        start_index: 20,
      });
      // No chunk should contain HTML tags
      for (const c of chunks) {
        expect(c.text as string).not.toContain("<");
        expect(typeof c.source_id).toBe("string");
        expect(typeof c.start_index).toBe("number");
      }
    });

    it("returns single chunk for short HTML", async () => {
      const node = new SplitHTMLNode();
      Object.assign(node, {
          document: { text: "<b>Hi</b>", uri: "short-html" },
          chunk_size: 100,
          chunk_overlap: 0,
        });
      const chunks = await collectGen(node.genProcess());
      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toEqual({
        chunk: "Hi",
        text: "Hi",
        source_id: "short-html",
        start_index: 0,
      });
    });
  });

  // -- SplitJSONNode --
  describe("SplitJSONNode", () => {
    it("pretty-prints and chunks JSON with correct metadata", async () => {
      const json = JSON.stringify({ a: 1, b: [1, 2, 3], c: "hello" });
      const rendered = JSON.stringify(JSON.parse(json), null, 2);
      const node = new SplitJSONNode();
      Object.assign(node, {
          document: { text: json, uri: "test-json" },
          chunk_size: 20,
          chunk_overlap: 0,
        });
      const chunks = await collectGen(node.genProcess());
      // rendered is ~60 chars, chunk_size=20, step=20
      expect(chunks.length).toBeGreaterThan(1);
      expect(chunks[0]).toEqual({
        chunk: rendered.slice(0, 20),
        text: rendered.slice(0, 20),
        source_id: "test-json",
        start_index: 0,
      });
      // Verify all chunks have correct types and reconstruct the text
      let reconstructed = "";
      for (let i = 0; i < chunks.length; i++) {
        expect(typeof chunks[i].text).toBe("string");
        expect(typeof chunks[i].source_id).toBe("string");
        expect(typeof chunks[i].start_index).toBe("number");
        expect(chunks[i].source_id).toBe("test-json");
        expect(chunks[i].chunk).toBe(chunks[i].text);
        reconstructed += (chunks[i].text as string);
      }
      // With no overlap, concatenating all chunks should yield the full rendered text
      expect(reconstructed).toBe(rendered);
    });

    it("returns single chunk for small JSON", async () => {
      const node = new SplitJSONNode();
      Object.assign(node, {
          document: { text: '{"x":1}', uri: "tiny-json" },
          chunk_size: 1000,
          chunk_overlap: 0,
        });
      const chunks = await collectGen(node.genProcess());
      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toEqual({
        chunk: JSON.stringify({ x: 1 }, null, 2),
        text: JSON.stringify({ x: 1 }, null, 2),
        source_id: "tiny-json",
        start_index: 0,
      });
    });
  });

  // -- SplitRecursivelyNode --
  describe("SplitRecursivelyNode", () => {
    it("splits by paragraphs then chunks", async () => {
      const text = "Para one content.\n\nPara two content.\n\nPara three.";
      const node = new SplitRecursivelyNode();
      Object.assign(node, {
          document: { text },
          chunk_size: 25,
          chunk_overlap: 0,
        });
      const chunks = await collectGen(node.genProcess());
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
      Object.assign(node, {
          document: { text: md },
          chunk_size: 40,
          chunk_overlap: 0,
        });
      const chunks = await collectGen(node.genProcess());
      expect(chunks.length).toBeGreaterThan(1);
      // Each chunk should be a non-empty string
      for (const c of chunks) {
        expect((c.chunk as string).length).toBeGreaterThan(0);
      }
    });

    it("returns single chunk for short markdown", async () => {
      const node = new SplitMarkdownNode();
      Object.assign(node, {
          document: { text: "# Hi\nShort." },
          chunk_size: 1000,
          chunk_overlap: 0,
        });
      const chunks = await collectGen(node.genProcess());
      expect(chunks).toHaveLength(1);
    });
  });
});

// ---------------------------------------------------------------------------
// CODE NODES
// ---------------------------------------------------------------------------

describe("code nodes", () => {
  // -- ExecuteJavaScriptNode (requires Docker) --
  describe.skip("ExecuteJavaScriptNode (requires Docker)", () => {
    it("executes JavaScript and captures stdout", async () => {
      const node = new ExecuteJavaScriptNode();
      Object.assign(node, {
        code: 'console.log(2 + 3);',
      });
      const result = await node.process();
      expect(result.output).toContain("5");
      expect(result.exit_code).toBe(0);
      expect(result.success).toBe(true);
    });

    it("captures stderr on error", async () => {
      const node = new ExecuteJavaScriptNode();
      Object.assign(node, {
        code: "process.exit(1);",
      });
      const result = await node.process();
      expect(result.exit_code).toBe(1);
      expect(result.success).toBe(false);
    });

    it("returns computed values via stdout", async () => {
      const node = new ExecuteJavaScriptNode();
      Object.assign(node, {
        code: 'console.log(JSON.stringify({x: 42}));',
      });
      const result = await node.process();
      expect(result.output).toContain('{"x":42}');
    });
  });

  // -- ExecuteBashNode (requires Docker) --
  describe.skip("ExecuteBashNode (requires Docker)", () => {
    it("executes bash script", async () => {
      const node = new ExecuteBashNode();
      Object.assign(node, {
        code: "echo hello-bash",
      });
      const result = await node.process();
      expect(result.output).toContain("hello-bash");
      expect(result.exit_code).toBe(0);
      expect(result.success).toBe(true);
    });

    it("handles variables and arithmetic", async () => {
      const node = new ExecuteBashNode();
      Object.assign(node, {
        code: 'X=10; Y=20; echo $((X + Y))',
      });
      const result = await node.process();
      expect(result.output).toContain("30");
    });

    it("reports non-zero exit code", async () => {
      const node = new ExecuteBashNode();
      Object.assign(node, {
        code: "exit 42",
      });
      const result = await node.process();
      expect(result.exit_code).toBe(42);
      expect(result.success).toBe(false);
    });
  });

  // -- ExecuteCommandNode (requires Docker) --
  describe.skip("ExecuteCommandNode (requires Docker)", () => {
    it("executes a shell command string", async () => {
      const node = new ExecuteCommandNode();
      Object.assign(node, {
        command: "echo command-test",
      });
      const result = await node.process();
      expect(result.output).toContain("command-test");
      expect(result.exit_code).toBe(0);
    });
  });

  // -- RunJavaScriptCommandNode --
  describe("RunJavaScriptCommandNode", () => {
    it("runs node -e with a command string", async () => {
      const node = new RunJavaScriptCommandNode();
      Object.assign(node, {
        command: 'console.log("runjscmd")',
      });
      const result = await node.process();
      expect(result.output).toContain("runjscmd");
      expect(result.exit_code).toBe(0);
    });
  });

  // -- RunBashCommandNode --
  describe("RunBashCommandNode", () => {
    it("runs bash -c with a command string", async () => {
      const node = new RunBashCommandNode();
      Object.assign(node, {
        command: 'echo "runbashcmd"',
      });
      const result = await node.process();
      expect(result.output).toContain("runbashcmd");
      expect(result.exit_code).toBe(0);
    });
  });

  // -- RunShellCommandNode --
  describe("RunShellCommandNode", () => {
    it("runs sh -c with a command string", async () => {
      const node = new RunShellCommandNode();
      Object.assign(node, {
        command: "echo shell-cmd-test",
      });
      const result = await node.process();
      expect(result.output).toContain("shell-cmd-test");
      expect(result.exit_code).toBe(0);
      expect(result.success).toBe(true);
    });
  });
});
