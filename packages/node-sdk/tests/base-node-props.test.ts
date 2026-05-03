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
});

describe("BaseNode — constructor with properties", () => {
  it("constructor applies properties via assign()", () => {
    const node = new PropsNode({ prompt: "from-ctor", width: 768 });
    expect(node.prompt).toBe("from-ctor");
    expect(node.width).toBe(768);
    expect(node.scale).toBe(0.7); // default
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
