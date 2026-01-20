import { GROUP_NODE_TYPE, GROUP_NODE_METADATA, COMMENT_NODE_METADATA } from "../nodeUtils";

describe("nodeUtils", () => {
  describe("GROUP_NODE_TYPE", () => {
    it("has correct constant value", () => {
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

    it("has correct description", () => {
      expect(GROUP_NODE_METADATA.description).toBe("Group Node");
    });

    it("has empty properties array", () => {
      expect(GROUP_NODE_METADATA.properties).toEqual([]);
    });

    it("has empty outputs array", () => {
      expect(GROUP_NODE_METADATA.outputs).toEqual([]);
    });

    it("has default layout", () => {
      expect(GROUP_NODE_METADATA.layout).toBe("default");
    });

    it("is not dynamic", () => {
      expect(GROUP_NODE_METADATA.is_dynamic).toBe(false);
    });

    it("is not exposed as tool", () => {
      expect(GROUP_NODE_METADATA.expose_as_tool).toBe(false);
    });

    it("does not support dynamic outputs", () => {
      expect(GROUP_NODE_METADATA.supports_dynamic_outputs).toBe(false);
    });

    it("is not streaming output", () => {
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

    it("has correct description", () => {
      expect(COMMENT_NODE_METADATA.description).toBe("Comment");
    });

    it("has empty properties array", () => {
      expect(COMMENT_NODE_METADATA.properties).toEqual([]);
    });

    it("has empty outputs array", () => {
      expect(COMMENT_NODE_METADATA.outputs).toEqual([]);
    });

    it("has comment layout", () => {
      expect(COMMENT_NODE_METADATA.layout).toBe("comment");
    });

    it("is not dynamic", () => {
      expect(COMMENT_NODE_METADATA.is_dynamic).toBe(false);
    });

    it("is not exposed as tool", () => {
      expect(COMMENT_NODE_METADATA.expose_as_tool).toBe(false);
    });

    it("does not support dynamic outputs", () => {
      expect(COMMENT_NODE_METADATA.supports_dynamic_outputs).toBe(false);
    });

    it("is not streaming output", () => {
      expect(COMMENT_NODE_METADATA.is_streaming_output).toBe(false);
    });
  });

  describe("metadata structure", () => {
    it("both metadata have namespace", () => {
      expect(GROUP_NODE_METADATA.namespace).toBe("default");
      expect(COMMENT_NODE_METADATA.namespace).toBe("default");
    });

    it("both metadata have empty basic_fields", () => {
      expect(GROUP_NODE_METADATA.basic_fields).toEqual([]);
      expect(COMMENT_NODE_METADATA.basic_fields).toEqual([]);
    });

    it("both metadata have empty recommended_models", () => {
      expect(GROUP_NODE_METADATA.recommended_models).toEqual([]);
      expect(COMMENT_NODE_METADATA.recommended_models).toEqual([]);
    });

    it("both metadata have empty model_info", () => {
      expect(GROUP_NODE_METADATA.the_model_info).toEqual({});
      expect(COMMENT_NODE_METADATA.the_model_info).toEqual({});
    });
  });
});
