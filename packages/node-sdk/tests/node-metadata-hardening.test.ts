// @ts-nocheck
/**
 * Mutation-hardening tests for node-metadata.ts: scalar-name mapping, the
 * recursive generic type parser, Python backfill merging, and the default
 * values getNodeMetadata stamps onto the emitted NodeMetadata.
 */
import { describe, it, expect } from "vitest";
import { getNodeMetadata } from "../src/node-metadata.js";
import { BaseNode } from "../src/base-node.js";
import { prop } from "../src/decorators.js";
import type { NodeMetadata } from "../src/metadata.js";

function nodeWithProp(type: string) {
  class N extends BaseNode {
    static readonly nodeType = "test.TypeNode";
    static readonly title = "Type Node";
    @prop({ type })
    declare field: unknown;
    async process() {
      return {};
    }
  }
  return getNodeMetadata(N).properties[0].type;
}

describe("scalar type-name mapping", () => {
  it.each([
    ["string", "str"],
    ["integer", "int"],
    ["boolean", "bool"],
    ["number", "float"]
  ])("maps %s -> %s", (input, expected) => {
    expect(nodeWithProp(input).type).toBe(expected);
  });

  it("lowercases unknown scalar names", () => {
    expect(nodeWithProp("ImageRef").type).toBe("imageref");
  });

  it("keeps known short names unchanged", () => {
    expect(nodeWithProp("str").type).toBe("str");
    expect(nodeWithProp("int").type).toBe("int");
  });
});

describe("generic type parser", () => {
  it("parses a single type argument", () => {
    expect(nodeWithProp("list[str]")).toEqual({
      type: "list",
      type_args: [{ type: "str", type_args: [] }]
    });
  });

  it("splits top-level comma-separated args while keeping nested brackets intact", () => {
    expect(nodeWithProp("dict[str, list[int]]")).toEqual({
      type: "dict",
      type_args: [
        { type: "str", type_args: [] },
        {
          type: "list",
          type_args: [{ type: "int", type_args: [] }]
        }
      ]
    });
  });

  it("treats an empty bracket body as no type args", () => {
    expect(nodeWithProp("list[]")).toEqual({ type: "list", type_args: [] });
  });

  it("maps scalar names inside type arguments", () => {
    expect(nodeWithProp("list[integer]").type_args[0].type).toBe("int");
  });
});

describe("getDecoratedProperties details", () => {
  class EnumNode extends BaseNode {
    static readonly nodeType = "test.EnumNode";
    @prop({ type: "str", values: ["a", "b"], required: true, default: "a" })
    declare choice: string;
    @prop({ type: "int" })
    declare plain: number;
    async process() {
      return {};
    }
  }

  it("attaches enum values to the type metadata and the property", () => {
    const meta = getNodeMetadata(EnumNode);
    const choice = meta.properties.find((p) => p.name === "choice");
    expect(choice?.type.values).toEqual(["a", "b"]);
    expect(choice?.values).toEqual(["a", "b"]);
    expect(choice?.required).toBe(true);
    expect(choice?.default).toBe("a");
  });

  it("defaults required to false and omits an absent default", () => {
    const meta = getNodeMetadata(EnumNode);
    const plain = meta.properties.find((p) => p.name === "plain");
    expect(plain?.required).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(plain, "default")).toBe(false);
  });
});

describe("getNodeMetadata defaults", () => {
  class Bare extends BaseNode {
    static readonly nodeType = "pkg.sub.Bare";
    async process() {
      return {};
    }
  }

  it("derives namespace from the node type and falls back title to node_type", () => {
    const meta = getNodeMetadata(Bare);
    expect(meta.namespace).toBe("pkg.sub");
    expect(meta.title).toBe("pkg.sub.Bare");
    expect(meta.description).toBe("");
    expect(meta.layout).toBe("default");
    expect(meta.body).toBe("default");
  });

  it("stamps boolean and array defaults", () => {
    const meta = getNodeMetadata(Bare);
    expect(meta.is_streaming_input).toBe(false);
    expect(meta.is_controlled).toBe(false);
    expect(meta.supports_dynamic_inputs).toBe(false);
    expect(meta.recommended_models).toEqual([]);
    expect(meta.required_settings).toEqual([]);
    expect(meta.is_join_node).toBeUndefined();
  });
});

describe("mergeMetadata (Python backfill)", () => {
  class TsNode extends BaseNode {
    static readonly nodeType = "pkg.Merge";
    static readonly title = "Merge";
    @prop({ type: "str" })
    declare prompt: string;
    async process() {
      return {};
    }
  }

  const python: NodeMetadata = {
    title: "Py Merge",
    description: "python desc",
    namespace: "pkg",
    node_type: "pkg.Merge",
    layout: "wide",
    body: "content_card",
    model_packs: [{ id: "mp" }],
    input_mode: "stream",
    properties: [
      {
        name: "prompt",
        type: { type: "str", type_args: [] },
        description: "from python",
        title: "Prompt"
      },
      {
        name: "py_only",
        type: { type: "int", type_args: [] }
      }
    ],
    outputs: [{ name: "out", type: { type: "str", type_args: [] } }]
  };

  it("returns TS metadata unchanged when no python metadata is given", () => {
    const meta = getNodeMetadata(TsNode, { mergePythonBackfill: true });
    expect(meta.title).toBe("Merge");
    expect(meta.properties.map((p) => p.name)).toEqual(["prompt"]);
  });

  it("backfills description/title onto TS props and appends python-only props", () => {
    const meta = getNodeMetadata(TsNode, {
      mergePythonBackfill: true,
      pythonMetadata: python
    });
    const prompt = meta.properties.find((p) => p.name === "prompt");
    expect(prompt?.description).toBe("from python");
    expect(prompt?.title).toBe("Prompt");
    expect(meta.properties.map((p) => p.name)).toContain("py_only");
  });

  it("backfills body/model_packs/input_mode and falls back outputs", () => {
    const meta = getNodeMetadata(TsNode, {
      mergePythonBackfill: true,
      pythonMetadata: python
    });
    // TS emits the "default" body sentinel, so the python body wins.
    expect(meta.body).toBe("content_card");
    expect(meta.model_packs).toEqual([{ id: "mp" }]);
    expect(meta.input_mode).toBe("stream");
    // TS node declares no outputs, so python outputs are used.
    expect(meta.outputs).toEqual([
      { name: "out", type: { type: "str", type_args: [] } }
    ]);
  });

  it("does not let a python body clobber an explicit TS body", () => {
    class TsBody extends BaseNode {
      static readonly nodeType = "pkg.Merge";
      static readonly body = "custom_body";
      async process() {
        return {};
      }
    }
    const meta = getNodeMetadata(TsBody, {
      mergePythonBackfill: true,
      pythonMetadata: python
    });
    expect(meta.body).toBe("custom_body");
  });
});
