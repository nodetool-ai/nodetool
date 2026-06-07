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
