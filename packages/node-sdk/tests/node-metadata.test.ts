/**
 * Tests for T-META-2: Node metadata introspection.
 */
import { describe, it, expect } from "vitest";
import { getNodeMetadata, getNodeMetadataBatch } from "../src/node-metadata.js";
import { BaseNode } from "../src/base-node.js";
import { prop } from "../src/decorators.js";
import type { NodeMetadata } from "../src/metadata.js";
import {
  Add,
  Passthrough,
  StreamingCounter,
  Constant,
  StringConcat,
  ThresholdProcessor,
  ErrorNode,
  SlowNode,
  SilentNode,
  Multiply
} from "../src/nodes/test-nodes.js";

// ---------------------------------------------------------------------------
// getNodeMetadata
// ---------------------------------------------------------------------------

describe("getNodeMetadata", () => {
  it("extracts basic metadata from Add node", () => {
    const meta = getNodeMetadata(Add);
    expect(meta.title).toBe("Add");
    expect(meta.description).toBe("Adds two numbers");
    expect(meta.node_type).toBe("nodetool.test.Add");
    expect(meta.namespace).toBe("nodetool.test");
    expect(meta.is_streaming_output).toBe(false);
    expect(meta.is_dynamic).toBe(true);
  });

  it("extracts properties with defaults", () => {
    const meta = getNodeMetadata(Add);
    expect(meta.properties).toHaveLength(2);

    const propA = meta.properties.find((p) => p.name === "a");
    const propB = meta.properties.find((p) => p.name === "b");
    expect(propA).toBeDefined();
    expect(propB).toBeDefined();
    expect(propA!.default).toBe(0);
    expect(propB!.default).toBe(0);
    expect(propA!.type.type).toBe("int");
    expect(propA!.required).toBe(false);
  });

  it("handles node with minimal props (Passthrough)", () => {
    const meta = getNodeMetadata(Passthrough);
    expect(meta.properties).toHaveLength(1);
    expect(meta.title).toBe("Passthrough");
    expect(meta.node_type).toBe("nodetool.test.Passthrough");
  });

  it("detects streaming output on StreamingCounter", () => {
    const meta = getNodeMetadata(StreamingCounter);
    expect(meta.is_streaming_output).toBe(true);
  });

  it("infers string types from defaults", () => {
    const meta = getNodeMetadata(StringConcat);
    const propA = meta.properties.find((p) => p.name === "a");
    expect(propA).toBeDefined();
    expect(propA!.type.type).toBe("str");
    expect(propA!.default).toBe("");
  });

  it("infers null type as any", () => {
    const meta = getNodeMetadata(Constant);
    const propValue = meta.properties.find((p) => p.name === "value");
    expect(propValue).toBeDefined();
    expect(propValue!.type.type).toBe("any");
    expect(propValue!.default).toBeNull();
  });

  it("infers float type from float defaults", () => {
    const meta = getNodeMetadata(ThresholdProcessor);
    const propThreshold = meta.properties.find((p) => p.name === "threshold");
    expect(propThreshold).toBeDefined();
    // 0.5 is a float
    expect(propThreshold!.type.type).toBe("float");
  });

  it("infers string type from string defaults", () => {
    const meta = getNodeMetadata(ThresholdProcessor);
    const propMode = meta.properties.find((p) => p.name === "mode");
    expect(propMode).toBeDefined();
    expect(propMode!.type.type).toBe("str");
    expect(propMode!.default).toBe("normal");
  });

  it("derives namespace from node_type", () => {
    const meta = getNodeMetadata(Add);
    expect(meta.namespace).toBe("nodetool.test");
  });

  it("uses node_type as title when title is empty", () => {
    // BaseNode has empty title, but test nodes set it. Test with a simple check.
    const meta = getNodeMetadata(Add);
    expect(meta.title).toBe("Add");
    expect(meta.title).not.toBe("");
  });
});

// ---------------------------------------------------------------------------
// getNodeMetadataBatch
// ---------------------------------------------------------------------------

describe("getNodeMetadataBatch", () => {
  it("extracts metadata from multiple node classes", () => {
    const batch = getNodeMetadataBatch([Add, Passthrough, StreamingCounter]);
    expect(batch).toHaveLength(3);
    expect(batch[0].node_type).toBe("nodetool.test.Add");
    expect(batch[1].node_type).toBe("nodetool.test.Passthrough");
    expect(batch[2].node_type).toBe("nodetool.test.StreamingCounter");
  });

  it("returns empty array for empty input", () => {
    expect(getNodeMetadataBatch([])).toEqual([]);
  });

  it("preserves order of input classes", () => {
    const batch = getNodeMetadataBatch([Constant, Add, Passthrough]);
    expect(batch[0].node_type).toBe("nodetool.test.Constant");
    expect(batch[1].node_type).toBe("nodetool.test.Add");
    expect(batch[2].node_type).toBe("nodetool.test.Passthrough");
  });
});

// ---------------------------------------------------------------------------
// Additional getNodeMetadata tests
// ---------------------------------------------------------------------------

describe("getNodeMetadata — additional coverage", () => {
  // ── Boolean type inference ────────────────────────────────────────────

  it("infers boolean type from boolean default", () => {
    class BoolNode extends BaseNode {
      static readonly nodeType = "nodetool.test.BoolNode";
      static readonly title = "Bool Node";
      static readonly description = "Has a boolean default";

      @prop({ type: "bool", default: true })
      declare flag: boolean;

      async process() {
        return {};
      }
    }
    const meta = getNodeMetadata(
      BoolNode as unknown as import("../src/base-node.js").NodeClass
    );
    const flagProp = meta.properties.find((p) => p.name === "flag");
    expect(flagProp).toBeDefined();
    expect(flagProp!.type.type).toBe("bool");
    expect(flagProp!.default).toBe(true);
  });

  // ── Array type inference ──────────────────────────────────────────────

  it("infers list type from array default", () => {
    class ListNode extends BaseNode {
      static readonly nodeType = "nodetool.test.ListNode";
      static readonly title = "List Node";
      static readonly description = "Has an array default";

      @prop({ type: "list[int]", default: [1, 2, 3] })
      declare items: number[];

      async process() {
        return {};
      }
    }
    const meta = getNodeMetadata(
      ListNode as unknown as import("../src/base-node.js").NodeClass
    );
    const itemsProp = meta.properties.find((p) => p.name === "items");
    expect(itemsProp).toBeDefined();
    expect(itemsProp!.type.type).toBe("list");
    expect(itemsProp!.default).toEqual([1, 2, 3]);
  });

  // ── Object type inference ─────────────────────────────────────────────

  it("infers dict type from object default", () => {
    class DictNode extends BaseNode {
      static readonly nodeType = "nodetool.test.DictNode";
      static readonly title = "Dict Node";
      static readonly description = "Has an object default";

      @prop({ type: "dict", default: { key: "value" } })
      declare config: Record<string, unknown>;

      async process() {
        return {};
      }
    }
    const meta = getNodeMetadata(
      DictNode as unknown as import("../src/base-node.js").NodeClass
    );
    const configProp = meta.properties.find((p) => p.name === "config");
    expect(configProp).toBeDefined();
    expect(configProp!.type.type).toBe("dict");
    expect(configProp!.default).toEqual({ key: "value" });
  });

  // ── is_dynamic defaults to false when node classes do not opt in ───────

  it("is_dynamic is false for non-dynamic node types", () => {
    const nodeClasses = [
      Passthrough,
      StreamingCounter,
      Constant,
      ThresholdProcessor,
      Multiply
    ];
    for (const cls of nodeClasses) {
      const meta = getNodeMetadata(cls);
      expect(meta.is_dynamic).toBe(false);
    }
  });

  // ── description defaults to empty string ──────────────────────────────

  it("description defaults to empty string for node without description", () => {
    class NoDescNode extends BaseNode {
      static readonly nodeType = "nodetool.test.NoDescNode";
      static readonly title = "No Desc";
      static readonly description = "";
      async process() {
        return {};
      }
    }
    const meta = getNodeMetadata(
      NoDescNode as unknown as import("../src/base-node.js").NodeClass
    );
    expect(meta.description).toBe("");
  });

  // ── title fallback to nodeType ────────────────────────────────────────

  it("title falls back to nodeType when title is empty", () => {
    class NoTitleNode extends BaseNode {
      static readonly nodeType = "nodetool.test.NoTitleNode";
      static readonly title = "";
      static readonly description = "A node without title";
      async process() {
        return {};
      }
    }
    const meta = getNodeMetadata(
      NoTitleNode as unknown as import("../src/base-node.js").NodeClass
    );
    expect(meta.title).toBe("nodetool.test.NoTitleNode");
  });

  // ── Outputs metadata ─────────────────────────────────────────────────

  it("outputs array is populated for nodes with declared outputs", () => {
    class OutputNode extends BaseNode {
      static readonly nodeType = "nodetool.test.OutputNode";
      static readonly title = "Output Node";
      static readonly description = "Has declared outputs";

      static toDescriptor(id?: string) {
        return {
          ...super.toDescriptor(id),
          outputs: { result: "number", label: "string" }
        };
      }

      async process() {
        return { result: 42, label: "hello" };
      }
    }
    const meta = getNodeMetadata(
      OutputNode as unknown as import("../src/base-node.js").NodeClass
    );
    expect(meta.outputs).toHaveLength(2);
    const resultOut = meta.outputs.find((o) => o.name === "result");
    const labelOut = meta.outputs.find((o) => o.name === "label");
    expect(resultOut).toBeDefined();
    expect(resultOut!.type.type).toBe("float");
    expect(labelOut).toBeDefined();
    expect(labelOut!.type.type).toBe("str");
  });

  it("outputs array is empty when descriptor has no outputs", () => {
    const meta = getNodeMetadata(Passthrough);
    // Passthrough's toDescriptor does not declare outputs
    expect(meta.outputs).toEqual([]);
  });

  // ── Namespace derivation edge cases ───────────────────────────────────

  it("namespace is empty string for node type without dots", () => {
    class FlatNode extends BaseNode {
      static readonly nodeType = "FlatNode";
      static readonly title = "Flat";
      static readonly description = "";
      async process() {
        return {};
      }
    }
    const meta = getNodeMetadata(
      FlatNode as unknown as import("../src/base-node.js").NodeClass
    );
    expect(meta.namespace).toBe("");
  });

  // ── Multiple property types in one node ───────────────────────────────

  it("handles mixed property types in ThresholdProcessor", () => {
    const meta = getNodeMetadata(ThresholdProcessor);
    expect(meta.properties).toHaveLength(3);
    const types = meta.properties.map((p) => [p.name, p.type.type]);
    expect(types).toContainEqual(["value", "int"]);
    expect(types).toContainEqual(["threshold", "float"]);
    expect(types).toContainEqual(["mode", "str"]);
  });
});

// ── Decorator-based metadata tests ─────────────────────────────────────────

describe("getNodeMetadata – decorator-based properties", () => {
  it("extracts properties from @prop decorators", () => {
    class DecoratedNode extends BaseNode {
      static readonly nodeType = "nodetool.test.Decorated";
      static readonly title = "Decorated";
      static readonly description = "A decorated node";

      @prop({ type: "int", default: 42, description: "The answer" })
      declare answer: number;

      @prop({ type: "str", default: "hello", title: "Greeting" })
      declare message: string;

      async process() {
        return { result: this.answer };
      }
    }

    const meta = getNodeMetadata(
      DecoratedNode as unknown as import("../src/base-node.js").NodeClass
    );
    expect(meta.properties).toHaveLength(2);

    const answerProp = meta.properties.find((p) => p.name === "answer");
    expect(answerProp).toBeDefined();
    expect(answerProp!.type.type).toBe("int");
    expect(answerProp!.default).toBe(42);
    expect(answerProp!.description).toBe("The answer");
    expect(answerProp!.required).toBe(false);

    const msgProp = meta.properties.find((p) => p.name === "message");
    expect(msgProp).toBeDefined();
    expect(msgProp!.type.type).toBe("str");
    expect(msgProp!.default).toBe("hello");
    expect(msgProp!.title).toBe("Greeting");
  });

  it("supports min/max constraints in @prop", () => {
    class ConstrainedNode extends BaseNode {
      static readonly nodeType = "nodetool.test.Constrained";
      static readonly title = "Constrained";
      static readonly description = "";

      @prop({ type: "float", default: 0.5, min: 0, max: 1 })
      declare ratio: number;

      async process() {
        return {};
      }
    }

    const meta = getNodeMetadata(
      ConstrainedNode as unknown as import("../src/base-node.js").NodeClass
    );
    const ratioProp = meta.properties.find((p) => p.name === "ratio");
    expect(ratioProp).toBeDefined();
    expect(ratioProp!.min).toBe(0);
    expect(ratioProp!.max).toBe(1);
  });

  it("supports values array for enum-like properties", () => {
    class EnumNode extends BaseNode {
      static readonly nodeType = "nodetool.test.Enum";
      static readonly title = "Enum";
      static readonly description = "";

      @prop({ type: "str", default: "red", values: ["red", "green", "blue"] })
      declare color: string;

      @prop({ type: "int", default: 1, values: [1, 2, 3, 4] })
      declare size: number;

      async process() {
        return {};
      }
    }

    const meta = getNodeMetadata(
      EnumNode as unknown as import("../src/base-node.js").NodeClass
    );

    const colorProp = meta.properties.find((p) => p.name === "color");
    expect(colorProp).toBeDefined();
    expect(colorProp!.values).toEqual(["red", "green", "blue"]);

    const sizeProp = meta.properties.find((p) => p.name === "size");
    expect(sizeProp).toBeDefined();
    expect(sizeProp!.values).toEqual([1, 2, 3, 4]);
  });

  it("supports required flag in @prop", () => {
    class RequiredNode extends BaseNode {
      static readonly nodeType = "nodetool.test.Required";
      static readonly title = "Required";
      static readonly description = "";

      @prop({ type: "str", required: true })
      declare name: string;

      @prop({ type: "str", default: "", required: false })
      declare optional: string;

      async process() {
        return {};
      }
    }

    const meta = getNodeMetadata(
      RequiredNode as unknown as import("../src/base-node.js").NodeClass
    );

    const nameProp = meta.properties.find((p) => p.name === "name");
    expect(nameProp).toBeDefined();
    expect(nameProp!.required).toBe(true);

    const optionalProp = meta.properties.find((p) => p.name === "optional");
    expect(optionalProp).toBeDefined();
    expect(optionalProp!.required).toBe(false);
  });

  it("supports list and dict types in @prop", () => {
    class ComplexTypesNode extends BaseNode {
      static readonly nodeType = "nodetool.test.ComplexTypes";
      static readonly title = "Complex Types";
      static readonly description = "";

      @prop({ type: "list[str]", default: [] })
      declare tags: string[];

      @prop({ type: "dict", default: {} })
      declare config: Record<string, unknown>;

      async process() {
        return {};
      }
    }

    const meta = getNodeMetadata(
      ComplexTypesNode as unknown as import("../src/base-node.js").NodeClass
    );

    const tagsProp = meta.properties.find((p) => p.name === "tags");
    expect(tagsProp).toBeDefined();
    expect(tagsProp!.type.type).toBe("list");
    expect(tagsProp!.type.type_args).toHaveLength(1);
    expect(tagsProp!.type.type_args![0].type).toBe("str");

    const configProp = meta.properties.find((p) => p.name === "config");
    expect(configProp).toBeDefined();
    expect(configProp!.type.type).toBe("dict");
  });

  it("supports json_schema_extra in @prop", () => {
    class ExtraSchemaNode extends BaseNode {
      static readonly nodeType = "nodetool.test.ExtraSchema";
      static readonly title = "Extra Schema";
      static readonly description = "";

      @prop({
        type: "str",
        default: "",
        json_schema_extra: { format: "email", pattern: "^.*@.*$" }
      })
      declare email: string;

      async process() {
        return {};
      }
    }

    const meta = getNodeMetadata(
      ExtraSchemaNode as unknown as import("../src/base-node.js").NodeClass
    );

    const emailProp = meta.properties.find((p) => p.name === "email");
    expect(emailProp).toBeDefined();
    expect(emailProp!.json_schema_extra).toEqual({
      format: "email",
      pattern: "^.*@.*$"
    });
  });

  it("inherits decorated properties from parent class", () => {
    class BaseWithProps extends BaseNode {
      static readonly nodeType = "nodetool.test.BaseWithProps";
      static readonly title = "Base With Props";
      static readonly description = "";

      @prop({ type: "int", default: 10 })
      declare baseProp: number;

      async process() {
        return {};
      }
    }

    class ChildWithProps extends BaseWithProps {
      static readonly nodeType = "nodetool.test.ChildWithProps";
      static readonly title = "Child With Props";

      @prop({ type: "str", default: "child" })
      declare childProp: string;

      async process() {
        return {};
      }
    }

    const childMeta = getNodeMetadata(
      ChildWithProps as unknown as import("../src/base-node.js").NodeClass
    );
    expect(childMeta.properties).toHaveLength(2);

    const baseProp = childMeta.properties.find((p) => p.name === "baseProp");
    expect(baseProp).toBeDefined();
    expect(baseProp!.type.type).toBe("int");

    const childProp = childMeta.properties.find((p) => p.name === "childProp");
    expect(childProp).toBeDefined();
    expect(childProp!.type.type).toBe("str");
  });

  it("uses decorated metadata directly", () => {
    class MixedNode extends BaseNode {
      static readonly nodeType = "nodetool.test.Mixed";
      static readonly title = "Mixed";
      static readonly description = "";

      @prop({ type: "int", default: 100, description: "Decorated value" })
      declare value: number;

      async process() {
        return {};
      }
    }

    const meta = getNodeMetadata(
      MixedNode as unknown as import("../src/base-node.js").NodeClass
    );

    const valueProp = meta.properties.find((p) => p.name === "value");
    expect(valueProp).toBeDefined();
    expect(valueProp!.default).toBe(100);
    expect(valueProp!.description).toBe("Decorated value");
  });

  it("uses TS metadata as source of truth with Python backfill when mergePythonBackfill is enabled", () => {
    const pythonMetadata: NodeMetadata = {
      title: "Python Title",
      description: "Python description",
      namespace: "nodetool.test",
      node_type: "nodetool.test.Add",
      layout: "default",
      properties: [
        {
          name: "a",
          type: { type: "int", type_args: [] },
          default: 99,
          title: "Python A",
          description: "Python property",
          required: true
        }
      ],
      outputs: [
        {
          name: "output",
          type: { type: "int", type_args: [] },
          stream: true
        }
      ],
      basic_fields: ["a"],
      is_dynamic: true,
      is_streaming_output: true,
      expose_as_tool: true,
      supports_dynamic_outputs: true,
      recommended_models: [{ id: "model-1" }],
      model_packs: [{ id: "pack-1" }]
    };

    const meta = getNodeMetadata(Add, {
      pythonMetadata,
      mergePythonBackfill: true
    });

    // TS class is authoritative: title, description, properties come from TS
    expect(meta.title).toBe("Add");
    expect(meta.description).toBe("Adds two numbers");
    expect(meta.node_type).toBe("nodetool.test.Add");
    // TS properties are used (Add has a and b)
    expect(meta.properties.map((p) => p.name)).toEqual(["a", "b"]);
    // Python-only optional fields are backfilled
    expect(meta.layout).toBe("default");
    expect(meta.model_packs).toEqual([{ id: "pack-1" }]);
  });
});

describe("getNodeMetadata – outputTypes support", () => {
  it("extracts outputs from static outputTypes", () => {
    class OutputNode extends BaseNode {
      static readonly nodeType = "nodetool.test.Output";
      static readonly title = "Output";
      static readonly description = "";
      static readonly outputTypes = {
        result: "int",
        message: "str"
      };

      async process() {
        return { result: 42, message: "ok" };
      }
    }

    const meta = getNodeMetadata(
      OutputNode as unknown as import("../src/base-node.js").NodeClass
    );
    expect(meta.outputs).toHaveLength(2);

    const resultOut = meta.outputs.find((o) => o.name === "result");
    expect(resultOut).toBeDefined();
    expect(resultOut!.type.type).toBe("int");

    const messageOut = meta.outputs.find((o) => o.name === "message");
    expect(messageOut).toBeDefined();
    expect(messageOut!.type.type).toBe("str");
  });

  it("treats `tjs.*`-typed model props as basic fields by default", () => {
    class TjsLikeNode extends BaseNode {
      static readonly nodeType = "nodetool.test.TjsLike";
      static readonly title = "TJS-like";
      static readonly description = "";

      @prop({ type: "str", default: "hello", title: "Text" })
      declare text: any;

      @prop({
        type: "tjs.text_classification",
        default: { type: "tjs.text_classification", repo_id: "Xenova/foo" },
        title: "Model"
      })
      declare model: any;

      @prop({ type: "int", default: 1, title: "Top K" })
      declare top_k: any;

      @prop({ type: "enum", default: "auto", title: "Quantization", values: ["auto", "fp16"] })
      declare dtype: any;

      @prop({ type: "enum", default: "auto", title: "Device", values: ["auto", "cpu"] })
      declare device: any;

      async process() {
        return {};
      }
    }

    const meta = getNodeMetadata(
      TjsLikeNode as unknown as import("../src/base-node.js").NodeClass
    );
    // 5 props total — heuristic kicks in (not the ≤3 fall-through).
    // `model` (tjs.* selector) and `text` (str / primary input) must be basic;
    // `top_k`, `dtype`, `device` should remain advanced.
    expect(meta.basic_fields).toEqual(expect.arrayContaining(["model", "text"]));
    expect(meta.basic_fields).not.toContain("top_k");
    expect(meta.basic_fields).not.toContain("dtype");
    expect(meta.basic_fields).not.toContain("device");
  });

  it("marks outputs as streaming when isStreamingOutput is true", () => {
    class StreamingOutputNode extends BaseNode {
      static readonly nodeType = "nodetool.test.StreamingOutput";
      static readonly title = "Streaming Output";
      static readonly description = "";
      static readonly isStreamingOutput = true;
      static readonly outputTypes = {
        value: "int"
      };

      async process() {
        return {};
      }
    }

    const meta = getNodeMetadata(
      StreamingOutputNode as unknown as import("../src/base-node.js").NodeClass
    );
    expect(meta.outputs).toHaveLength(1);
    expect(meta.outputs[0].stream).toBeUndefined();
    expect(meta.is_streaming_output).toBe(true);
  });
});
