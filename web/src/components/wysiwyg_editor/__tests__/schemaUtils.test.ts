import {
  createNode,
  createEmptySchema,
  findNodeById,
  addChildNode,
  removeNode,
  updateNodeProps,
  cloneNode,
  countNodes,
  flattenTree,
} from "../utils/schemaUtils";
import type { UISchemaNode } from "../types";

describe("schemaUtils", () => {
  describe("createNode", () => {
    it("should create a node with default props", () => {
      const node = createNode("Box");
      expect(node.type).toBe("Box");
      expect(node.id).toBeDefined();
      expect(node.props).toHaveProperty("component", "div");
      expect(node.children).toEqual([]);
    });

    it("should create a node with custom props", () => {
      const node = createNode("Typography", { text: "Hello", variant: "h1" });
      expect(node.type).toBe("Typography");
      expect(node.props.text).toBe("Hello");
      expect(node.props.variant).toBe("h1");
    });

    it("should not create children array for leaf components", () => {
      const node = createNode("Typography");
      expect(node.children).toBeUndefined();
    });
  });

  describe("createEmptySchema", () => {
    it("should create a valid schema with a root Box", () => {
      const schema = createEmptySchema();
      expect(schema.version).toBe("1.0");
      expect(schema.root.type).toBe("Box");
      expect(schema.root.id).toBeDefined();
    });
  });

  describe("findNodeById", () => {
    it("should find a node by ID", () => {
      const schema = createEmptySchema();
      const found = findNodeById(schema.root, schema.root.id);
      expect(found).toBe(schema.root);
    });

    it("should find nested nodes", () => {
      const parent = createNode("Box");
      const child = createNode("Typography", { text: "Test" });
      parent.children = [child];

      const found = findNodeById(parent, child.id);
      expect(found).toBe(child);
    });

    it("should return null for non-existent ID", () => {
      const schema = createEmptySchema();
      const found = findNodeById(schema.root, "non-existent");
      expect(found).toBeNull();
    });
  });

  describe("addChildNode", () => {
    it("should add a child to a parent", () => {
      const parent = createNode("Stack");
      const child = createNode("Typography", { text: "Test" });

      const newParent = addChildNode(parent, parent.id, child);
      expect(newParent.children).toHaveLength(1);
      expect(newParent.children![0]).toBe(child);
    });

    it("should add a child at a specific index", () => {
      const parent = createNode("Stack");
      const child1 = createNode("Typography", { text: "First" });
      const child2 = createNode("Typography", { text: "Second" });
      const child3 = createNode("Typography", { text: "Third" });

      let newParent = addChildNode(parent, parent.id, child1);
      newParent = addChildNode(newParent, parent.id, child3);
      newParent = addChildNode(newParent, parent.id, child2, 1);

      expect(newParent.children).toHaveLength(3);
      expect(newParent.children![0].props.text).toBe("First");
      expect(newParent.children![1].props.text).toBe("Second");
      expect(newParent.children![2].props.text).toBe("Third");
    });

    it("should not add children to leaf components", () => {
      const parent = createNode("Typography");
      const child = createNode("Button", { text: "Click" });

      const newParent = addChildNode(parent, parent.id, child);
      // Typography cannot have children, so it should return unchanged
      expect(newParent).toBe(parent);
    });
  });

  describe("removeNode", () => {
    it("should remove a node from the tree", () => {
      const parent = createNode("Stack");
      const child = createNode("Typography", { text: "Test" });
      parent.children = [child];

      const newParent = removeNode(parent, child.id);
      expect(newParent?.children).toHaveLength(0);
    });

    it("should not remove the root node", () => {
      const schema = createEmptySchema();
      const result = removeNode(schema.root, schema.root.id);
      expect(result).toBe(schema.root);
    });

    it("should remove deeply nested nodes", () => {
      const root = createNode("Stack");
      const child = createNode("Box");
      const grandchild = createNode("Typography", { text: "Deep" });
      child.children = [grandchild];
      root.children = [child];

      const newRoot = removeNode(root, grandchild.id);
      expect(findNodeById(newRoot!, grandchild.id)).toBeNull();
    });
  });

  describe("updateNodeProps", () => {
    it("should update node props", () => {
      const node = createNode("Typography", { text: "Original" });

      const updated = updateNodeProps(node, node.id, { text: "Updated" });
      expect(updated.props.text).toBe("Updated");
    });

    it("should update nested node props", () => {
      const parent = createNode("Stack");
      const child = createNode("Typography", { text: "Original" });
      parent.children = [child];

      const newParent = updateNodeProps(parent, child.id, { text: "Updated" });
      expect(newParent.children![0].props.text).toBe("Updated");
    });
  });

  describe("cloneNode", () => {
    it("should create a deep clone with new IDs", () => {
      const parent = createNode("Stack");
      const child = createNode("Typography", { text: "Test" });
      parent.children = [child];

      const cloned = cloneNode(parent);
      expect(cloned.id).not.toBe(parent.id);
      expect(cloned.children![0].id).not.toBe(child.id);
      expect(cloned.type).toBe(parent.type);
      expect(cloned.children![0].props.text).toBe("Test");
    });
  });

  describe("countNodes", () => {
    it("should count all nodes in the tree", () => {
      const root = createNode("Stack");
      const child1 = createNode("Typography");
      const child2 = createNode("Box");
      const grandchild = createNode("Button", { text: "Click" });
      child2.children = [grandchild];
      root.children = [child1, child2];

      expect(countNodes(root)).toBe(4);
    });

    it("should count single node", () => {
      const node = createNode("Typography");
      expect(countNodes(node)).toBe(1);
    });
  });

  describe("flattenTree", () => {
    it("should flatten tree with depth information", () => {
      const root = createNode("Stack");
      const child = createNode("Box");
      const grandchild = createNode("Typography");
      child.children = [grandchild];
      root.children = [child];

      const flattened = flattenTree(root);
      expect(flattened).toHaveLength(3);
      expect(flattened[0].depth).toBe(0);
      expect(flattened[1].depth).toBe(1);
      expect(flattened[2].depth).toBe(2);
    });
  });
});
