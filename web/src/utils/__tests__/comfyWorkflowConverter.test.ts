/**
 * Tests for ComfyUI workflow converter utilities
 */

import {
  comfyWorkflowToNodeToolGraph,
  nodeToolGraphToComfyWorkflow,
  nodeToolGraphToComfyPrompt,
  comfyPromptToNodeToolGraph,
  isComfyUINode,
  graphHasComfyUINodes,
  hasComfyWorkflowFlag,
  isComfyWorkflow,
  COMFY_WORKFLOW_FLAG
} from "../comfyWorkflowConverter";
import { ComfyUIWorkflow } from "../../services/ComfyUIService";
import { Graph } from "../../stores/ApiTypes";

describe("ComfyUI Workflow Converter", () => {
  describe("isComfyUINode", () => {
    test("returns true for ComfyUI nodes", () => {
      expect(isComfyUINode("comfy.KSampler")).toBe(true);
      expect(isComfyUINode("comfy.LoadCheckpoint")).toBe(true);
    });

    test("returns false for non-ComfyUI nodes", () => {
      expect(isComfyUINode("nodetool.input.StringInput")).toBe(false);
      expect(isComfyUINode("nodetool.output.Output")).toBe(false);
    });
  });

  describe("graphHasComfyUINodes", () => {
    test("returns true when graph contains ComfyUI nodes", () => {
      const graph: Graph = {
        nodes: [
          {
            id: "1",
            type: "comfy.KSampler",
            data: {},
            sync_mode: "on_any"
          }
        ],
        edges: []
      };
      expect(graphHasComfyUINodes(graph)).toBe(true);
    });

    test("returns false when graph has no ComfyUI nodes", () => {
      const graph: Graph = {
        nodes: [
          {
            id: "1",
            type: "nodetool.input.StringInput",
            data: {},
            sync_mode: "on_any"
          }
        ],
        edges: []
      };
      expect(graphHasComfyUINodes(graph)).toBe(false);
    });
  });

  describe("workflow detection", () => {
    test("detects Comfy workflow from settings flag", () => {
      expect(
        hasComfyWorkflowFlag({
          [COMFY_WORKFLOW_FLAG]: true
        })
      ).toBe(true);
    });

    test("falls back to graph node inspection when settings flag is absent", () => {
      const graph: Graph = {
        nodes: [
          {
            id: "1",
            type: "comfy.KSampler",
            data: {},
            sync_mode: "on_any"
          }
        ],
        edges: []
      };

      expect(isComfyWorkflow(graph, null)).toBe(true);
    });
  });

  describe("comfyWorkflowToNodeToolGraph", () => {
    test("converts basic ComfyUI workflow to NodeTool graph", () => {
      const comfyWorkflow: ComfyUIWorkflow = {
        last_node_id: 2,
        last_link_id: 1,
        nodes: [
          {
            id: 1,
            type: "LoadCheckpoint",
            pos: [100, 100],
            size: [300, 80],
            flags: {},
            order: 0,
            mode: 0,
            outputs: [
              {
                name: "MODEL",
                type: "MODEL",
                links: [1]
              }
            ],
            properties: { model: "v1-5-pruned.ckpt" },
            widgets_values: []
          },
          {
            id: 2,
            type: "KSampler",
            pos: [500, 100],
            size: [300, 200],
            flags: {},
            order: 1,
            mode: 0,
            inputs: [
              {
                name: "model",
                type: "MODEL",
                link: 1
              }
            ],
            properties: { steps: 20, cfg: 7.0 },
            widgets_values: []
          }
        ],
        links: [
          {
            id: 1,
            origin_id: 1,
            origin_slot: 0,
            target_id: 2,
            target_slot: 0,
            type: "*"
          }
        ],
        groups: [],
        config: {},
        extra: {},
        version: 0.4
      };

      const graph = comfyWorkflowToNodeToolGraph(comfyWorkflow);

      expect(graph.nodes).toHaveLength(2);
      expect(graph.edges).toHaveLength(1);

      // Check node conversion
      expect(graph.nodes[0].id).toBe("1");
      expect(graph.nodes[0].type).toBe("comfy.LoadCheckpoint");
      
      const uiProps = graph.nodes[0].ui_properties as Record<string, any>;
      const position = uiProps.position as { x: number; y: number };
      expect(position.x).toBe(100);
      expect(position.y).toBe(100);

      // Check edge conversion
      expect(graph.edges[0].source).toBe("1");
      expect(graph.edges[0].target).toBe("2");
      expect(graph.edges[0].sourceHandle).toBe("MODEL");
      expect(graph.edges[0].targetHandle).toBe("model");
    });

    test("preserves ComfyUI metadata", () => {
      const comfyWorkflow: ComfyUIWorkflow = {
        last_node_id: 1,
        last_link_id: 0,
        nodes: [
          {
            id: 1,
            type: "TestNode",
            pos: [0, 0],
            size: [100, 100],
            flags: { collapsed: true },
            order: 5,
            mode: 2,
            properties: {},
            widgets_values: ["value1", "value2"]
          }
        ],
        links: [],
        groups: [],
        config: {},
        extra: {},
        version: 0.4
      };

      const graph = comfyWorkflowToNodeToolGraph(comfyWorkflow);
      const node = graph.nodes[0];
      const data = node.data as Record<string, any>;
      const metadata = data._comfy_metadata;

      expect(metadata.original_type).toBe("TestNode");
      expect(metadata.order).toBe(5);
      expect(metadata.mode).toBe(2);
      expect(metadata.flags.collapsed).toBe(true);
      expect(data._comfy_widgets).toEqual(["value1", "value2"]);
    });
  });

  describe("nodeToolGraphToComfyWorkflow", () => {
    test("converts NodeTool graph back to ComfyUI workflow", () => {
      const graph: Graph = {
        nodes: [
          {
            id: "1",
            type: "comfy.LoadCheckpoint",
            data: {
              model: "v1-5-pruned.ckpt",
              _comfy_metadata: {
                original_type: "LoadCheckpoint",
                order: 0,
                mode: 0,
                flags: {}
              }
            },
            sync_mode: "on_any",
            ui_properties: {
              position: { x: 100, y: 100 },
              size: { width: 300, height: 80 }
            }
          }
        ],
        edges: []
      };

      const workflow = nodeToolGraphToComfyWorkflow(graph);

      expect(workflow.nodes).toHaveLength(1);
      expect(workflow.nodes[0].type).toBe("LoadCheckpoint");
      expect(workflow.nodes[0].pos).toEqual([100, 100]);
      expect(workflow.nodes[0].size).toEqual([300, 80]);
      expect(workflow.nodes[0].properties.model).toBe("v1-5-pruned.ckpt");
    });

    test("maps named handles to Comfy slot indexes using metadata", () => {
      const graph: Graph = {
        nodes: [
          {
            id: "4",
            type: "comfy.CheckpointLoaderSimple",
            data: {
              _comfy_metadata: {
                outputs: [
                  { name: "MODEL" },
                  { name: "CLIP" },
                  { name: "VAE" }
                ]
              }
            },
            sync_mode: "on_any"
          },
          {
            id: "3",
            type: "comfy.KSampler",
            data: {
              _comfy_metadata: {
                inputs: [
                  { name: "model" },
                  { name: "positive" }
                ]
              }
            },
            sync_mode: "on_any"
          }
        ],
        edges: [
          {
            source: "4",
            target: "3",
            sourceHandle: "MODEL",
            targetHandle: "model"
          }
        ]
      };

      const workflow = nodeToolGraphToComfyWorkflow(graph);
      expect(workflow.links).toHaveLength(1);
      expect(workflow.links[0].origin_slot).toBe(0);
      expect(workflow.links[0].target_slot).toBe(0);
    });
  });

  describe("nodeToolGraphToComfyPrompt", () => {
    test("converts graph to ComfyUI prompt format", () => {
      const graph: Graph = {
        nodes: [
          {
            id: "1",
            type: "comfy.LoadCheckpoint",
            data: { ckpt_name: "v1-5-pruned.ckpt" },
            sync_mode: "on_any"
          },
          {
            id: "2",
            type: "comfy.KSampler",
            data: { steps: 20, cfg: 7.0, seed: 42 },
            sync_mode: "on_any"
          }
        ],
        edges: [
          {
            source: "1",
            target: "2",
            sourceHandle: "output_0",
            targetHandle: "model"  // Use actual input name, not generic input_0
          }
        ]
      };

      const prompt = nodeToolGraphToComfyPrompt(graph);

      expect(prompt["1"]).toBeDefined();
      expect(prompt["1"].class_type).toBe("LoadCheckpoint");
      expect(prompt["1"].inputs.ckpt_name).toBe("v1-5-pruned.ckpt");

      expect(prompt["2"]).toBeDefined();
      expect(prompt["2"].class_type).toBe("KSampler");
      expect(prompt["2"].inputs.steps).toBe(20);
      expect(prompt["2"].inputs.cfg).toBe(7.0);
      
      // Check connected input - ComfyUI uses actual parameter names, not generic handles
      expect(prompt["2"].inputs.model).toEqual(["1", 0]);
    });

    test("skips non-ComfyUI nodes", () => {
      const graph: Graph = {
        nodes: [
          {
            id: "1",
            type: "comfy.LoadCheckpoint",
            data: { ckpt_name: "model.ckpt" },
            sync_mode: "on_any"
          },
          {
            id: "2",
            type: "nodetool.input.StringInput",
            data: { value: "test" },
            sync_mode: "on_any"
          }
        ],
        edges: []
      };

      const prompt = nodeToolGraphToComfyPrompt(graph);

      expect(prompt["1"]).toBeDefined();
      expect(prompt["2"]).toBeUndefined();
    });

    test("filters out internal metadata fields", () => {
      const graph: Graph = {
        nodes: [
          {
            id: "1",
            type: "comfy.TestNode",
            data: {
              normal_prop: "value",
              _comfy_metadata: { original_type: "TestNode" },
              _comfy_widgets: ["widget1"]
            },
            sync_mode: "on_any"
          }
        ],
        edges: []
      };

      const prompt = nodeToolGraphToComfyPrompt(graph);

      expect(prompt["1"].inputs.normal_prop).toBe("value");
      expect(prompt["1"].inputs._comfy_metadata).toBeUndefined();
      expect(prompt["1"].inputs._comfy_widgets).toBeUndefined();
    });
  });

  describe("comfyPromptToNodeToolGraph", () => {
    test("converts Comfy prompt API format to NodeTool graph", () => {
      const prompt = {
        "3": {
          class_type: "KSampler",
          inputs: {
            steps: 20,
            model: ["4", 0]
          }
        },
        "4": {
          class_type: "CheckpointLoaderSimple",
          inputs: {
            ckpt_name: "model.safetensors"
          }
        }
      };

      const graph = comfyPromptToNodeToolGraph(prompt);

      expect(graph.nodes).toHaveLength(2);
      expect(graph.edges).toHaveLength(1);
      expect(graph.nodes[0].type.startsWith("comfy.")).toBe(true);
      expect(graph.edges[0]).toMatchObject({
        source: "4",
        target: "3",
        sourceHandle: "output_0",
        targetHandle: "model"
      });
    });
  });
});
