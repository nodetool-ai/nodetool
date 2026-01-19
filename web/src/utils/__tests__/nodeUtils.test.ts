import { GROUP_NODE_TYPE, GROUP_NODE_METADATA, COMMENT_NODE_METADATA } from "../nodeUtils";
import { NodeMetadata } from "../../stores/ApiTypes";

describe("nodeUtils", () => {
  describe("GROUP_NODE_TYPE", () => {
    it("has correct node type value", () => {
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

    it("has default layout", () => {
      expect(GROUP_NODE_METADATA.layout).toBe("default");
    });

    it("has empty recommended_models array", () => {
      expect(GROUP_NODE_METADATA.recommended_models).toEqual([]);
    });

    it("has empty basic_fields array", () => {
      expect(GROUP_NODE_METADATA.basic_fields).toEqual([]);
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

    it("is not streaming output", () => {
      expect(GROUP_NODE_METADATA.is_streaming_output).toBe(false);
    });

    it("has empty the_model_info", () => {
      expect(GROUP_NODE_METADATA.the_model_info).toEqual({});
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

    it("is not dynamic", () => {
      expect(COMMENT_NODE_METADATA.is_dynamic).toBe(false);
    });

    it("does not expose as tool", () => {
      expect(COMMENT_NODE_METADATA.expose_as_tool).toBe(false);
    });
  });

  describe("metadata structure validation", () => {
    it("GROUP_NODE_METADATA matches NodeMetadata interface", () => {
      const metadata: NodeMetadata = GROUP_NODE_METADATA;
      expect(metadata.node_type).toBeDefined();
      expect(metadata.namespace).toBeDefined();
      expect(metadata.title).toBeDefined();
      expect(metadata.description).toBeDefined();
      expect(Array.isArray(metadata.properties)).toBe(true);
    });

    it("COMMENT_NODE_METADATA matches NodeMetadata interface", () => {
      const metadata: NodeMetadata = COMMENT_NODE_METADATA;
      expect(metadata.node_type).toBeDefined();
      expect(metadata.namespace).toBeDefined();
      expect(metadata.title).toBeDefined();
      expect(metadata.description).toBeDefined();
      expect(Array.isArray(metadata.properties)).toBe(true);
    });
  });
});
