import { GROUP_NODE_TYPE, GROUP_NODE_METADATA, COMMENT_NODE_METADATA } from "../nodeUtils";

describe("nodeUtils constants", () => {
  describe("GROUP_NODE_TYPE", () => {
    it("equals expected value", () => {
      expect(GROUP_NODE_TYPE).toBe("nodetool.workflows.base_node.Group");
    });
  });

  describe("GROUP_NODE_METADATA", () => {
    it("has correct node_type", () => {
      expect(GROUP_NODE_METADATA.node_type).toBe(GROUP_NODE_TYPE);
    });

    it("has correct title", () => {
      expect(GROUP_NODE_METADATA.title).toBe("Group");
    });

    it("has correct namespace", () => {
      expect(GROUP_NODE_METADATA.namespace).toBe("default");
    });

    it("has empty properties", () => {
      expect(GROUP_NODE_METADATA.properties).toEqual([]);
    });

    it("has empty outputs", () => {
      expect(GROUP_NODE_METADATA.outputs).toEqual([]);
    });

    it("has default layout", () => {
      expect(GROUP_NODE_METADATA.layout).toBe("default");
    });

    it("has correct boolean flags", () => {
      expect(GROUP_NODE_METADATA.is_dynamic).toBe(false);
      expect(GROUP_NODE_METADATA.expose_as_tool).toBe(false);
      expect(GROUP_NODE_METADATA.supports_dynamic_outputs).toBe(false);
      expect(GROUP_NODE_METADATA.is_streaming_output).toBe(false);
    });
  });

  describe("COMMENT_NODE_METADATA", () => {
    it("has correct node_type", () => {
      expect(COMMENT_NODE_METADATA.node_type).toBe("nodetool.workflows.base_node.Comment");
    });

    it("has correct title", () => {
      expect(COMMENT_NODE_METADATA.title).toBe("Comment");
    });

    it("has comment layout", () => {
      expect(COMMENT_NODE_METADATA.layout).toBe("comment");
    });

    it("has empty properties", () => {
      expect(COMMENT_NODE_METADATA.properties).toEqual([]);
    });

    it("has empty outputs", () => {
      expect(COMMENT_NODE_METADATA.outputs).toEqual([]);
    });

    it("has correct boolean flags", () => {
      expect(COMMENT_NODE_METADATA.is_dynamic).toBe(false);
      expect(COMMENT_NODE_METADATA.expose_as_tool).toBe(false);
    });
  });
});
