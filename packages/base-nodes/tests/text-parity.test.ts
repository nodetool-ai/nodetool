import { describe, expect, it } from "vitest";
import { makeRegistry, makeRunner } from "./e2e/helpers.js";
import type { Edge, NodeDescriptor } from "@nodetool/protocol";
import {
  CapitalizeTextNode,
  CollapseWhitespaceNode,
  ConcatTextNode,
  ConstantIntegerNode,
  ConstantStringNode,
  ContainsTextNode,
  EndsWithTextNode,
  EqualsTextNode,
  FormatTextNode,
  HtmlToTextNode,
  IsEmptyTextNode,
  JoinTextNode,
  LengthTextNode,
  OutputNode,
  RegexReplaceNode,
  RegexSplitNode,
  RegexValidateNode,
  RemovePunctuationNode,
  SlugifyNode,
  SplitTextNode,
  StartsWithTextNode,
  SurroundWithTextNode,
  TemplateTextNode,
  TextParseJSONNode,
  ToLowercaseNode,
  ToStringNode,
  ToTitlecaseNode,
  ToUppercaseNode,
  TrimWhitespaceNode,
} from "../src/index.js";

async function runWorkflow(nodes: NodeDescriptor[], edges: Edge[]) {
  return makeRunner(makeRegistry()).run(
    { job_id: `text-parity-${Date.now()}` },
    { nodes, edges },
  );
}

function outputValue(
  result: Awaited<ReturnType<typeof runWorkflow>>,
  name: string,
): unknown {
  return result.outputs[name]?.[0];
}

function stringNode(id: string, value: string): NodeDescriptor {
  return { id, type: ConstantStringNode.nodeType, properties: { value } };
}

function intNode(id: string, value: number): NodeDescriptor {
  return { id, type: ConstantIntegerNode.nodeType, properties: { value } };
}

describe("text parity: core composition workflows", () => {
  it("matches concat, template, regex replace, split-join, and contains workflows", async () => {
    const concat = await runWorkflow(
      [
        stringNode("a", "Hello, "),
        stringNode("b", "World!"),
        { id: "concat", type: ConcatTextNode.nodeType },
        { id: "out", type: OutputNode.nodeType, name: "text" },
      ],
      [
        { source: "a", sourceHandle: "output", target: "concat", targetHandle: "a" },
        { source: "b", sourceHandle: "output", target: "concat", targetHandle: "b" },
        { source: "concat", sourceHandle: "output", target: "out", targetHandle: "value" },
      ],
    );
    expect(outputValue(concat, "text")).toBe("Hello, World!");

    const template = await runWorkflow(
      [
        {
          id: "template",
          type: TemplateTextNode.nodeType,
          properties: {
            string: "Hello, {{ name }}! Today is {{ day }}.",
            values: { name: "Alice", day: "Monday" },
          },
        },
        { id: "out", type: OutputNode.nodeType, name: "text" },
      ],
      [{ source: "template", sourceHandle: "output", target: "out", targetHandle: "value" }],
    );
    expect(outputValue(template, "text")).toBe("Hello, Alice! Today is Monday.");

    const regexReplace = await runWorkflow(
      [
        {
          id: "replace",
          type: RegexReplaceNode.nodeType,
          properties: {
            text: "The color is grey and gray",
            pattern: "gr[ae]y",
            replacement: "blue",
            count: 1,
          },
        },
        { id: "out", type: OutputNode.nodeType, name: "text" },
      ],
      [{ source: "replace", sourceHandle: "output", target: "out", targetHandle: "value" }],
    );
    expect(outputValue(regexReplace, "text")).toBe("The color is blue and gray");

    const splitJoin = await runWorkflow(
      [
        stringNode("csv", "apple,banana,orange"),
        { id: "split", type: SplitTextNode.nodeType, properties: { delimiter: "," } },
        { id: "join", type: JoinTextNode.nodeType, properties: { separator: " | " } },
        { id: "out", type: OutputNode.nodeType, name: "text" },
      ],
      [
        { source: "csv", sourceHandle: "output", target: "split", targetHandle: "text" },
        { source: "split", sourceHandle: "output", target: "join", targetHandle: "strings" },
        { source: "join", sourceHandle: "output", target: "out", targetHandle: "value" },
      ],
    );
    expect(outputValue(splitJoin, "text")).toBe("apple | banana | orange");

    const contains = await runWorkflow(
      [
        {
          id: "contains",
          type: ContainsTextNode.nodeType,
          properties: {
            text: "Python programming is fun",
            substring: "programming",
            case_sensitive: true,
          },
        },
        { id: "out", type: OutputNode.nodeType, name: "ok" },
      ],
      [{ source: "contains", sourceHandle: "output", target: "out", targetHandle: "value" }],
    );
    expect(outputValue(contains, "ok")).toBe(true);
  });

  it("normalizes display names and slugs like the Python text workflows", async () => {
    const display = await runWorkflow(
      [
        stringNode("raw", "   jane   DOE  "),
        { id: "trim", type: TrimWhitespaceNode.nodeType },
        { id: "collapse", type: CollapseWhitespaceNode.nodeType },
        { id: "title", type: ToTitlecaseNode.nodeType },
        { id: "out", type: OutputNode.nodeType, name: "name" },
      ],
      [
        { source: "raw", sourceHandle: "output", target: "trim", targetHandle: "text" },
        { source: "trim", sourceHandle: "output", target: "collapse", targetHandle: "text" },
        { source: "collapse", sourceHandle: "output", target: "title", targetHandle: "text" },
        { source: "title", sourceHandle: "output", target: "out", targetHandle: "value" },
      ],
    );
    expect(outputValue(display, "name")).toBe("Jane Doe");

    const slug = await runWorkflow(
      [
        stringNode("title", "  10 Tips & Tricks for Python!! "),
        { id: "trim", type: TrimWhitespaceNode.nodeType },
        { id: "punct", type: RemovePunctuationNode.nodeType },
        { id: "slug", type: SlugifyNode.nodeType },
        { id: "out", type: OutputNode.nodeType, name: "slug" },
      ],
      [
        { source: "title", sourceHandle: "output", target: "trim", targetHandle: "text" },
        { source: "trim", sourceHandle: "output", target: "punct", targetHandle: "text" },
        { source: "punct", sourceHandle: "output", target: "slug", targetHandle: "text" },
        { source: "slug", sourceHandle: "output", target: "out", targetHandle: "value" },
      ],
    );
    const value = outputValue(slug, "slug") as string;
    expect(value).toContain("tips");
    expect(value).toContain("python");
    expect(value).not.toContain(" ");
    expect(value).toBe(value.toLowerCase());
  });
});

describe("text parity: workflow semantics", () => {
  it("redacts phones, builds SQL, extracts domains, and analyzes headlines", async () => {
    const redacted = await runWorkflow(
      [
        stringNode("raw", "Call me at 555-867-5309 or 555.123.4567 thanks."),
        {
          id: "replace",
          type: RegexReplaceNode.nodeType,
          properties: {
            pattern: "\\d{3}[-.\\s]\\d{3}[-.\\s]\\d{4}",
            replacement: "[REDACTED]",
          },
        },
        { id: "out", type: OutputNode.nodeType, name: "safe" },
      ],
      [
        { source: "raw", sourceHandle: "output", target: "replace", targetHandle: "text" },
        { source: "replace", sourceHandle: "output", target: "out", targetHandle: "value" },
      ],
    );
    const safe = outputValue(redacted, "safe") as string;
    expect(safe).toContain("[REDACTED]");
    expect(safe).not.toContain("555-867-5309");

    const sql = await runWorkflow(
      [
        stringNode("table", "orders"),
        stringNode("column", "status"),
        stringNode("value", "shipped"),
        {
          id: "fmt",
          type: FormatTextNode.nodeType,
          properties: { template: "SELECT * FROM {{ table }} WHERE {{ column }} = '{{ value }}'" },
        },
        { id: "upper", type: ToUppercaseNode.nodeType },
        { id: "out", type: OutputNode.nodeType, name: "sql" },
      ],
      [
        { source: "table", sourceHandle: "output", target: "fmt", targetHandle: "table" },
        { source: "column", sourceHandle: "output", target: "fmt", targetHandle: "column" },
        { source: "value", sourceHandle: "output", target: "fmt", targetHandle: "value" },
        { source: "fmt", sourceHandle: "output", target: "upper", targetHandle: "text" },
        { source: "upper", sourceHandle: "output", target: "out", targetHandle: "value" },
      ],
    );
    expect(outputValue(sql, "sql")).toBe("SELECT * FROM ORDERS WHERE STATUS = 'SHIPPED'");

    const domain = await runWorkflow(
      [
        stringNode("email", "alice@example.org"),
        {
          id: "domain",
          type: RegexReplaceNode.nodeType,
          properties: { pattern: "^[^@]+@", replacement: "" },
        },
        { id: "out", type: OutputNode.nodeType, name: "domain" },
      ],
      [
        { source: "email", sourceHandle: "output", target: "domain", targetHandle: "text" },
        { source: "domain", sourceHandle: "output", target: "out", targetHandle: "value" },
      ],
    );
    expect(outputValue(domain, "domain")).toBe("example.org");

    const headline = await runWorkflow(
      [
        stringNode("headline", "Breaking: Python 4.0 Released Today!"),
        { id: "len", type: LengthTextNode.nodeType },
        { id: "starts", type: StartsWithTextNode.nodeType, properties: { prefix: "Breaking" } },
        { id: "ends", type: EndsWithTextNode.nodeType, properties: { suffix: "!" } },
        { id: "upper", type: ToUppercaseNode.nodeType },
        { id: "out-len", type: OutputNode.nodeType, name: "chars" },
        { id: "out-starts", type: OutputNode.nodeType, name: "starts" },
        { id: "out-ends", type: OutputNode.nodeType, name: "ends" },
        { id: "out-upper", type: OutputNode.nodeType, name: "upper" },
      ],
      [
        { source: "headline", sourceHandle: "output", target: "len", targetHandle: "text" },
        { source: "headline", sourceHandle: "output", target: "starts", targetHandle: "text" },
        { source: "headline", sourceHandle: "output", target: "ends", targetHandle: "text" },
        { source: "headline", sourceHandle: "output", target: "upper", targetHandle: "text" },
        { source: "len", sourceHandle: "output", target: "out-len", targetHandle: "value" },
        { source: "starts", sourceHandle: "output", target: "out-starts", targetHandle: "value" },
        { source: "ends", sourceHandle: "output", target: "out-ends", targetHandle: "value" },
        { source: "upper", sourceHandle: "output", target: "out-upper", targetHandle: "value" },
      ],
    );
    expect(outputValue(headline, "chars")).toBe("Breaking: Python 4.0 Released Today!".length);
    expect(outputValue(headline, "starts")).toBe(true);
    expect(outputValue(headline, "ends")).toBe(true);
    expect(outputValue(headline, "upper")).toBe("BREAKING: PYTHON 4.0 RELEASED TODAY!");
  });

  it("handles html cleanup, sentence capitalization, validation, parsing, wrapping, formatting, splitting, equality, and blank detection", async () => {
    const html = await runWorkflow(
      [
        stringNode("html", "<h1>Welcome</h1><p>Hello &amp; <b>goodbye</b></p>"),
        { id: "plain", type: HtmlToTextNode.nodeType },
        { id: "trim", type: TrimWhitespaceNode.nodeType },
        { id: "out", type: OutputNode.nodeType, name: "text" },
      ],
      [
        { source: "html", sourceHandle: "output", target: "plain", targetHandle: "html" },
        { source: "plain", sourceHandle: "output", target: "trim", targetHandle: "text" },
        { source: "trim", sourceHandle: "output", target: "out", targetHandle: "value" },
      ],
    );
    const plain = outputValue(html, "text") as string;
    expect(plain).toContain("Welcome");
    expect(plain).not.toContain("<h1>");

    const sentence = await runWorkflow(
      [
        stringNode("raw", "  THE QUICK BROWN FOX  "),
        { id: "trim", type: TrimWhitespaceNode.nodeType },
        { id: "lower", type: ToLowercaseNode.nodeType },
        { id: "cap", type: CapitalizeTextNode.nodeType },
        { id: "out", type: OutputNode.nodeType, name: "text" },
      ],
      [
        { source: "raw", sourceHandle: "output", target: "trim", targetHandle: "text" },
        { source: "trim", sourceHandle: "output", target: "lower", targetHandle: "text" },
        { source: "lower", sourceHandle: "output", target: "cap", targetHandle: "text" },
        { source: "cap", sourceHandle: "output", target: "out", targetHandle: "value" },
      ],
    );
    expect(outputValue(sentence, "text")).toBe("The quick brown fox");

    const validIp = await runWorkflow(
      [
        {
          id: "ok",
          type: RegexValidateNode.nodeType,
          properties: { text: "192.168.1.100", pattern: "^\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}$" },
        },
        {
          id: "bad",
          type: RegexValidateNode.nodeType,
          properties: { text: "not.an", pattern: "^\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}$" },
        },
        { id: "out-ok", type: OutputNode.nodeType, name: "ok" },
        { id: "out-bad", type: OutputNode.nodeType, name: "bad" },
      ],
      [
        { source: "ok", sourceHandle: "output", target: "out-ok", targetHandle: "value" },
        { source: "bad", sourceHandle: "output", target: "out-bad", targetHandle: "value" },
      ],
    );
    expect(outputValue(validIp, "ok")).toBe(true);
    expect(outputValue(validIp, "bad")).toBe(false);

    const parsed = await runWorkflow(
      [
        stringNode("json", '{"temp_c": 21.5, "city": "Berlin"}'),
        { id: "parse", type: TextParseJSONNode.nodeType },
        { id: "out", type: OutputNode.nodeType, name: "data" },
      ],
      [
        { source: "json", sourceHandle: "output", target: "parse", targetHandle: "text" },
        { source: "parse", sourceHandle: "output", target: "out", targetHandle: "value" },
      ],
    );
    expect(outputValue(parsed, "data")).toEqual({ temp_c: 21.5, city: "Berlin" });

    const wrapped = await runWorkflow(
      [
        stringNode("body", "Hello World"),
        { id: "wrap", type: SurroundWithTextNode.nodeType, properties: { prefix: "<msg>", suffix: "</msg>" } },
        { id: "out", type: OutputNode.nodeType, name: "xml" },
      ],
      [
        { source: "body", sourceHandle: "output", target: "wrap", targetHandle: "text" },
        { source: "wrap", sourceHandle: "output", target: "out", targetHandle: "value" },
      ],
    );
    expect(outputValue(wrapped, "xml")).toBe("<msg>Hello World</msg>");

    const numericLabel = await runWorkflow(
      [
        intNode("n", 42),
        { id: "text", type: ToStringNode.nodeType },
        { id: "fmt", type: FormatTextNode.nodeType, properties: { template: "Quantity: {{ n }} units" } },
        { id: "out-text", type: OutputNode.nodeType, name: "text" },
        { id: "out-label", type: OutputNode.nodeType, name: "label" },
      ],
      [
        { source: "n", sourceHandle: "output", target: "text", targetHandle: "value" },
        { source: "n", sourceHandle: "output", target: "fmt", targetHandle: "n" },
        { source: "text", sourceHandle: "output", target: "out-text", targetHandle: "value" },
        { source: "fmt", sourceHandle: "output", target: "out-label", targetHandle: "value" },
      ],
    );
    expect(outputValue(numericLabel, "text")).toBe("42");
    expect(outputValue(numericLabel, "label")).toBe("Quantity: 42 units");

    const tokens = await runWorkflow(
      [
        stringNode("row", "one  two\tthree   four"),
        { id: "split", type: RegexSplitNode.nodeType, properties: { pattern: "\\s+" } },
        { id: "out", type: OutputNode.nodeType, name: "tokens" },
      ],
      [
        { source: "row", sourceHandle: "output", target: "split", targetHandle: "text" },
        { source: "split", sourceHandle: "output", target: "out", targetHandle: "value" },
      ],
    );
    expect(outputValue(tokens, "tokens")).toEqual(["one", "two", "three", "four"]);

    const equality = await runWorkflow(
      [
        stringNode("left", "Hello World"),
        stringNode("right", "hello world"),
        { id: "left-low", type: ToLowercaseNode.nodeType },
        { id: "right-low", type: ToLowercaseNode.nodeType },
        { id: "eq", type: EqualsTextNode.nodeType },
        { id: "out", type: OutputNode.nodeType, name: "match" },
      ],
      [
        { source: "left", sourceHandle: "output", target: "left-low", targetHandle: "text" },
        { source: "right", sourceHandle: "output", target: "right-low", targetHandle: "text" },
        { source: "left-low", sourceHandle: "output", target: "eq", targetHandle: "text_a" },
        { source: "right-low", sourceHandle: "output", target: "eq", targetHandle: "text_b" },
        { source: "eq", sourceHandle: "output", target: "out", targetHandle: "value" },
      ],
    );
    expect(outputValue(equality, "match")).toBe(true);

    const blank = await runWorkflow(
      [
        stringNode("raw", "    "),
        { id: "trim", type: TrimWhitespaceNode.nodeType },
        { id: "blank", type: IsEmptyTextNode.nodeType },
        { id: "out", type: OutputNode.nodeType, name: "blank" },
      ],
      [
        { source: "raw", sourceHandle: "output", target: "trim", targetHandle: "text" },
        { source: "trim", sourceHandle: "output", target: "blank", targetHandle: "text" },
        { source: "blank", sourceHandle: "output", target: "out", targetHandle: "value" },
      ],
    );
    expect(outputValue(blank, "blank")).toBe(true);
  });
});
