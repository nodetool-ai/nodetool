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

  it("splits a top-level comma that follows a closed nested bracket", () => {
    // Pins the bracket-depth counter: the comma after list[a] is top-level.
    expect(nodeWithProp("dict[list[a], b]")).toEqual({
      type: "dict",
      type_args: [
        { type: "list", type_args: [{ type: "a", type_args: [] }] },
        { type: "b", type_args: [] }
      ]
    });
  });

  it("ignores empty and whitespace-only segments", () => {
    expect(nodeWithProp("dict[str, ]").type_args).toEqual([
      { type: "str", type_args: [] }
    ]);
    expect(nodeWithProp("dict[str,,int]").type_args).toEqual([
      { type: "str", type_args: [] },
      { type: "int", type_args: [] }
    ]);
    // a whitespace-only middle segment must be dropped, not parsed as "any".
    expect(nodeWithProp("dict[a, , b]").type_args).toEqual([
      { type: "a", type_args: [] },
      { type: "b", type_args: [] }
    ]);
  });

  it("trims surrounding whitespace before testing for a generic bracket", () => {
    // Pins the leading typeName.trim(): a padded generic must still parse.
    expect(nodeWithProp("  list[str]  ")).toEqual({
      type: "list",
      type_args: [{ type: "str", type_args: [] }]
    });
  });

  it("does not treat a trailing-bracket-only string as a generic", () => {
    // Pins `firstBracket < 0`: "foo]" has no "[", so it is a scalar, not generic.
    expect(nodeWithProp("foo]")).toEqual({ type: "foo]", type_args: [] });
  });

  it("maps scalar names inside type arguments", () => {
    expect(nodeWithProp("list[integer]").type_args[0].type).toBe("int");
  });
});

describe("scalar mapping trims and lowercases", () => {
  it("trims surrounding whitespace and lowercases before mapping", () => {
    expect(nodeWithProp("  Integer  ").type).toBe("int");
    expect(nodeWithProp("  Custom Type ").type).toBe("custom type");
  });

  it("handles a leading-bracket type as a generic with an empty base", () => {
    expect(nodeWithProp("[str]")).toEqual({
      type: "any",
      type_args: [{ type: "str", type_args: [] }]
    });
  });
});

describe("getOutputs precedence", () => {
  it("falls back to declared outputTypes when metadataOutputTypes is empty", () => {
    class OutNode extends BaseNode {
      static readonly nodeType = "test.OutNode";
      static readonly metadataOutputTypes = {};
      static readonly outputTypes = { result: "image" };
      async process() {
        return {};
      }
    }
    expect(getNodeMetadata(OutNode).outputs).toEqual([
      { name: "result", type: { type: "image", type_args: [] } }
    ]);
  });

  it("prefers metadataOutputTypes over outputTypes when present", () => {
    class OutNode2 extends BaseNode {
      static readonly nodeType = "test.OutNode2";
      static readonly metadataOutputTypes = { meta_out: "str" };
      static readonly outputTypes = { result: "image" };
      async process() {
        return {};
      }
    }
    expect(getNodeMetadata(OutNode2).outputs).toEqual([
      { name: "meta_out", type: { type: "str", type_args: [] } }
    ]);
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

  it("does not attach a values key to the type of a non-enum property", () => {
    const plain = getNodeMetadata(EnumNode).properties.find((p) => p.name === "plain");
    expect("values" in (plain as any).type).toBe(false);
  });
});

describe("generic type parser edge cases", () => {
  it("returns any for an empty type string", () => {
    expect(nodeWithProp("")).toEqual({ type: "any", type_args: [] });
  });

  it("does not treat a string with a stray '[' but no ']' as generic", () => {
    expect(nodeWithProp("weird[")).toEqual({ type: "weird[", type_args: [] });
  });

  it("parses three comma-separated args at the top level", () => {
    expect(nodeWithProp("tuple[str, int, bool]")).toEqual({
      type: "tuple",
      type_args: [
        { type: "str", type_args: [] },
        { type: "int", type_args: [] },
        { type: "bool", type_args: [] }
      ]
    });
  });

  it("keeps commas nested inside inner brackets out of the top-level split", () => {
    expect(nodeWithProp("dict[str, dict[int, bool]]")).toEqual({
      type: "dict",
      type_args: [
        { type: "str", type_args: [] },
        {
          type: "dict",
          type_args: [
            { type: "int", type_args: [] },
            { type: "bool", type_args: [] }
          ]
        }
      ]
    });
  });
});

describe("getNodeMetadata complete shape", () => {
  it("emits every field with the configured (non-default) values", () => {
    class Rich extends BaseNode {
      static readonly nodeType = "pkg.sub.Rich";
      static readonly title = "Rich";
      static readonly description = "A rich node";
      static readonly layout = "wide";
      static readonly body = "content_card";
      static readonly recommendedModels = [{ id: "m1" }];
      static readonly inlineFields = ["a"];
      static readonly inputFields = ["b"];
      static readonly requiredSettings = ["OPENAI_API_KEY"];
      static readonly requiredRuntimes = ["python"];
      static readonly isStreamingInput = true;
      static readonly inputMode = "stream";
      static readonly outputCorrelation = {
        out: { kind: "forward", source: "in" }
      };
      static readonly isControlled = true;
      static readonly isJoinNode = true;
      static readonly supportsDynamicInputs = true;
      static readonly supportsDynamicOutputs = true;
      static readonly autoSaveAsset = true;
      static readonly modelPacks = [{ pack: "p" }];
      static readonly platforms = ["node", "edge"];
      static readonly metadataOutputTypes = { out: "image" };

      @prop({ type: "str", required: true, default: "hi" })
      declare in: string;

      async process() {
        return {};
      }
    }

    expect(getNodeMetadata(Rich)).toEqual({
      title: "Rich",
      description: "A rich node",
      namespace: "pkg.sub",
      node_type: "pkg.sub.Rich",
      layout: "wide",
      body: "content_card",
      properties: [
        {
          name: "in",
          type: { type: "str", type_args: [] },
          required: true,
          title: undefined,
          description: undefined,
          min: undefined,
          max: undefined,
          values: undefined,
          json_schema_extra: undefined,
          default: "hi"
        }
      ],
      outputs: [{ name: "out", type: { type: "image", type_args: [] } }],
      recommended_models: [{ id: "m1" }],
      inline_fields: ["a"],
      input_fields: ["b"],
      required_settings: ["OPENAI_API_KEY"],
      required_runtimes: ["python"],
      is_streaming_input: true,
      is_streaming_output: true,
      input_mode: "stream",
      output_correlation: { out: { kind: "forward", source: "in" } },
      is_controlled: true,
      is_join_node: true,
      supports_dynamic_inputs: true,
      supports_dynamic_outputs: true,
      auto_save_asset: true,
      model_packs: [{ pack: "p" }],
      platforms: ["node", "edge"]
    });
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
    expect(meta.required_runtimes).toEqual([]);
    expect(meta.is_join_node).toBeUndefined();
    expect(meta.auto_save_asset).toBeUndefined();
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

  it("keeps TS outputs when the TS node declares them", () => {
    class TsOut extends BaseNode {
      static readonly nodeType = "pkg.Merge";
      static readonly outputTypes = { ts_out: "str" };
      async process() {
        return {};
      }
    }
    const meta = getNodeMetadata(TsOut, {
      mergePythonBackfill: true,
      pythonMetadata: python
    });
    expect(meta.outputs).toEqual([
      { name: "ts_out", type: { type: "str", type_args: [] } }
    ]);
  });

  it("backfills output_correlation from python when TS omits it", () => {
    const withCorr: NodeMetadata = {
      ...python,
      output_correlation: { out: { kind: "single", source: "__execution__" } }
    };
    const meta = getNodeMetadata(TsNode, {
      mergePythonBackfill: true,
      pythonMetadata: withCorr
    });
    expect(meta.output_correlation).toEqual({
      out: { kind: "single", source: "__execution__" }
    });
  });

  it("tolerates python metadata that omits the properties array", () => {
    const noProps = { ...python, properties: undefined } as any;
    const meta = getNodeMetadata(TsNode, {
      mergePythonBackfill: true,
      pythonMetadata: noProps
    });
    expect(meta.properties.map((p) => p.name)).toEqual(["prompt"]);
  });

  it("backfills python props by name, not by position", () => {
    class TsB extends BaseNode {
      static readonly nodeType = "pkg.Merge";
      @prop({ type: "str" })
      declare b: string;
      async process() {
        return {};
      }
    }
    const py: NodeMetadata = {
      ...python,
      properties: [
        { name: "a", type: { type: "str", type_args: [] }, description: "DA" },
        { name: "b", type: { type: "str", type_args: [] }, description: "DB" }
      ]
    };
    const meta = getNodeMetadata(TsB, {
      mergePythonBackfill: true,
      pythonMetadata: py
    });
    expect(meta.properties.find((p) => p.name === "b")?.description).toBe("DB");
  });

  it("clones python-only props whose type omits type_args and carries a default", () => {
    const py = {
      ...python,
      properties: [
        { name: "py_only", type: { type: "int" }, default: 7 }
      ]
    } as any;
    const meta = getNodeMetadata(TsNode, {
      mergePythonBackfill: true,
      pythonMetadata: py
    });
    const pyOnly = meta.properties.find((p) => p.name === "py_only");
    expect(pyOnly?.type).toEqual({ type: "int", type_args: [] });
    expect(pyOnly?.default).toBe(7);
  });

  it("clones python output metadata (no type_args) when TS declares no outputs", () => {
    const py = {
      ...python,
      properties: [],
      outputs: [{ name: "out", type: { type: "image" } }]
    } as any;
    const meta = getNodeMetadata(TsNode, {
      mergePythonBackfill: true,
      pythonMetadata: py
    });
    expect(meta.outputs).toEqual([
      { name: "out", type: { type: "image", type_args: [] } }
    ]);
  });

  it("yields no outputs when neither TS nor python declare any", () => {
    const py = { ...python, properties: [], outputs: undefined } as any;
    const meta = getNodeMetadata(TsNode, {
      mergePythonBackfill: true,
      pythonMetadata: py
    });
    expect(meta.outputs).toEqual([]);
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
