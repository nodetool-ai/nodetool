import { useCallback, useMemo } from "react";
import { useReactFlow, XYPosition, Node } from "@xyflow/react";
import { useNodes } from "../../contexts/NodeContext";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { useQuery } from "@tanstack/react-query";
import Fuse from "fuse.js";
import { Workflow } from "../../stores/ApiTypes";
import { NodeData } from "../../stores/NodeData";

interface NodeSearchItem {
  id: string;
  label: string;
  type: string;
  position: { x: number; y: number };
}

interface WorkflowSearchItem {
  id: string;
  name: string;
  updatedAt: string;
}

interface RecentItem {
  id: string;
  type: "node" | "workflow";
  name: string;
  timestamp: number;
}

interface UseWorkflowSearchReturn {
  searchNodes: (query: string) => NodeSearchItem[];
  searchWorkflows: (query: string) => WorkflowSearchItem[];
  recentItems: RecentItem[];
  addToRecent: (item: Omit<RecentItem, "timestamp">) => void;
  focusNode: (nodeId: string) => void;
  navigateToWorkflow: (workflowId: string) => void;
}

const RECENT_ITEMS_KEY = "nodetool_command_recent_items";
const MAX_RECENT_ITEMS = 10;

export function useWorkflowSearch(): UseWorkflowSearchReturn {
  const reactFlowInstance = useReactFlow();
  const { nodes } = useNodes(
    (state) => ({
      nodes: state.nodes
    })
  );
  const { load } = useWorkflowManager();

  const recentItems = useMemo<RecentItem[]>(() => {
    if (typeof window === "undefined") {return [];}
    try {
      const stored = localStorage.getItem(RECENT_ITEMS_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch {
      console.warn("Failed to load recent items from localStorage");
    }
    return [];
  }, []);

  const addToRecent = useCallback(
    (item: Omit<RecentItem, "timestamp">) => {
      try {
        const newItem: RecentItem = { ...item, timestamp: Date.now() };
        const filtered = recentItems.filter(
          (i) => !(i.type === item.type && i.id === item.id)
        );
        const updated = [newItem, ...filtered].slice(0, MAX_RECENT_ITEMS);
        localStorage.setItem(RECENT_ITEMS_KEY, JSON.stringify(updated));
      } catch {
        console.warn("Failed to save recent items to localStorage");
      }
    },
    [recentItems]
  );

  const nodeSearchIndex = useMemo(() => {
    const items: NodeSearchItem[] = nodes.map((node) => ({
      id: node.id,
      label:
        (node.data as Record<string, unknown>).label?.toString() ||
        node.type ||
        "Untitled",
      type: node.type || "unknown",
      position: node.position
    }));
    return new Fuse<NodeSearchItem>(items, {
      keys: ["label", "type", "id"],
      threshold: 0.4,
      includeScore: true
    });
  }, [nodes]);

  const searchNodes = useCallback(
    (query: string): NodeSearchItem[] => {
      if (!query.trim()) {
        return nodes.slice(0, 20).map((node) => ({
          id: node.id,
          label:
            (node.data as Record<string, unknown>).label?.toString() ||
            node.type ||
            "Untitled",
          type: node.type || "unknown",
          position: node.position
        }));
      }
      return nodeSearchIndex
        .search(query)
        .slice(0, 20)
        .map((result) => result.item);
    },
    [nodes, nodeSearchIndex]
  );

  const { data: workflowsData } = useQuery({
    queryKey: ["workflows"],
    queryFn: async () => {
      const response = await fetch("/api/workflows/");
      if (!response.ok) {
        throw new Error("Failed to fetch workflows");
      }
      return response.json();
    },
    staleTime: 30000
  });

  const workflowSearchIndex = useMemo(() => {
    if (!workflowsData?.workflows) {
      return null;
    }
    return new Fuse<Workflow>(workflowsData.workflows, {
      keys: ["name", "id"],
      threshold: 0.4
    });
  }, [workflowsData]);

  const searchWorkflows = useCallback(
    (query: string): WorkflowSearchItem[] => {
      if (!workflowsData?.workflows) {
        return [];
      }
      if (!query.trim()) {
        return workflowsData.workflows.slice(0, 20).map((w: Workflow) => ({
          id: w.id,
          name: w.name,
          updatedAt: w.updated_at || ""
        }));
      }
      if (!workflowSearchIndex) {
        return [];
      }
      return workflowSearchIndex
        .search(query)
        .slice(0, 20)
        .map((result) => ({
          id: result.item.id,
          name: result.item.name,
          updatedAt: result.item.updated_at || ""
        }));
    },
    [workflowsData, workflowSearchIndex]
  );

  const focusNode = useCallback(
    (nodeId: string) => {
      const node = nodes.find((n) => n.id === nodeId);
      if (node) {
        const nodeWidth = node.measured?.width || 280;
        const nodeHeight = node.measured?.height || 100;
        const bounds = {
          x: node.position.x - 50,
          y: node.position.y - 50,
          width: nodeWidth + 100,
          height: nodeHeight + 100
        };
        reactFlowInstance.fitBounds(bounds, { duration: 300 });
      }
    },
    [nodes, reactFlowInstance]
  );

  const navigateToWorkflow = useCallback(
    async (workflowId: string) => {
      await load(workflowId);
    },
    [load]
  );

  return {
    searchNodes,
    searchWorkflows,
    recentItems,
    addToRecent,
    focusNode,
    navigateToWorkflow
  };
}
