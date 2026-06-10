// @ts-nocheck
/**
 * Mutation-hardening tests for base-node.ts: hasStreamingOutput resolution,
 * assign() edge cases, secret injection branches, validate() id fallback, and
 * the conditional shape of toDescriptor().
 */
import { describe, it, expect, vi } from "vitest";
import { BaseNode, hasStreamingOutput } from "../src/base-node.js";
import { prop } from "../src/decorators.js";

class Plain extends BaseNode {
  static readonly nodeType = "test.Plain";
  async process() {
    return { out: 1 };
  }
}

describe("hasStreamingOutput resolution order", () => {
  it("returns true when the static isStreamingOutput flag is set", () => {
    class Flagged extends BaseNode {
      static readonly nodeType = "test.Flagged";
      static readonly isStreamingOutput = true;
      async process() {
        return {};
      }
    }
    expect(hasStreamingOutput(Flagged)).toBe(true);
  });

  it("returns true when a subclass overrides genProcess", () => {
    class Gen extends BaseNode {
      static readonly nodeType = "test.Gen";
      async process() {
        return {};
      }
      async *genProcess() {
        yield { a: 1 };
        yield { a: 2 };
      }
    }
    expect(hasStreamingOutput(Gen)).toBe(true);
  });

  it("returns false for a plain process-only node", () => {
    expect(hasStreamingOutput(Plain)).toBe(false);
  });

  it.each(["forward", "iteration", "chunk"])(
    "returns true when an output declares %s correlation",
    (kind) => {
      class Corr extends BaseNode {
        static readonly nodeType = `test.Corr.${kind}`;
        static readonly outputCorrelation = {
          out: { kind, source: "in" }
        };
        async process() {
          return {};
        }
      }
      expect(hasStreamingOutput(Corr)).toBe(true);
    }
  );

  it.each(["single", "aggregate"])(
    "returns false when outputs only declare %s correlation",
    (kind) => {
      class Corr extends BaseNode {
        static readonly nodeType = `test.CorrNo.${kind}`;
        static readonly outputCorrelation = {
          out: { kind, source: "__execution__" }
        };
        async process() {
          return {};
        }
      }
      expect(hasStreamingOutput(Corr)).toBe(false);
    }
  );

  it("lets an explicit false opt out of genProcess/correlation inference", () => {
    class OptOut extends BaseNode {
      static readonly nodeType = "test.OptOut";
      static readonly isStreamingOutput = false;
      static readonly outputCorrelation = {
        out: { kind: "forward", source: "in" }
      };
      async process() {
        return {};
      }
      async *genProcess() {
        yield { a: 1 };
      }
    }
    expect(hasStreamingOutput(OptOut)).toBe(false);
  });

  it("inherits an explicit flag declared on an ancestor below BaseNode", () => {
    class StreamBase extends BaseNode {
      static readonly nodeType = "test.StreamBase";
      static readonly isStreamingOutput = true;
      async process() {
        return {};
      }
    }
    class StreamChild extends StreamBase {
      static readonly nodeType = "test.StreamChild";
    }
    expect(hasStreamingOutput(StreamChild)).toBe(true);
  });
});

describe("assign() identity + defaults", () => {
  it("copies __node_id and __node_name verbatim from properties", () => {
    const node = new Plain({ __node_id: "abc", __node_name: "My Node" });
    expect(node.__node_id).toBe("abc");
    expect(node.__node_name).toBe("My Node");
  });

  it("coerces missing __node_id/__node_name to empty string", () => {
    const node = new Plain({ __node_id: null, __node_name: undefined });
    expect(node.__node_id).toBe("");
    expect(node.__node_name).toBe("");
  });

  it("deep-copies object defaults so instances do not share references", () => {
    class WithObjDefault extends BaseNode {
      static readonly nodeType = "test.ObjDefault";
      @prop({ type: "dict", default: { nested: { count: 0 } } })
      declare config: Record<string, unknown>;
      async process() {
        return {};
      }
    }
    const a = new WithObjDefault();
    const b = new WithObjDefault();
    (a.config.nested as { count: number }).count = 5;
    expect((b.config.nested as { count: number }).count).toBe(0);
  });

  it("routes reserved underscore keys to internals, never to dynamicProps", () => {
    class Dyn extends BaseNode {
      static readonly nodeType = "test.DynAssign";
      static readonly supportsDynamicInputs = true;
      async process() {
        return {};
      }
    }
    const node = new Dyn();
    node.assign({ user: "v", _hidden: "secret", __node_id: "id1" });
    expect(node.serialize()).toEqual({ user: "v" });
    expect(node.getDynamic("_hidden")).toBe("secret");
    expect(node.__node_id).toBe("id1");
  });
});

describe("instance identity defaults", () => {
  it("initialises __node_id and __node_name to empty strings", () => {
    const node = new Plain();
    expect(node.__node_id).toBe("");
    expect(node.__node_name).toBe("");
  });

  it("does not wrap a scalar assigned to a non-list field", () => {
    class StrNode extends BaseNode {
      static readonly nodeType = "test.Str";
      @prop({ type: "str", default: "" })
      declare text: string;
      async process() {
        return {};
      }
    }
    const node = new StrNode();
    node.assign({ text: "hello" });
    expect(node.text).toBe("hello");
  });

  it("does not wrap undefined assigned to a list field", () => {
    class ListNode extends BaseNode {
      static readonly nodeType = "test.ListUndef";
      @prop({ type: "list[image]", default: [] })
      declare images: unknown[];
      async process() {
        return {};
      }
    }
    const node = new ListNode();
    node.assign({ images: undefined });
    // Explicit undefined is treated as absent: the default sticks, and the
    // value is never wrapped into [undefined].
    expect(node.images).toEqual([]);
  });

  it("keeps an existing id when assign() omits it", () => {
    const node = new Plain();
    node.__node_id = "keep-me";
    node.__node_name = "Keep Me";
    node.assign({});
    expect(node.__node_id).toBe("keep-me");
    expect(node.__node_name).toBe("Keep Me");
  });

  it("ignores undeclared properties on a non-dynamic node", () => {
    const node = new Plain();
    node.assign({ bogus: "x" });
    expect(node.serialize()).not.toHaveProperty("bogus");
    expect(node.getDynamic("bogus")).toBeUndefined();
  });
});

describe("validate() node id fallback", () => {
  class Req extends BaseNode {
    static readonly nodeType = "test.ReqValidate";
    @prop({ type: "str", default: "", required: true })
    declare text: string;
    async process() {
      return {};
    }
  }

  it("falls back to the instance __node_id when no option is given", () => {
    const node = new Req();
    node.__node_id = "node-77";
    const issues = node.validate();
    expect(issues).toHaveLength(1);
    expect(issues[0].nodeId).toBe("node-77");
  });

  it("prefers an explicit options.nodeId over the instance id", () => {
    const node = new Req();
    node.__node_id = "node-77";
    const issues = node.validate({ nodeId: "explicit" });
    expect(issues[0].nodeId).toBe("explicit");
  });
});

describe("secret injection via toExecutor().process", () => {
  class NeedsSecret extends BaseNode {
    static readonly nodeType = "test.NeedsSecret";
    static readonly requiredSettings = ["OPENAI_API_KEY"];
    async process() {
      return { secrets: this._secrets };
    }
  }

  it("injects resolved secrets into _secrets", async () => {
    const ctx = { getSecret: async (k: string) => (k === "OPENAI_API_KEY" ? "sk-1" : undefined) } as any;
    const out = await new NeedsSecret().toExecutor().process({}, ctx);
    expect(out.secrets).toEqual({ OPENAI_API_KEY: "sk-1" });
  });

  it("does not inject when the secret is absent (warns)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const ctx = { getSecret: async () => undefined } as any;
    const out = await new NeedsSecret().toExecutor().process({}, ctx);
    expect(out.secrets).toEqual({});
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("returns inputs unchanged and warns when no context is supplied", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const out = await new NeedsSecret().toExecutor().process({});
    expect(out.secrets).toEqual({});
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("skips secret resolution entirely for nodes without requiredSettings", async () => {
    const getSecret = vi.fn();
    const out = await new Plain().toExecutor().process({}, { getSecret } as any);
    expect(out).toEqual({ out: 1 });
    expect(getSecret).not.toHaveBeenCalled();
  });

  it("merges resolved secrets with secrets already on the inputs", async () => {
    const ctx = { getSecret: async (k: string) => (k === "OPENAI_API_KEY" ? "sk-2" : undefined) } as any;
    const out = await new NeedsSecret()
      .toExecutor()
      .process({ _secrets: { PRE: "x" } }, ctx);
    expect(out.secrets).toEqual({ PRE: "x", OPENAI_API_KEY: "sk-2" });
  });
});

describe("streaming run() executor path", () => {
  it("resolves requiredSettings into _secrets before run()", async () => {
    const seen: Record<string, string>[] = [];
    class StreamingSecret extends BaseNode {
      static readonly nodeType = "test.StreamingSecret";
      static readonly isStreamingInput = true;
      static readonly requiredSettings = ["ELEVENLABS_API_KEY"];
      async process() {
        return {};
      }
      async run() {
        seen.push(this._secrets);
      }
    }
    const ctx = {
      getSecret: async (k: string) =>
        k === "ELEVENLABS_API_KEY" ? "el-1" : undefined
    } as any;
    await new StreamingSecret().toExecutor().run!({} as any, {} as any, ctx);
    expect(seen).toEqual([{ ELEVENLABS_API_KEY: "el-1" }]);
  });

  it("leaves _secrets empty and warns when run() has no context", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const seen: Record<string, string>[] = [];
    class StreamingNoCtx extends BaseNode {
      static readonly nodeType = "test.StreamingNoCtx";
      static readonly isStreamingInput = true;
      static readonly requiredSettings = ["OPENAI_API_KEY"];
      async process() {
        return {};
      }
      async run() {
        seen.push(this._secrets);
      }
    }
    await new StreamingNoCtx()
      .toExecutor()
      .run!({} as any, {} as any, undefined);
    expect(seen).toEqual([{}]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("does not leak secrets from a previous context into a later run()", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const seen: Record<string, string>[] = [];
    class StreamingReuse extends BaseNode {
      static readonly nodeType = "test.StreamingReuse";
      static readonly isStreamingInput = true;
      static readonly requiredSettings = ["OPENAI_API_KEY"];
      async process() {
        return {};
      }
      async run() {
        seen.push(this._secrets);
      }
    }
    const exec = new StreamingReuse().toExecutor();
    const ctx = { getSecret: async () => "sk-1" } as any;
    await exec.run!({} as any, {} as any, ctx);
    await exec.run!({} as any, {} as any, undefined);
    expect(seen).toEqual([{ OPENAI_API_KEY: "sk-1" }, {}]);
    warn.mockRestore();
  });

  it("exposes run on the executor only when the node defines run()", async () => {
    const calls: unknown[][] = [];
    class Streamer extends BaseNode {
      static readonly nodeType = "test.Streamer";
      static readonly isStreamingInput = true;
      async process() {
        return {};
      }
      async run(inputs: any, outputs: any, context: any) {
        calls.push([inputs, outputs, context]);
      }
    }
    const exec = new Streamer().toExecutor();
    expect(typeof exec.run).toBe("function");
    await exec.run!({ a: 1 } as any, { emit: () => {} } as any, undefined);
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toEqual({ a: 1 });

    expect(new Plain().toExecutor().run).toBeUndefined();
  });
});

describe("toDescriptor conditional fields", () => {
  it("marks is_join_node true only for join nodes", () => {
    class Join extends BaseNode {
      static readonly nodeType = "test.Join";
      static readonly isJoinNode = true;
      async process() {
        return {};
      }
    }
    expect(Join.toDescriptor().is_join_node).toBe(true);
    expect(Plain.toDescriptor().is_join_node).toBeUndefined();
  });

  it("omits propertyTypes when the node declares no properties", () => {
    expect(Plain.toDescriptor().propertyTypes).toBeUndefined();
  });

  it("includes propertyTypes when properties are declared", () => {
    class Typed extends BaseNode {
      static readonly nodeType = "test.Typed";
      @prop({ type: "int", default: 0 })
      declare n: number;
      async process() {
        return {};
      }
    }
    expect(Typed.toDescriptor().propertyTypes).toEqual({ n: "int" });
  });

  it("includes outputs only when outputTypes are declared", () => {
    class Out extends BaseNode {
      static readonly nodeType = "test.Out";
      static readonly outputTypes = { result: "str" };
      async process() {
        return {};
      }
    }
    expect(Out.toDescriptor().outputs).toEqual({ result: "str" });
    expect(Plain.toDescriptor().outputs).toBeUndefined();
  });

  it("uses the provided id and falls back to nodeType otherwise", () => {
    expect(Plain.toDescriptor("custom").id).toBe("custom");
    expect(Plain.toDescriptor().id).toBe("test.Plain");
  });
});
