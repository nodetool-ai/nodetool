/**
 * Workflow Profiler Store
 *
 * Analyzes workflow structure to identify performance bottlenecks,
 * parallelization opportunities, and optimization suggestions.
 *
 * This is an EXPERIMENTAL research feature for analyzing workflow performance.
 */

import { create } from "zustand";
import { Edge, Node } from "@xyflow/react";
import { NodeData } from "./NodeData";
import { topologicalSort } from "../core/graph";

export interface NodePerformanceProfile {
  nodeId: string;
  nodeType: string;
  nodeName: string;
  estimatedRuntime: number;
  complexity: "low" | "medium" | "high";
  bottlenecks: string[];
  parallelizable: boolean;
  suggestions: string[];
}

export interface WorkflowPerformanceProfile {
  workflowId: string;
  totalNodes: number;
  estimatedTotalRuntime: number;
  parallelizableLayers: number;
  criticalPath: string[];
  bottlenecks: NodePerformanceProfile[];
  suggestions: string[];
  nodeProfiles: NodePerformanceProfile[];
  timestamp: number;
}

interface WorkflowProfilerStore {
  profiles: Record<string, WorkflowPerformanceProfile>;
  analyzeWorkflow: (
    workflowId: string,
    nodes: Node<NodeData>[],
    edges: Edge[]
  ) => WorkflowPerformanceProfile;
  getProfile: (workflowId: string) => WorkflowPerformanceProfile | undefined;
  clearProfile: (workflowId: string) => void;
}

const NODE_RUNTIME_ESTIMATES: Record<string, number> = {
  "nodetool.input.StringInput": 10,
  "nodetool.input.IntegerInput": 10,
  "nodetool.input.FloatInput": 10,
  "nodetool.input.BooleanInput": 10,
  "nodetool.input.ImageInput": 50,
  "nodetool.input.AudioInput": 50,
  "nodetool.input.VideoInput": 50,
  "nodetool.input.FileInput": 50,
  "nodetool.input.Folder": 20,
  "nodetool.output.Output": 30,
  "nodetool.output.ImageOutput": 30,
  "nodetool.output.AudioOutput": 30,
  "nodetool.output.TextOutput": 30,
  "nodetool.processing.BaseWorker": 100,
  "nodetool.processing.ClipEmbeddings": 500,
  "nodetool.processing.ImageResize": 200,
  "nodetool.processing.ImageCrop": 200,
  "nodetool.models.HuggingFacePipeline": 2000,
  "nodetool.models.OllamaPipeline": 2000,
  "nodetool.models.OpenAI": 1500,
  "nodetool.models.Anthropic": 1500,
  "nodetool.llm.LLM": 1500,
  "nodetool.llm.ChatModel": 1500,
  "nodetool.text.TextPrompt": 100,
  "nodetool.text.TextTemplate": 50,
  "nodetool.text.TextCombine": 50,
  "nodetool.text.TextSplit": 50,
  "nodetool.control_flow.If": 20,
  "nodetool.control_flow.ForEach": 100,
  "nodetool.control_flow.While": 100,
  "nodetool.control_flow.Map": 100,
  "nodetool.workflows.base_node.Comment": 5,
  "nodetool.workflows.base_node.Input": 10,
  "nodetool.workflows.base_node.Output": 30,
  "nodetool.workflows.base_node.Passthrough": 5,
  "nodetool.workflows.base_node.Variables": 10,
};

const estimateNodeRuntime = (node: Node<NodeData>): number => {
  const nodeType = node.type || "";
  const baseRuntime = NODE_RUNTIME_ESTIMATES[nodeType] || 100;

  const complexityMultipliers: Record<string, number> = {
    input: 1.0,
    output: 1.0,
    processing: 1.5,
    models: 2.5,
    llm: 2.0,
    text: 1.0,
    control_flow: 1.2,
    workflows: 1.0,
  };

  let multiplier = 1.0;
  for (const [prefix, mult] of Object.entries(complexityMultipliers)) {
    if (nodeType.includes(prefix)) {
      multiplier = mult;
      break;
    }
  }

  return Math.round(baseRuntime * multiplier);
};

const getNodeComplexity = (
  _node: Node<NodeData>,
  runtime: number
): "low" | "medium" | "high" => {
  if (runtime < 200) return "low";
  if (runtime < 1000) return "medium";
  return "high";
};

const analyzeNodeBottlenecks = (
  node: Node<NodeData>,
  layer: number,
  totalLayers: number,
  indegree: number
): string[] => {
  const bottlenecks: string[] = [];

  const nodeType = node.type || "";

  if (indegree > 1) {
    bottlenecks.push("Multiple inputs may cause waiting");
  }

  if (nodeType.includes("HuggingFace") || nodeType.includes("OpenAI")) {
    bottlenecks.push("External API call - network latency dependent");
  }

  if (nodeType.includes("llm") || nodeType.includes("LLM")) {
    bottlenecks.push("LLM inference is typically the slowest operation");
  }

  if (nodeType.includes("Image") || nodeType.includes("Video")) {
    bottlenecks.push("Large data processing - memory intensive");
  }

  if (layer < totalLayers / 3) {
    bottlenecks.push("Early layer node - may block downstream processing");
  }

  return bottlenecks;
};

const generateNodeSuggestions = (
  node: Node<NodeData>,
  profile: Omit<NodePerformanceProfile, "suggestions">
): string[] => {
  const suggestions: string[] = [];
  const nodeType = node.type || "";

  if (profile.complexity === "high") {
    suggestions.push("Consider caching results if this node is called multiple times");
  }

  if (nodeType.includes("HuggingFace")) {
    suggestions.push("Consider using a smaller model for faster iterations");
  }

  if (nodeType.includes("OpenAI") || nodeType.includes("Anthropic")) {
    suggestions.push("Consider batching requests to reduce API overhead");
    suggestions.push("Set appropriate max_tokens to avoid unnecessary generation");
  }

  if (profile.parallelizable && profile.estimatedRuntime > 100) {
    suggestions.push("This node can run in parallel with others in its layer");
  }

  if (nodeType.includes("control_flow")) {
    suggestions.push("Consider breaking complex conditions into simpler steps");
  }

  return suggestions;
};

const useWorkflowProfilerStore = create<WorkflowProfilerStore>((set, get) => ({
  profiles: {},

  analyzeWorkflow: (
    workflowId: string,
    nodes: Node<NodeData>[],
    edges: Edge[]
  ): WorkflowPerformanceProfile => {
    if (nodes.length === 0) {
      const emptyProfile: WorkflowPerformanceProfile = {
        workflowId,
        totalNodes: 0,
        estimatedTotalRuntime: 0,
        parallelizableLayers: 0,
        criticalPath: [],
        bottlenecks: [],
        suggestions: [],
        nodeProfiles: [],
        timestamp: Date.now(),
      };
      set((state) => ({
        profiles: { ...state.profiles, [workflowId]: emptyProfile },
      }));
      return emptyProfile;
    }

    const layers = topologicalSort(edges, nodes);
    const totalLayers = layers.length;

    const indegree: Record<string, number> = {};
    nodes.forEach((node) => {
      indegree[node.id] = 0;
    });
    edges.forEach((edge) => {
      indegree[edge.target]++;
    });

    let estimatedTotalRuntime = 0;
    const nodeProfiles: NodePerformanceProfile[] = [];
    const bottleneckNodes: NodePerformanceProfile[] = [];

    const layerRuntime: number[] = layers.map((layer) => {
      return Math.max(
        ...layer.map((nodeId) => {
          const node = nodes.find((n) => n.id === nodeId);
          if (!node) return 0;
          const runtime = estimateNodeRuntime(node);
          estimatedTotalRuntime = Math.max(
            estimatedTotalRuntime,
            estimatedTotalRuntime
          );
          return runtime;
        })
      );
    });

    estimatedTotalRuntime = layerRuntime.reduce((sum, r) => sum + r, 0);

    layers.forEach((layer, layerIndex) => {
      layer.forEach((nodeId) => {
        const node = nodes.find((n) => n.id === nodeId);
        if (!node) return;

        const estimatedRuntime = estimateNodeRuntime(node);
        const complexity = getNodeComplexity(node, estimatedRuntime);
        const bottlenecks = analyzeNodeBottlenecks(
          node,
          layerIndex,
          totalLayers,
          indegree[nodeId]
        );

        const isParallelizable = layer.length > 1;

        const partialProfile: Omit<NodePerformanceProfile, "suggestions"> = {
          nodeId,
          nodeType: node.type || "unknown",
          nodeName:
            (node.data as Record<string, unknown>)?.title?.toString() ||
            node.id,
          estimatedRuntime,
          complexity,
          bottlenecks,
          parallelizable: isParallelizable,
        };

        const suggestions = generateNodeSuggestions(node, partialProfile);

        const profile: NodePerformanceProfile = {
          ...partialProfile,
          suggestions,
        };

        nodeProfiles.push(profile);

        if (complexity === "high" || bottlenecks.length > 0) {
          bottleneckNodes.push(profile);
        }
      });
    });

    const criticalPath = layers.reduce<string[]>((path, layer) => {
      const maxRuntimeNode = layer.reduce<string | null>((maxNode, nodeId) => {
        const node = nodes.find((n) => n.id === nodeId);
        if (!node) return maxNode;
        const runtime = estimateNodeRuntime(node);
        const maxRuntime = maxNode
          ? estimateNodeRuntime(
              nodes.find((n) => n.id === maxNode) as Node<NodeData>
            )
          : 0;
        return runtime > maxRuntime ? nodeId : maxNode;
      }, null);
      if (maxRuntimeNode) path.push(maxRuntimeNode);
      return path;
    }, []);

    const workflowSuggestions: string[] = [];

    if (layers.length > 3) {
      workflowSuggestions.push(
        "Consider breaking this workflow into smaller, reusable sub-workflows"
      );
    }

    const parallelizableLayers = layers.filter(
      (layer) => layer.length > 1
    ).length;
    if (parallelizableLayers > 0) {
      workflowSuggestions.push(
        `${parallelizableLayers} layer(s) can be parallelized for faster execution`
      );
    }

    const llmNodes = nodeProfiles.filter((p) =>
      p.nodeType.toLowerCase().includes("llm")
    );
    if (llmNodes.length > 1) {
      workflowSuggestions.push(
        "Multiple LLM nodes detected - consider if some can be combined or cached"
      );
    }

    const apiNodes = nodeProfiles.filter(
      (p) =>
        p.nodeType.includes("HuggingFace") ||
        p.nodeType.includes("OpenAI") ||
        p.nodeType.includes("Anthropic")
    );
    if (apiNodes.length > 2) {
      workflowSuggestions.push(
        "Multiple API calls detected - consider batching or using local models for cost savings"
      );
    }

    const profile: WorkflowPerformanceProfile = {
      workflowId,
      totalNodes: nodes.length,
      estimatedTotalRuntime,
      parallelizableLayers,
      criticalPath,
      bottlenecks: bottleneckNodes,
      suggestions: workflowSuggestions,
      nodeProfiles,
      timestamp: Date.now(),
    };

    set((state) => ({
      profiles: { ...state.profiles, [workflowId]: profile },
    }));

    return profile;
  },

  getProfile: (workflowId: string) => {
    return get().profiles[workflowId];
  },

  clearProfile: (workflowId: string) => {
    set((state) => {
      const newProfiles = { ...state.profiles };
      delete newProfiles[workflowId];
      return { profiles: newProfiles };
    });
  },
}));

export default useWorkflowProfilerStore;
