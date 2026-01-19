import {
  GROUP_NODE_TYPE,
  GROUP_NODE_METADATA,
  COMMENT_NODE_METADATA
} from "../nodeUtils";

describe("nodeUtils", () => {
  describe("constants", () => {
    it("defines correct GROUP_NODE_TYPE", () => {
      expect(GROUP_NODE_TYPE).toBe("nodetool.workflows.base_node.Group");
    });
  });

  describe("GROUP_NODE_METADATA", () => {
    it("has correct node_type", () => {
      expect(GROUP_NODE_METADATA.node_type).toBe(GROUP_NODE_TYPE);
    });

    it("has correct namespace", () => {
      expect(GROUP_NODE_METADATA.namespace).toBe("default");
    });

    it("has correct title", () => {
      expect(GROUP_NODE_METADATA.title).toBe("Group");
    });

    it("has correct description", () => {
      expect(GROUP_NODE_METADATA.description).toBe("Group Node");
    });

    it("has empty properties array", () => {
      expect(GROUP_NODE_METADATA.properties).toEqual([]);
    });

    it("has empty outputs array", () => {
      expect(GROUP_NODE_METADATA.outputs).toEqual([]);
    });

    it("has empty recommended_models array", () => {
      expect(GROUP_NODE_METADATA.recommended_models).toEqual([]);
    });

    it("has empty basic_fields array", () => {
      expect(GROUP_NODE_METADATA.basic_fields).toEqual([]);
    });

    it("has default layout", () => {
      expect(GROUP_NODE_METADATA.layout).toBe("default");
    });

    it("has empty model info", () => {
      expect(GROUP_NODE_METADATA.the_model_info).toEqual({});
    });

    it("is_dynamic is false", () => {
      expect(GROUP_NODE_METADATA.is_dynamic).toBe(false);
    });

    it("expose_as_tool is false", () => {
      expect(GROUP_NODE_METADATA.expose_as_tool).toBe(false);
    });

    it("supports_dynamic_outputs is false", () => {
      expect(GROUP_NODE_METADATA.supports_dynamic_outputs).toBe(false);
    });

    it("is_streaming_output is false", () => {
      expect(GROUP_NODE_METADATA.is_streaming_output).toBe(false);
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

    it("has correct description", () => {
      expect(COMMENT_NODE_METADATA.description).toBe("Comment");
    });

    it("has comment layout", () => {
      expect(COMMENT_NODE_METADATA.layout).toBe("comment");
    });

    it("has empty properties array", () => {
      expect(COMMENT_NODE_METADATA.properties).toEqual([]);
    });

    it("has empty outputs array", () => {
      expect(COMMENT_NODE_METADATA.outputs).toEqual([]);
    });
  });

  it("both metadata objects are properly defined", () => {
    expect(GROUP_NODE_METADATA).toBeDefined();
    expect(COMMENT_NODE_METADATA).toBeDefined();
  });
});
