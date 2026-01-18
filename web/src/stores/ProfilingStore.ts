import { create } from "zustand";
import { Edge, Node } from "@xyflow/react";
import { NodeData } from "./NodeData";
import useMetadataStore from "./MetadataStore";
import { topologicalSort } from "../core/graph";

export interface NodeExecutionProfile {
  nodeId: string;
  nodeName: string;
  nodeType: string;
  startTime: number;
  endTime: number;
  duration: number;
  status: "completed" | "error" | "cancelled";
  layer: number;
  parallelWith: string[];
  blockedBy: string[];
  isBottleneck: boolean;
}

export interface WorkflowProfile {
  workflowId: string;
  workflowName: string;
  jobId: string;
  startedAt: number;
  finishedAt: number;
  totalDuration: number;
  nodeCount: number;
  nodes: Record<string, NodeExecutionProfile>;
  layers: string[][];
  criticalPath: string[];
  parallelizationEfficiency: number;
  bottleneckNodes: string[];
}

interface ProfilingStore {
  profiles: Record<string, WorkflowProfile>;
  currentProfile: WorkflowProfile | null;
  isProfiling: boolean;

  startProfiling: (workflowId: string, workflowName: string, nodes: Node<NodeData>[], edges: Edge[]) => void;
  recordNodeStart: (workflowId: string, nodeId: string, nodeName: string, nodeType: string) => void;
  recordNodeEnd: (workflowId: string, nodeId: string, status: "completed" | "error" | "cancelled") => void;
  finishProfiling: (workflowId: string, jobId: string) => void;
  cancelProfiling: (workflowId: string) => void;
  getProfile: (workflowId: string) => WorkflowProfile | undefined;
  getCurrentProfile: () => WorkflowProfile | null;
  clearProfile: (workflowId: string) => void;
  clearAllProfiles: () => void;
}

const useProfilingStore = create<ProfilingStore>((set, get) => ({
  profiles: {},
  currentProfile: null,
  isProfiling: false,

  startProfiling: (workflowId: string, workflowName: string, nodes: Node<NodeData>[], edges: Edge[]) => {
    const layers = topologicalSort(edges, nodes);
    const startTime = Date.now();
    const getMetadata = useMetadataStore.getState().getMetadata;

    const profile: WorkflowProfile = {
      workflowId,
      workflowName,
      jobId: "",
      startedAt: startTime,
      finishedAt: 0,
      totalDuration: 0,
      nodeCount: nodes.length,
      nodes: {},
      layers,
      criticalPath: [],
      parallelizationEfficiency: 0,
      bottleneckNodes: []
    };

    nodes.forEach(node => {
      const layerIndex = layers.findIndex(layer => layer.includes(node.id));
      const blockedBy: string[] = [];
      edges.forEach(edge => {
        if (edge.target === node.id) {
          blockedBy.push(edge.source);
        }
      });

      const nodeType = node.type || "unknown";
      const metadata = getMetadata(nodeType);
      const nodeName = metadata?.title || nodeType.split(".").pop() || node.id;

      profile.nodes[node.id] = {
        nodeId: node.id,
        nodeName,
        nodeType,
        startTime: 0,
        endTime: 0,
        duration: 0,
        status: "completed",
        layer: layerIndex >= 0 ? layerIndex : 0,
        parallelWith: [],
        blockedBy,
        isBottleneck: false
      };
    });

    layers.forEach((layer, layerIndex) => {
      layer.forEach(nodeId => {
        if (profile.nodes[nodeId]) {
          profile.nodes[nodeId].parallelWith = layer.filter(n => n !== nodeId);
        }
      });
    });

    set({
      profiles: { ...get().profiles, [workflowId]: profile },
      currentProfile: profile,
      isProfiling: true
    });
  },

  recordNodeStart: (workflowId: string, nodeId: string, nodeName: string, nodeType: string) => {
    const profile = get().profiles[workflowId];
    if (profile && profile.nodes[nodeId]) {
      profile.nodes[nodeId] = {
        ...profile.nodes[nodeId],
        nodeName,
        nodeType,
        startTime: Date.now()
      };
      set({ profiles: { ...get().profiles, [workflowId]: profile } });
    }
  },

  recordNodeEnd: (workflowId: string, nodeId: string, status: "completed" | "error" | "cancelled") => {
    const profile = get().profiles[workflowId];
    if (profile && profile.nodes[nodeId]) {
      const endTime = Date.now();
      const node = profile.nodes[nodeId];
      const duration = node.startTime ? endTime - node.startTime : 0;

      profile.nodes[nodeId] = {
        ...node,
        endTime,
        duration,
        status
      };

      set({ profiles: { ...get().profiles, [workflowId]: profile } });
    }
  },

  finishProfiling: (workflowId: string, jobId: string) => {
    const profile = get().profiles[workflowId];
    if (profile) {
      const finishedAt = Date.now();
      profile.jobId = jobId;
      profile.finishedAt = finishedAt;
      profile.totalDuration = finishedAt - profile.startedAt;

      const completedNodes = Object.values(profile.nodes).filter(
        n => n.status === "completed" || n.status === "error"
      );

      if (completedNodes.length > 0) {
        const totalNodeTime = completedNodes.reduce((sum, n) => sum + n.duration, 0);
        profile.parallelizationEfficiency = totalNodeTime > 0
          ? Math.min(1, totalNodeTime / profile.totalDuration)
          : 0;
      }

      const threshold = profile.totalDuration * 0.1;
      profile.bottleneckNodes = Object.values(profile.nodes)
        .filter(n => n.duration > threshold)
        .map(n => n.nodeId);

      Object.values(profile.nodes).forEach(node => {
        node.isBottleneck = profile.bottleneckNodes.includes(node.nodeId);
      });

      let maxEndTime = 0;
      let currentPath: string[] = [];
      const nodesByLayer = profile.layers.flat();

      for (let i = nodesByLayer.length - 1; i >= 0; i--) {
        const nodeId = nodesByLayer[i];
        const node = profile.nodes[nodeId];
        if (node.endTime > maxEndTime) {
          maxEndTime = node.endTime;
          currentPath = [nodeId];
        } else if (node.endTime === maxEndTime && node.startTime > 0) {
          currentPath.unshift(nodeId);
        }
      }
      profile.criticalPath = currentPath;

      set({
        profiles: { ...get().profiles, [workflowId]: profile },
        currentProfile: profile,
        isProfiling: false
      });
    }
  },

  cancelProfiling: (workflowId: string) => {
    const profile = get().profiles[workflowId];
    if (profile) {
      const finishedAt = Date.now();
      profile.finishedAt = finishedAt;
      profile.totalDuration = finishedAt - profile.startedAt;
      set({ profiles: { ...get().profiles, [workflowId]: profile }, isProfiling: false });
    }
  },

  getProfile: (workflowId: string) => get().profiles[workflowId],

  getCurrentProfile: () => get().currentProfile,

  clearProfile: (workflowId: string) => {
    const profiles = { ...get().profiles };
    delete profiles[workflowId];
    set({ profiles, currentProfile: get().currentProfile?.workflowId === workflowId ? null : get().currentProfile });
  },

  clearAllProfiles: () => set({ profiles: {}, currentProfile: null, isProfiling: false })
}));

export default useProfilingStore;
