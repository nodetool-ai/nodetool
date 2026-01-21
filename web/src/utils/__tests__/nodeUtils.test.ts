import { GROUP_NODE_METADATA, COMMENT_NODE_METADATA } from "../nodeUtils";

describe("nodeUtils", () => {
  describe("GROUP_NODE_METADATA", () => {
    it("has correct node_type", () => {
      expect(GROUP_NODE_METADATA.node_type).toBe("nodetool.workflows.base_node.Group");
    });

    it("has correct namespace", () => {
      expect(GROUP_NODE_METADATA.namespace).toBe("default");
    });

    it("has correct title", () => {
      expect(GROUP_NODE_METADATA.title).toBe("Group");
    });

    it("has empty properties array", () => {
      expect(GROUP_NODE_METADATA.properties).toEqual([]);
    });

    it("has empty outputs array", () => {
      expect(GROUP_NODE_METADATA.outputs).toEqual([]);
    });

    it("is not dynamic", () => {
      expect(GROUP_NODE_METADATA.is_dynamic).toBe(false);
    });

    it("does not expose as tool", () => {
      expect(GROUP_NODE_METADATA.expose_as_tool).toBe(false);
    });

    it("does not support dynamic outputs", () => {
      expect(GROUP_NODE_METADATA.supports_dynamic_outputs).toBe(false);
    });
  });

  describe("COMMENT_NODE_METADATA", () => {
    it("has correct node_type", () => {
      expect(COMMENT_NODE_METADATA.node_type).toBe("nodetool.workflows.base_node.Comment");
    });

    it("has correct namespace", () => {
      expect(COMMENT_NODE_METADATA.namespace).toBe("default");
    });

    it("has correct title", () => {
      expect(COMMENT_NODE_METADATA.title).toBe("Comment");
    });

    it("has comment layout", () => {
      expect(COMMENT_NODE_METADATA.layout).toBe("comment");
    });

    it("is not dynamic", () => {
      expect(COMMENT_NODE_METADATA.is_dynamic).toBe(false);
    });
  });
});
