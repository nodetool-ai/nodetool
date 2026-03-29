/**
 * Tests for ComfyUI schema converter utilities
 */

import {
  comfySchemaToNodeMetadata,
  comfyObjectInfoToMetadataMap
} from "../comfySchemaConverter";
import { ComfyUINodeSchema, ComfyUIObjectInfo } from "../../services/ComfyUIService";

describe("ComfyUI Schema Converter", () => {
  describe("comfySchemaToNodeMetadata", () => {
    test("converts basic ComfyUI schema to NodeMetadata", () => {
      const schema: ComfyUINodeSchema = {
        input: {
          required: {
            model: ["STRING", { default: "v1-5-pruned.ckpt" }],
            steps: ["INT", { default: 20, min: 1, max: 100 }]
          },
          optional: {}
        },
        output: ["MODEL", "CLIP", "VAE"],
        output_is_list: [false, false, false],
        output_name: ["model", "clip", "vae"],
        name: "LoadCheckpoint",
        display_name: "Load Checkpoint",
        description: "Loads a checkpoint model",
        category: "loaders",
        output_node: false
      };

      const metadata = comfySchemaToNodeMetadata("LoadCheckpoint", schema);

      expect(metadata.node_type).toBe("comfy.LoadCheckpoint");
      expect(metadata.title).toBe("Load Checkpoint");
      expect(metadata.description).toBe("Loads a checkpoint model");
      expect(metadata.namespace).toBe("comfy");
      
      // Check properties
      expect(metadata.properties).toHaveLength(2);
      expect(metadata.properties[0].name).toBe("model");
      expect(metadata.properties[0].required).toBe(true);
      expect(metadata.properties[0].type.type).toBe("str");
      
      expect(metadata.properties[1].name).toBe("steps");
      expect(metadata.properties[1].required).toBe(true);
      expect(metadata.properties[1].type.type).toBe("int");
      expect(metadata.properties[1].min).toBe(1);
      expect(metadata.properties[1].max).toBe(100);
      
      // Check outputs
      expect(metadata.outputs).toHaveLength(3);
      expect(metadata.outputs[0].name).toBe("model");
      expect(metadata.outputs[0].type.type).toBe("comfy.unet");
      expect(metadata.outputs[1].name).toBe("clip");
      expect(metadata.outputs[1].type.type).toBe("comfy.clip");
    });

    test("handles optional inputs", () => {
      const schema: ComfyUINodeSchema = {
        input: {
          required: {
            required_param: ["STRING", {}]
          },
          optional: {
            optional_param: ["INT", { default: 10 }]
          }
        },
        output: ["IMAGE"],
        output_is_list: [false],
        output_name: ["output"],
        name: "TestNode",
        display_name: "Test Node",
        description: "A test node",
        category: "test",
        output_node: false
      };

      const metadata = comfySchemaToNodeMetadata("TestNode", schema);

      expect(metadata.properties).toHaveLength(2);
      
      const requiredProp = metadata.properties.find(p => p.name === "required_param");
      expect(requiredProp?.required).toBe(true);
      
      const optionalProp = metadata.properties.find(p => p.name === "optional_param");
      expect(optionalProp?.required).toBe(false);
    });

    test("maps ComfyUI types to NodeTool types", () => {
      const schema: ComfyUINodeSchema = {
        input: {
          required: {
            image: ["IMAGE", {}],
            latent: ["LATENT", {}],
            model: ["MODEL", {}],
            vae: ["VAE", {}],
            conditioning: ["CONDITIONING", {}],
            clip: ["CLIP", {}]
          }
        },
        output: [],
        output_is_list: [],
        output_name: [],
        name: "TypeTest",
        display_name: "Type Test",
        description: "Tests type mapping",
        category: "test",
        output_node: false
      };

      const metadata = comfySchemaToNodeMetadata("TypeTest", schema);

      const findProp = (name: string) => metadata.properties.find(p => p.name === name);

      expect(findProp("image")?.type.type).toBe("comfy.image_tensor");
      expect(findProp("latent")?.type.type).toBe("comfy.latent");
      expect(findProp("model")?.type.type).toBe("comfy.unet");
      expect(findProp("vae")?.type.type).toBe("comfy.vae");
      expect(findProp("conditioning")?.type.type).toBe("comfy.conditioning");
      expect(findProp("clip")?.type.type).toBe("comfy.clip");
    });

    test("handles enum values in json_schema_extra", () => {
      const schema: ComfyUINodeSchema = {
        input: {
          required: {
            sampler: [["euler", "dpm2", "lms"] as any, {}]
          }
        },
        output: [],
        output_is_list: [],
        output_name: [],
        name: "EnumTest",
        display_name: "Enum Test",
        description: "Tests enum handling",
        category: "test",
        output_node: false
      };

      const metadata = comfySchemaToNodeMetadata("EnumTest", schema);

      const samplerProp = metadata.properties.find(p => p.name === "sampler");
      expect(samplerProp?.json_schema_extra?.enum).toEqual(["euler", "dpm2", "lms"]);
    });
  });

  describe("comfyObjectInfoToMetadataMap", () => {
    test("converts multiple schemas to metadata map", () => {
      const objectInfo: ComfyUIObjectInfo = {
        LoadCheckpoint: {
          input: {
            required: { model: ["STRING", {}] },
            optional: {}
          },
          output: ["MODEL"],
          output_is_list: [false],
          output_name: ["model"],
          name: "LoadCheckpoint",
          display_name: "Load Checkpoint",
          description: "Loads a checkpoint",
          category: "loaders",
          output_node: false
        },
        KSampler: {
          input: {
            required: { steps: ["INT", { default: 20 }] },
            optional: {}
          },
          output: ["LATENT"],
          output_is_list: [false],
          output_name: ["latent"],
          name: "KSampler",
          display_name: "KSampler",
          description: "Sampling node",
          category: "sampling",
          output_node: false
        }
      };

      const metadataMap = comfyObjectInfoToMetadataMap(objectInfo);

      expect(Object.keys(metadataMap)).toHaveLength(2);
      expect(metadataMap["comfy.LoadCheckpoint"]).toBeDefined();
      expect(metadataMap["comfy.KSampler"]).toBeDefined();
      
      expect(metadataMap["comfy.LoadCheckpoint"].title).toBe("Load Checkpoint");
      expect(metadataMap["comfy.KSampler"].title).toBe("KSampler");
    });

    test("skips schemas that fail to convert", () => {
      const objectInfo: ComfyUIObjectInfo = {
        ValidNode: {
          input: { required: {}, optional: {} },
          output: [],
          output_is_list: [],
          output_name: [],
          name: "ValidNode",
          display_name: "Valid Node",
          description: "Valid",
          category: "test",
          output_node: false
        }
        // InvalidNode would be here if it existed
      };

      const metadataMap = comfyObjectInfoToMetadataMap(objectInfo);

      expect(Object.keys(metadataMap)).toHaveLength(1);
      expect(metadataMap["comfy.ValidNode"]).toBeDefined();
    });
  });
});
