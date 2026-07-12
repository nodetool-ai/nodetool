/**
 * Tests for the app-debug spec layer (src/app-debug/app-spec.ts): parsing a
 * Puck app_doc into a flat widget list, extracting the graph's bindable
 * surface, and statically validating the wiring.
 */
import { describe, expect, it } from "vitest";
import { extractAppIO, parseAppSpec, validateApp } from "../src/app-debug/app-spec.js";
import type { DebugGraph } from "../src/debug/types.js";

const widget = (
  type: string,
  id: string,
  props: Record<string, unknown> = {}
) => ({ type, props: { id, ...props } });

const appDoc = (content: unknown[], title?: string) => ({
  version: 2,
  data: { root: { props: title ? { title } : {} }, content, zones: {} }
});

const graph = (nodes: Array<Record<string, unknown>>): DebugGraph => ({
  nodes,
  edges: []
});

describe("parseAppSpec", () => {
  it("rejects a missing app_doc with a clear issue", () => {
    const { spec, issues } = parseAppSpec(null);
    expect(spec).toBeNull();
    expect(issues[0]).toMatch(/no app_doc/);
  });

  it("accepts a JSON-string app_doc", () => {
    const doc = JSON.stringify(appDoc([widget("Text", "Text-1")]));
    const { spec, issues } = parseAppSpec(doc);
    expect(issues).toEqual([]);
    expect(spec?.widgets.map((w) => w.type)).toEqual(["Text"]);
  });

  it("flattens nested slot children with parent/slot attribution", () => {
    const doc = appDoc(
      [
        widget("Columns", "Columns-1", {
          left: [widget("TextInput", "TextInput-1", { binding: "prompt" })],
          right: [widget("Markdown", "Markdown-1", { binding: "result" })]
        }),
        widget("Button", "Button-1", {
          label: "Run",
          events: [{ trigger: "click", kind: "run", key: "", value: "" }]
        })
      ],
      "My App"
    );
    const { spec } = parseAppSpec(doc);
    expect(spec?.title).toBe("My App");
    const byId = Object.fromEntries(spec!.widgets.map((w) => [w.id, w]));
    expect(Object.keys(byId)).toHaveLength(4);
    expect(byId["TextInput-1"]).toMatchObject({
      parentId: "Columns-1",
      slot: "left",
      bindingMode: "write",
      binding: "prompt",
      stateKey: "prompt"
    });
    expect(byId["Markdown-1"]).toMatchObject({
      parentId: "Columns-1",
      slot: "right",
      bindingMode: "read"
    });
    expect(byId["Button-1"].events).toEqual([
      { trigger: "click", kind: "run", key: undefined, value: undefined }
    ]);
  });

  it("falls back to the widget id as state key for an unbound write widget", () => {
    const { spec } = parseAppSpec(appDoc([widget("Slider", "Slider-9")]));
    expect(spec?.widgets[0].stateKey).toBe("Slider-9");
  });

  it("flags an empty app", () => {
    const { spec, issues } = parseAppSpec(appDoc([]));
    expect(spec?.widgets).toEqual([]);
    expect(issues.join(" ")).toMatch(/no widgets/);
  });
});

describe("extractAppIO", () => {
  it("extracts inputs, outputs, and variables from a kernel-shape graph", () => {
    const io = extractAppIO(
      graph([
        {
          id: "in1",
          type: "nodetool.input.StringInput",
          properties: { name: "prompt", value: "hello" }
        },
        { id: "out1", type: "nodetool.output.StringOutput", properties: { name: "result" } },
        { id: "prev", type: "nodetool.workflows.base_node.Preview", properties: {} },
        { id: "var1", type: "nodetool.variable.SetVariable", properties: { name: "dark" } },
        { id: "llm", type: "nodetool.agents.Agent", properties: {} }
      ])
    );
    expect(io.inputs).toEqual([
      {
        nodeId: "in1",
        nodeType: "nodetool.input.StringInput",
        name: "prompt",
        defaultValue: "hello"
      }
    ]);
    expect(io.outputs.map((o) => o.name)).toEqual(["result", "prev"]);
    expect(io.variables).toEqual(["dark"]);
  });
});

describe("validateApp", () => {
  const io = extractAppIO(
    graph([
      { id: "in1", type: "nodetool.input.StringInput", properties: { name: "prompt" } },
      { id: "out1", type: "nodetool.output.StringOutput", properties: { name: "result" } },
      { id: "var1", type: "nodetool.variable.SetVariable", properties: { name: "dark" } }
    ])
  );

  it("passes a correctly wired app", () => {
    const { spec } = parseAppSpec(
      appDoc([
        widget("TextInput", "TextInput-1", { binding: "prompt" }),
        widget("Markdown", "Markdown-1", { binding: "result" }),
        widget("Button", "Button-1", {
          events: [{ trigger: "click", kind: "run" }]
        })
      ])
    );
    const result = validateApp(spec!, io);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("flags bindings that reference missing inputs/outputs/variables", () => {
    const { spec } = parseAppSpec(
      appDoc([
        widget("TextInput", "TextInput-1", { binding: "nope" }),
        widget("Markdown", "Markdown-1", { binding: "missing" }),
        widget("Button", "Button-1", {
          events: [
            { trigger: "click", kind: "run" },
            { trigger: "click", kind: "toggleState", key: "ghost" }
          ]
        })
      ])
    );
    const { errors } = validateApp(spec!, io);
    expect(errors.join("\n")).toMatch(/no input node with that name/);
    expect(errors.join("\n")).toMatch(/no output or variable/);
    expect(errors.join("\n")).toMatch(/no SetVariable node/);
  });

  it("flags an app that can never run and warns on undisplayed outputs", () => {
    const { spec } = parseAppSpec(
      appDoc([widget("TextInput", "TextInput-1", { binding: "prompt" })])
    );
    const { errors, warnings } = validateApp(spec!, io);
    expect(errors.join("\n")).toMatch(/never execute the workflow/);
    expect(warnings.join("\n")).toMatch(/"result" is not displayed/);
  });

  it("flags unknown widget types", () => {
    const { spec } = parseAppSpec(appDoc([widget("Bogus", "Bogus-1")]));
    const { errors } = validateApp(spec!, io);
    expect(errors.join("\n")).toMatch(/unknown widget type/);
  });

  it("warns on an unbound write widget (local-only state)", () => {
    const { spec } = parseAppSpec(
      appDoc([
        widget("Switch", "Switch-1"),
        widget("Button", "Button-1", { events: [{ trigger: "click", kind: "run" }] }),
        widget("Markdown", "Markdown-1", { binding: "result" })
      ])
    );
    const { warnings } = validateApp(spec!, io);
    expect(warnings.join("\n")).toMatch(/local UI state/);
  });
});
