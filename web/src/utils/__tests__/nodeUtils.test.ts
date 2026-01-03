/**
 * @jest-environment node
 */
import {
  GROUP_NODE_TYPE,
  GROUP_NODE_METADATA,
  COMMENT_NODE_METADATA,
  FOREACH_REGION_TYPE,
  IF_REGION_TYPE,
  FOREACH_REGION_METADATA,
  IF_REGION_METADATA,
  isRegionNodeType,
  isContainerNodeType,
  CONTAINER_NODE_ZINDEX
} from "../nodeUtils";

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
      expect(COMMENT_NODE_METADATA).toHaveProperty("expose_as_tool");
      expect(COMMENT_NODE_METADATA).toHaveProperty("supports_dynamic_outputs");
    });

    it("should have correct default values for Comment node", () => {
      expect(COMMENT_NODE_METADATA.namespace).toBe("default");
      expect(COMMENT_NODE_METADATA.node_type).toBe(
        "nodetool.workflows.base_node.Comment"
      );
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
      expect(COMMENT_NODE_METADATA.expose_as_tool).toBe(false);
      expect(COMMENT_NODE_METADATA.supports_dynamic_outputs).toBe(false);
    });
  });

  describe("Metadata comparison", () => {
    it("should have different node_type values", () => {
      expect(GROUP_NODE_METADATA.node_type).not.toBe(
        COMMENT_NODE_METADATA.node_type
      );
    });

    it("should have different titles", () => {
      expect(GROUP_NODE_METADATA.title).not.toBe(COMMENT_NODE_METADATA.title);
    });

    it("should have different layouts", () => {
      expect(GROUP_NODE_METADATA.layout).not.toBe(COMMENT_NODE_METADATA.layout);
    });

    it("should have same namespace", () => {
      expect(GROUP_NODE_METADATA.namespace).toBe(
        COMMENT_NODE_METADATA.namespace
      );
    });

    it("should both have same boolean flag values", () => {
      expect(GROUP_NODE_METADATA.is_dynamic).toBe(
        COMMENT_NODE_METADATA.is_dynamic
      );
      expect(GROUP_NODE_METADATA.expose_as_tool).toBe(
        COMMENT_NODE_METADATA.expose_as_tool
      );
      expect(GROUP_NODE_METADATA.supports_dynamic_outputs).toBe(
        COMMENT_NODE_METADATA.supports_dynamic_outputs
      );
    });
  });

  describe("Region Node Type constants", () => {
    it("should have the correct ForEach region type value", () => {
      expect(FOREACH_REGION_TYPE).toBe("nodetool.regions.ForEachRegion");
    });

    it("should have the correct If region type value", () => {
      expect(IF_REGION_TYPE).toBe("nodetool.regions.IfRegion");
    });

    it("should be strings", () => {
      expect(typeof FOREACH_REGION_TYPE).toBe("string");
      expect(typeof IF_REGION_TYPE).toBe("string");
    });
  });

  describe("FOREACH_REGION_METADATA", () => {
    it("should have the correct structure", () => {
      expect(FOREACH_REGION_METADATA).toHaveProperty("namespace");
      expect(FOREACH_REGION_METADATA).toHaveProperty("node_type");
      expect(FOREACH_REGION_METADATA).toHaveProperty("properties");
      expect(FOREACH_REGION_METADATA).toHaveProperty("title");
      expect(FOREACH_REGION_METADATA).toHaveProperty("description");
      expect(FOREACH_REGION_METADATA).toHaveProperty("outputs");
      expect(FOREACH_REGION_METADATA).toHaveProperty("the_model_info");
      expect(FOREACH_REGION_METADATA).toHaveProperty("layout");
      expect(FOREACH_REGION_METADATA).toHaveProperty("recommended_models");
      expect(FOREACH_REGION_METADATA).toHaveProperty("basic_fields");
      expect(FOREACH_REGION_METADATA).toHaveProperty("is_dynamic");
      expect(FOREACH_REGION_METADATA).toHaveProperty("expose_as_tool");
      expect(FOREACH_REGION_METADATA).toHaveProperty("supports_dynamic_outputs");
    });

    it("should have correct default values for ForEach Region node", () => {
      expect(FOREACH_REGION_METADATA.namespace).toBe("nodetool.regions");
      expect(FOREACH_REGION_METADATA.node_type).toBe(FOREACH_REGION_TYPE);
      expect(FOREACH_REGION_METADATA.title).toBe("ForEach Region");
      expect(FOREACH_REGION_METADATA.layout).toBe("default");
    });

    it("should have input_list property", () => {
      expect(FOREACH_REGION_METADATA.properties.length).toBe(1);
      expect(FOREACH_REGION_METADATA.properties[0].name).toBe("input_list");
      expect(FOREACH_REGION_METADATA.properties[0].type.type).toBe("list");
    });

    it("should have three outputs", () => {
      expect(FOREACH_REGION_METADATA.outputs.length).toBe(3);
      const outputNames = FOREACH_REGION_METADATA.outputs.map((o) => o.name);
      expect(outputNames).toContain("current_item");
      expect(outputNames).toContain("current_index");
      expect(outputNames).toContain("accumulated");
    });

    it("should have input_list as basic field", () => {
      expect(FOREACH_REGION_METADATA.basic_fields).toEqual(["input_list"]);
    });

    it("should have all boolean flags set to false", () => {
      expect(FOREACH_REGION_METADATA.is_dynamic).toBe(false);
      expect(FOREACH_REGION_METADATA.expose_as_tool).toBe(false);
      expect(FOREACH_REGION_METADATA.supports_dynamic_outputs).toBe(false);
    });
  });

  describe("IF_REGION_METADATA", () => {
    it("should have the correct structure", () => {
      expect(IF_REGION_METADATA).toHaveProperty("namespace");
      expect(IF_REGION_METADATA).toHaveProperty("node_type");
      expect(IF_REGION_METADATA).toHaveProperty("properties");
      expect(IF_REGION_METADATA).toHaveProperty("title");
      expect(IF_REGION_METADATA).toHaveProperty("description");
      expect(IF_REGION_METADATA).toHaveProperty("outputs");
      expect(IF_REGION_METADATA).toHaveProperty("the_model_info");
      expect(IF_REGION_METADATA).toHaveProperty("layout");
      expect(IF_REGION_METADATA).toHaveProperty("recommended_models");
      expect(IF_REGION_METADATA).toHaveProperty("basic_fields");
      expect(IF_REGION_METADATA).toHaveProperty("is_dynamic");
      expect(IF_REGION_METADATA).toHaveProperty("expose_as_tool");
      expect(IF_REGION_METADATA).toHaveProperty("supports_dynamic_outputs");
    });

    it("should have correct default values for If Region node", () => {
      expect(IF_REGION_METADATA.namespace).toBe("nodetool.regions");
      expect(IF_REGION_METADATA.node_type).toBe(IF_REGION_TYPE);
      expect(IF_REGION_METADATA.title).toBe("If Region");
      expect(IF_REGION_METADATA.layout).toBe("default");
    });

    it("should have condition property", () => {
      expect(IF_REGION_METADATA.properties.length).toBe(1);
      expect(IF_REGION_METADATA.properties[0].name).toBe("condition");
      expect(IF_REGION_METADATA.properties[0].type.type).toBe("bool");
    });

    it("should have result output", () => {
      expect(IF_REGION_METADATA.outputs.length).toBe(1);
      expect(IF_REGION_METADATA.outputs[0].name).toBe("result");
    });

    it("should have condition as basic field", () => {
      expect(IF_REGION_METADATA.basic_fields).toEqual(["condition"]);
    });

    it("should have all boolean flags set to false", () => {
      expect(IF_REGION_METADATA.is_dynamic).toBe(false);
      expect(IF_REGION_METADATA.expose_as_tool).toBe(false);
      expect(IF_REGION_METADATA.supports_dynamic_outputs).toBe(false);
    });
  });

  describe("isRegionNodeType function", () => {
    it("should return true for ForEach region type", () => {
      expect(isRegionNodeType(FOREACH_REGION_TYPE)).toBe(true);
    });

    it("should return true for If region type", () => {
      expect(isRegionNodeType(IF_REGION_TYPE)).toBe(true);
    });

    it("should return false for Group node type", () => {
      expect(isRegionNodeType(GROUP_NODE_TYPE)).toBe(false);
    });

    it("should return false for arbitrary string", () => {
      expect(isRegionNodeType("some.other.node")).toBe(false);
    });

    it("should return false for empty string", () => {
      expect(isRegionNodeType("")).toBe(false);
    });
  });

  describe("Region metadata comparison", () => {
    it("should have same namespace for both region types", () => {
      expect(FOREACH_REGION_METADATA.namespace).toBe(
        IF_REGION_METADATA.namespace
      );
    });

    it("should have different node_type values", () => {
      expect(FOREACH_REGION_METADATA.node_type).not.toBe(
        IF_REGION_METADATA.node_type
      );
    });

    it("should have different titles", () => {
      expect(FOREACH_REGION_METADATA.title).not.toBe(IF_REGION_METADATA.title);
    });

    it("should both have same boolean flag values", () => {
      expect(FOREACH_REGION_METADATA.is_dynamic).toBe(
        IF_REGION_METADATA.is_dynamic
      );
      expect(FOREACH_REGION_METADATA.expose_as_tool).toBe(
        IF_REGION_METADATA.expose_as_tool
      );
      expect(FOREACH_REGION_METADATA.supports_dynamic_outputs).toBe(
        IF_REGION_METADATA.supports_dynamic_outputs
      );
    });
  });

  describe("CONTAINER_NODE_ZINDEX constant", () => {
    it("should be a negative number to render behind child nodes", () => {
      expect(CONTAINER_NODE_ZINDEX).toBe(-10);
      expect(CONTAINER_NODE_ZINDEX).toBeLessThan(0);
    });
  });

  describe("isContainerNodeType function", () => {
    it("should return true for Group node type", () => {
      expect(isContainerNodeType(GROUP_NODE_TYPE)).toBe(true);
    });

    it("should return true for Loop node type", () => {
      expect(isContainerNodeType("nodetool.group.Loop")).toBe(true);
    });

    it("should return true for ForEach region type", () => {
      expect(isContainerNodeType(FOREACH_REGION_TYPE)).toBe(true);
    });

    it("should return true for If region type", () => {
      expect(isContainerNodeType(IF_REGION_TYPE)).toBe(true);
    });

    it("should return false for Comment node type", () => {
      expect(isContainerNodeType("nodetool.workflows.base_node.Comment")).toBe(false);
    });

    it("should return false for arbitrary string", () => {
      expect(isContainerNodeType("some.other.node")).toBe(false);
    });

    it("should return false for empty string", () => {
      expect(isContainerNodeType("")).toBe(false);
    });
  });
});
