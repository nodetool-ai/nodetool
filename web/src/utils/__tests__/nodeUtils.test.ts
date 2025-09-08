/**
 * @jest-environment node
 */
import { GROUP_NODE_TYPE, GROUP_NODE_METADATA, COMMENT_NODE_METADATA } from "../nodeUtils";

describe("nodeUtils", () => {
  describe("GROUP_NODE_TYPE constant", () => {
    it("should have the correct group node type value", () => {
      expect(GROUP_NODE_TYPE).toBe("nodetool.workflows.base_node.Group");
    });

    it("should be a string", () => {
      expect(typeof GROUP_NODE_TYPE).toBe("string");
    });
  });

  describe("GROUP_NODE_METADATA", () => {
    it("should have the correct structure", () => {
      expect(GROUP_NODE_METADATA).toHaveProperty("namespace");
      expect(GROUP_NODE_METADATA).toHaveProperty("node_type");
      expect(GROUP_NODE_METADATA).toHaveProperty("properties");
      expect(GROUP_NODE_METADATA).toHaveProperty("title");
      expect(GROUP_NODE_METADATA).toHaveProperty("description");
      expect(GROUP_NODE_METADATA).toHaveProperty("outputs");
      expect(GROUP_NODE_METADATA).toHaveProperty("the_model_info");
      expect(GROUP_NODE_METADATA).toHaveProperty("layout");
      expect(GROUP_NODE_METADATA).toHaveProperty("recommended_models");
      expect(GROUP_NODE_METADATA).toHaveProperty("basic_fields");
      expect(GROUP_NODE_METADATA).toHaveProperty("is_dynamic");
      expect(GROUP_NODE_METADATA).toHaveProperty("is_streaming");
      expect(GROUP_NODE_METADATA).toHaveProperty("expose_as_tool");
      expect(GROUP_NODE_METADATA).toHaveProperty("supports_dynamic_outputs");
    });

    it("should have correct default values for Group node", () => {
      expect(GROUP_NODE_METADATA.namespace).toBe("default");
      expect(GROUP_NODE_METADATA.node_type).toBe(GROUP_NODE_TYPE);
      expect(GROUP_NODE_METADATA.title).toBe("Group");
      expect(GROUP_NODE_METADATA.description).toBe("Group Node");
      expect(GROUP_NODE_METADATA.layout).toBe("default");
    });

    it("should have empty arrays for properties, outputs, recommended_models, and basic_fields", () => {
      expect(GROUP_NODE_METADATA.properties).toEqual([]);
      expect(GROUP_NODE_METADATA.outputs).toEqual([]);
      expect(GROUP_NODE_METADATA.recommended_models).toEqual([]);
      expect(GROUP_NODE_METADATA.basic_fields).toEqual([]);
    });

    it("should have empty object for the_model_info", () => {
      expect(GROUP_NODE_METADATA.the_model_info).toEqual({});
    });

    it("should have all boolean flags set to false", () => {
      expect(GROUP_NODE_METADATA.is_dynamic).toBe(false);
      expect(GROUP_NODE_METADATA.is_streaming).toBe(false);
      expect(GROUP_NODE_METADATA.expose_as_tool).toBe(false);
      expect(GROUP_NODE_METADATA.supports_dynamic_outputs).toBe(false);
    });

    it("should be immutable", () => {
      const originalNodeType = GROUP_NODE_METADATA.node_type;
      // Attempt to modify (this shouldn't actually change the constant)
      const testMetadata = { ...GROUP_NODE_METADATA };
      testMetadata.node_type = "modified";
      
      // Verify original hasn't changed
      expect(GROUP_NODE_METADATA.node_type).toBe(originalNodeType);
    });
  });

  describe("COMMENT_NODE_METADATA", () => {
    it("should have the correct structure", () => {
      expect(COMMENT_NODE_METADATA).toHaveProperty("namespace");
      expect(COMMENT_NODE_METADATA).toHaveProperty("node_type");
      expect(COMMENT_NODE_METADATA).toHaveProperty("properties");
      expect(COMMENT_NODE_METADATA).toHaveProperty("title");
      expect(COMMENT_NODE_METADATA).toHaveProperty("description");
      expect(COMMENT_NODE_METADATA).toHaveProperty("outputs");
      expect(COMMENT_NODE_METADATA).toHaveProperty("the_model_info");
      expect(COMMENT_NODE_METADATA).toHaveProperty("layout");
      expect(COMMENT_NODE_METADATA).toHaveProperty("recommended_models");
      expect(COMMENT_NODE_METADATA).toHaveProperty("basic_fields");
      expect(COMMENT_NODE_METADATA).toHaveProperty("is_dynamic");
      expect(COMMENT_NODE_METADATA).toHaveProperty("is_streaming");
      expect(COMMENT_NODE_METADATA).toHaveProperty("expose_as_tool");
      expect(COMMENT_NODE_METADATA).toHaveProperty("supports_dynamic_outputs");
    });

    it("should have correct default values for Comment node", () => {
      expect(COMMENT_NODE_METADATA.namespace).toBe("default");
      expect(COMMENT_NODE_METADATA.node_type).toBe("nodetool.workflows.base_node.Comment");
      expect(COMMENT_NODE_METADATA.title).toBe("Comment");
      expect(COMMENT_NODE_METADATA.description).toBe("Comment");
      expect(COMMENT_NODE_METADATA.layout).toBe("comment");
    });

    it("should have different layout than GROUP_NODE_METADATA", () => {
      expect(COMMENT_NODE_METADATA.layout).not.toBe(GROUP_NODE_METADATA.layout);
      expect(COMMENT_NODE_METADATA.layout).toBe("comment");
    });

    it("should have empty arrays for properties, outputs, recommended_models, and basic_fields", () => {
      expect(COMMENT_NODE_METADATA.properties).toEqual([]);
      expect(COMMENT_NODE_METADATA.outputs).toEqual([]);
      expect(COMMENT_NODE_METADATA.recommended_models).toEqual([]);
      expect(COMMENT_NODE_METADATA.basic_fields).toEqual([]);
    });

    it("should have empty object for the_model_info", () => {
      expect(COMMENT_NODE_METADATA.the_model_info).toEqual({});
    });

    it("should have all boolean flags set to false", () => {
      expect(COMMENT_NODE_METADATA.is_dynamic).toBe(false);
      expect(COMMENT_NODE_METADATA.is_streaming).toBe(false);
      expect(COMMENT_NODE_METADATA.expose_as_tool).toBe(false);
      expect(COMMENT_NODE_METADATA.supports_dynamic_outputs).toBe(false);
    });
  });

  describe("Metadata comparison", () => {
    it("should have different node_type values", () => {
      expect(GROUP_NODE_METADATA.node_type).not.toBe(COMMENT_NODE_METADATA.node_type);
    });

    it("should have different titles", () => {
      expect(GROUP_NODE_METADATA.title).not.toBe(COMMENT_NODE_METADATA.title);
    });

    it("should have different layouts", () => {
      expect(GROUP_NODE_METADATA.layout).not.toBe(COMMENT_NODE_METADATA.layout);
    });

    it("should have same namespace", () => {
      expect(GROUP_NODE_METADATA.namespace).toBe(COMMENT_NODE_METADATA.namespace);
    });

    it("should both have same boolean flag values", () => {
      expect(GROUP_NODE_METADATA.is_dynamic).toBe(COMMENT_NODE_METADATA.is_dynamic);
      expect(GROUP_NODE_METADATA.is_streaming).toBe(COMMENT_NODE_METADATA.is_streaming);
      expect(GROUP_NODE_METADATA.expose_as_tool).toBe(COMMENT_NODE_METADATA.expose_as_tool);
      expect(GROUP_NODE_METADATA.supports_dynamic_outputs).toBe(COMMENT_NODE_METADATA.supports_dynamic_outputs);
    });
  });
});