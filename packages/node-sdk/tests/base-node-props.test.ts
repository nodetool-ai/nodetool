import { describe, it, expect } from "vitest";
import { BaseNode } from "../src/base-node.js";
import { prop } from "../src/decorators.js";

// --- Test node classes ---

class PropsNode extends BaseNode {
  static readonly nodeType = "test.Props";
  static readonly title = "Props";
  static readonly description = "Node with typed props";

  @prop({ type: "str", default: "hello" })
  declare prompt: string;

  @prop({ type: "int", default: 512 })
  declare width: number;

  @prop({ type: "float", default: 0.7 })
  declare scale: number;

  async process(): Promise<Record<string, unknown>> {
    return { output: this.prompt };
  }
}

class EmptyNode extends BaseNode {
  static readonly nodeType = "test.Empty";
  async process(): Promise<Record<string, unknown>> {
    return {};
  }
}

// --- Tests ---

describe("BaseNode — serialize / assign round-trip", () => {
  it("serialize returns only @prop-declared fields", () => {
    const node = new PropsNode();
    node.assign({ prompt: "test", width: 1024 });
    const serialized = node.serialize();
    expect(serialized).toEqual({ prompt: "test", width: 1024, scale: 0.7 });
    // Internal fields must NOT appear
    expect(serialized).not.toHaveProperty("__node_id");
    expect(serialized).not.toHaveProperty("__node_name");
    expect(serialized).not.toHaveProperty("dynamicProps");
  });

  it("assign + serialize is a round-trip", () => {
    const node = new PropsNode();
    node.assign({ prompt: "round-trip", width: 256, scale: 1.5 });
    const data = node.serialize();
    const node2 = new PropsNode();
    node2.deserialize(data);
    expect(node2.serialize()).toEqual(data);
  });

  it("assign ignores undeclared properties", () => {
    const node = new PropsNode();
    node.assign({ prompt: "ok", undeclaredProp: 999 } as any);
    expect(node.prompt).toBe("ok");
    expect((node as any).undeclaredProp).toBeUndefined();
  });

  it("assign sets __node_id and __node_name", () => {
    const node = new PropsNode();
    node.assign({ __node_id: "abc", __node_name: "MyNode" });
    expect(node.__node_id).toBe("abc");
    expect(node.__node_name).toBe("MyNode");
  });
});

describe("BaseNode — dynamicProps", () => {
  it("getDynamic returns undefined for unset keys", () => {
    const node = new EmptyNode();
    expect(node.getDynamic("missing")).toBeUndefined();
  });

  it("setDynamic / getDynamic stores and retrieves values", () => {
    const node = new EmptyNode();
    node.setDynamic("key1", 42);
    node.setDynamic("key2", "hello");
    expect(node.getDynamic<number>("key1")).toBe(42);
    expect(node.getDynamic<string>("key2")).toBe("hello");
  });

  it("dynamic props are not included in serialize()", () => {
    const node = new PropsNode();
    node.setDynamic("extra", 123);
    const serialized = node.serialize();
    expect(serialized).not.toHaveProperty("extra");
  });

  it("routes reserved _-prefixed keys away from dynamicProps", () => {
    const node = new EmptyNode();
    node.setDynamic("username", "alice");
    node.setDynamic("_secrets", { OPENAI_API_KEY: "sk-secret" });
    // Reserved internals are readable via getDynamic …
    expect(node.getDynamic("_secrets")).toEqual({ OPENAI_API_KEY: "sk-secret" });
    expect(node.getDynamic("username")).toBe("alice");
    // … but never appear in the user-facing dynamicProps iteration.
    expect(Object.fromEntries((node as any).dynamicProps)).toEqual({
      username: "alice"
    });
  });
});

describe("BaseNode — reserved internals isolation (dynamic nodes)", () => {
  class DynNode extends BaseNode {
    static readonly nodeType = "test.DynReserved";
    static readonly supportsDynamicInputs = true;
    static readonly requiredSettings = ["OPENAI_API_KEY"];

    async process(): Promise<Record<string, unknown>> {
      // Mirrors llm-nodes/agents.ts: build template vars from dynamicProps.
      return {
        vars: Object.fromEntries(this.dynamicProps),
        secrets: this.getDynamic("_secrets"),
        control: this.getDynamic("_control_context")
      };
    }
  }

  const ctx = {
    getSecret: async (k: string) =>
      k === "OPENAI_API_KEY" ? "sk-SUPER-SECRET" : undefined
  } as any;

  it("keeps _secrets / _control_context out of dynamicProps and serialize()", async () => {
    const node = new DynNode();
    const out = await node.toExecutor().process(
      { username: "alice", _control_context: { routes: { n2: {} } } },
      ctx
    );

    // User dynamic input is present; injected internals are not.
    expect(out.vars).toEqual({ username: "alice" });
    // Internals remain reachable through the dedicated accessors.
    expect(out.secrets).toEqual({ OPENAI_API_KEY: "sk-SUPER-SECRET" });
    expect(out.control).toEqual({ routes: { n2: {} } });
    // serialize() must not leak secrets/control into persisted state.
    const serialized = node.serialize();
    expect(serialized).not.toHaveProperty("_secrets");
    expect(serialized).not.toHaveProperty("_control_context");
    expect(serialized).toMatchObject({ username: "alice" });
  });
});

describe("BaseNode — constructor with properties", () => {
  it("constructor applies properties via assign()", () => {
    const node = new PropsNode({ prompt: "from-ctor", width: 768 });
    expect(node.prompt).toBe("from-ctor");
    expect(node.width).toBe(768);
    expect(node.scale).toBe(0.7); // default
  });

  it("treats an explicit undefined like an absent key (default applies)", () => {
    const node = new PropsNode({ prompt: undefined, width: 768 });
    expect(node.prompt).toBe("hello"); // default, not undefined
    expect(node.width).toBe(768);
  });
});

describe("BaseNode — list-type coercion", () => {
  class ListNode extends BaseNode {
    static readonly nodeType = "test.List";
    @prop({ type: "list[image]", default: [] })
    declare images: unknown[];

    async process(): Promise<Record<string, unknown>> {
      return { output: this.images };
    }
  }

  it("wraps a single scalar value into a one-element list", () => {
    const node = new ListNode();
    const ref = { type: "image", uri: "https://example.com/a.png" };
    node.assign({ images: ref });
    expect(node.images).toEqual([ref]);
  });

  it("passes arrays through unchanged", () => {
    const node = new ListNode();
    const refs = [{ type: "image", uri: "a" }, { type: "image", uri: "b" }];
    node.assign({ images: refs });
    expect(node.images).toBe(refs);
  });

  it("preserves null and undefined (no wrap)", () => {
    const node = new ListNode();
    node.assign({ images: null });
    expect(node.images).toBeNull();
  });
});
