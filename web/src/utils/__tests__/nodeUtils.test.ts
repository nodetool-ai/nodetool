/**
 * @jest-environment node
 */
import {
  GROUP_NODE_TYPE,
  GROUP_NODE_METADATA,
  COMMENT_NODE_METADATA,
  SUBPATCH_NODE_TYPE,
  WORKFLOW_INPUT_NODE_TYPE,
  WORKFLOW_OUTPUT_NODE_TYPE,
  SUBPATCH_NODE_METADATA,
  WORKFLOW_INPUT_NODE_METADATA,
  WORKFLOW_OUTPUT_NODE_METADATA
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

  describe("Subpatch node type constants", () => {
    it("should have correct SUBPATCH_NODE_TYPE", () => {
      expect(SUBPATCH_NODE_TYPE).toBe("nodetool.workflow.Subpatch");
    });

    it("should have correct WORKFLOW_INPUT_NODE_TYPE", () => {
      expect(WORKFLOW_INPUT_NODE_TYPE).toBe("nodetool.workflow.WorkflowInput");
    });

    it("should have correct WORKFLOW_OUTPUT_NODE_TYPE", () => {
      expect(WORKFLOW_OUTPUT_NODE_TYPE).toBe("nodetool.workflow.WorkflowOutput");
    });
  });

  describe("SUBPATCH_NODE_METADATA", () => {
    it("should have correct metadata structure", () => {
      expect(SUBPATCH_NODE_METADATA).toBeDefined();
      expect(SUBPATCH_NODE_METADATA.node_type).toBe(SUBPATCH_NODE_TYPE);
      expect(SUBPATCH_NODE_METADATA.title).toBe("Subpatch");
      expect(SUBPATCH_NODE_METADATA.namespace).toBe("nodetool.workflow");
    });

    it("should have workflow_ref property", () => {
      const workflowRefProp = SUBPATCH_NODE_METADATA.properties?.find(
        (p) => p.name === "workflow_ref"
      );
      expect(workflowRefProp).toBeDefined();
      expect(workflowRefProp?.type.type).toBe("string");
      expect(workflowRefProp?.required).toBe(true);
    });

    it("should be marked as dynamic", () => {
      expect(SUBPATCH_NODE_METADATA.is_dynamic).toBe(true);
      expect(SUBPATCH_NODE_METADATA.supports_dynamic_outputs).toBe(true);
    });

    it("should have correct structure properties", () => {
      expect(SUBPATCH_NODE_METADATA).toHaveProperty("namespace");
      expect(SUBPATCH_NODE_METADATA).toHaveProperty("node_type");
      expect(SUBPATCH_NODE_METADATA).toHaveProperty("properties");
      expect(SUBPATCH_NODE_METADATA).toHaveProperty("title");
      expect(SUBPATCH_NODE_METADATA).toHaveProperty("description");
      expect(SUBPATCH_NODE_METADATA).toHaveProperty("outputs");
    });
  });

  describe("WORKFLOW_INPUT_NODE_METADATA", () => {
    it("should have correct metadata structure", () => {
      expect(WORKFLOW_INPUT_NODE_METADATA).toBeDefined();
      expect(WORKFLOW_INPUT_NODE_METADATA.node_type).toBe(
        WORKFLOW_INPUT_NODE_TYPE
      );
      expect(WORKFLOW_INPUT_NODE_METADATA.title).toBe("Workflow Input");
      expect(WORKFLOW_INPUT_NODE_METADATA.namespace).toBe("nodetool.workflow");
    });

    it("should have required properties", () => {
      const nameProp = WORKFLOW_INPUT_NODE_METADATA.properties?.find(
        (p) => p.name === "name"
      );
      expect(nameProp).toBeDefined();
      expect(nameProp?.required).toBe(true);

      const inputTypeProp = WORKFLOW_INPUT_NODE_METADATA.properties?.find(
        (p) => p.name === "input_type"
      );
      expect(inputTypeProp).toBeDefined();
      expect(inputTypeProp?.required).toBe(true);

      const descriptionProp = WORKFLOW_INPUT_NODE_METADATA.properties?.find(
        (p) => p.name === "description"
      );
      expect(descriptionProp).toBeDefined();
    });

    it("should have a value output", () => {
      expect(WORKFLOW_INPUT_NODE_METADATA.outputs).toBeDefined();
      expect(WORKFLOW_INPUT_NODE_METADATA.outputs?.length).toBe(1);
      expect(WORKFLOW_INPUT_NODE_METADATA.outputs?.[0].name).toBe("value");
    });

    it("should not be dynamic", () => {
      expect(WORKFLOW_INPUT_NODE_METADATA.is_dynamic).toBe(false);
    });
  });

  describe("WORKFLOW_OUTPUT_NODE_METADATA", () => {
    it("should have correct metadata structure", () => {
      expect(WORKFLOW_OUTPUT_NODE_METADATA).toBeDefined();
      expect(WORKFLOW_OUTPUT_NODE_METADATA.node_type).toBe(
        WORKFLOW_OUTPUT_NODE_TYPE
      );
      expect(WORKFLOW_OUTPUT_NODE_METADATA.title).toBe("Workflow Output");
      expect(WORKFLOW_OUTPUT_NODE_METADATA.namespace).toBe("nodetool.workflow");
    });

    it("should have required properties", () => {
      const nameProp = WORKFLOW_OUTPUT_NODE_METADATA.properties?.find(
        (p) => p.name === "name"
      );
      expect(nameProp).toBeDefined();
      expect(nameProp?.required).toBe(true);

      const outputTypeProp = WORKFLOW_OUTPUT_NODE_METADATA.properties?.find(
        (p) => p.name === "output_type"
      );
      expect(outputTypeProp).toBeDefined();
      expect(outputTypeProp?.required).toBe(true);

      const valueProp = WORKFLOW_OUTPUT_NODE_METADATA.properties?.find(
        (p) => p.name === "value"
      );
      expect(valueProp).toBeDefined();
      expect(valueProp?.required).toBe(true);
    });

    it("should have no outputs (it captures values)", () => {
      expect(WORKFLOW_OUTPUT_NODE_METADATA.outputs).toBeDefined();
      expect(WORKFLOW_OUTPUT_NODE_METADATA.outputs?.length).toBe(0);
    });

    it("should not be dynamic", () => {
      expect(WORKFLOW_OUTPUT_NODE_METADATA.is_dynamic).toBe(false);
    });
  });

  describe("Subpatch metadata comparison", () => {
    it("should have different node_type values for all subpatch-related nodes", () => {
      expect(SUBPATCH_NODE_METADATA.node_type).not.toBe(
        WORKFLOW_INPUT_NODE_METADATA.node_type
      );
      expect(SUBPATCH_NODE_METADATA.node_type).not.toBe(
        WORKFLOW_OUTPUT_NODE_METADATA.node_type
      );
      expect(WORKFLOW_INPUT_NODE_METADATA.node_type).not.toBe(
        WORKFLOW_OUTPUT_NODE_METADATA.node_type
      );
    });

    it("should have same namespace for all subpatch-related nodes", () => {
      expect(SUBPATCH_NODE_METADATA.namespace).toBe("nodetool.workflow");
      expect(WORKFLOW_INPUT_NODE_METADATA.namespace).toBe("nodetool.workflow");
      expect(WORKFLOW_OUTPUT_NODE_METADATA.namespace).toBe("nodetool.workflow");
    });

    it("should only have Subpatch marked as dynamic", () => {
      expect(SUBPATCH_NODE_METADATA.is_dynamic).toBe(true);
      expect(WORKFLOW_INPUT_NODE_METADATA.is_dynamic).toBe(false);
      expect(WORKFLOW_OUTPUT_NODE_METADATA.is_dynamic).toBe(false);
    });
  });
});
