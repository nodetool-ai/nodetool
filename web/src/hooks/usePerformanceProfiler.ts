import { useMemo, useCallback } from "react";
import useExecutionTimeStore from "../stores/ExecutionTimeStore";
import useStatusStore from "../stores/StatusStore";
import { useNodes } from "../contexts/NodeContext";
import type { Node } from "@xyflow/react";

export interface NodePerformanceData {
  nodeId: string;
  nodeType: string;
  nodeLabel: string;
  duration: number | undefined;
  startTime: number | undefined;
  endTime: number | undefined;
  status: string;
  isRunning: boolean;
  isComplete: boolean;
  isError: boolean;
}

export interface PerformanceSummary {
  totalNodes: number;
  completedNodes: number;
  errorNodes: number;
  runningNodes: number;
  pendingNodes: number;
  totalDuration: number;
  parallelDuration: number;
  bottleneckNode: NodePerformanceData | null;
  fastestNode: NodePerformanceData | null;
  averageDuration: number;
  completionPercentage: number;
}

export interface TimelineEvent {
  nodeId: string;
  nodeLabel: string;
  nodeType: string;
  startTime: number;
  endTime: number | undefined;
  duration: number | undefined;
  status: string;
  rowIndex: number;
}

export interface PerformanceProfilerOptions {
  workflowId: string;
  enabled?: boolean;
}

const formatDuration = (ms: number): string => {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) {
    const remainderMs = ms % 1000;
    if (remainderMs === 0) {
      return `${seconds}s`;
    }
    return `${seconds}s ${remainderMs}ms`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainderSeconds = seconds % 60;
  if (remainderSeconds === 0) {
    return `${minutes}m`;
  }
  return `${minutes}m ${remainderSeconds}s`;
};

const getDurationColor = (
  duration: number | undefined,
  maxDuration: number
): string => {
  if (duration === undefined || maxDuration === 0) {
    return "transparent";
  }

  const ratio = duration / maxDuration;

  if (ratio < 0.25) {return "rgba(76, 175, 80, 0.15)";}
  if (ratio < 0.5) {return "rgba(255, 193, 7, 0.2)";}
  if (ratio < 0.75) {return "rgba(255, 152, 0, 0.25)";}
  return "rgba(244, 67, 54, 0.3)";
};

const extractStatusString = (statusValue: unknown): string => {
  if (typeof statusValue === "string") {
    return statusValue;
  }
  if (statusValue && typeof statusValue === "object" && "status" in statusValue) {
    const nested = (statusValue as { status: unknown }).status;
    if (typeof nested === "string") {
      return nested;
    }
  }
  return "pending";
};

const usePerformanceProfiler = (options: PerformanceProfilerOptions) => {
  const { workflowId, enabled = true } = options;

  const nodes = useNodes(
    useCallback((state: { nodes: Node[] }) => state.nodes, [])
  );

  const statuses = useStatusStore(
    useCallback(
      (state: { statuses: Record<string, unknown> }) =>
        state.statuses || {},
      []
    )
  );

  const getDuration = useExecutionTimeStore(
    useCallback(
      (state: {
        getDuration: (workflowId: string, nodeId: string) => number | undefined;
      }) => state.getDuration,
      []
    )
  );

  const getTiming = useExecutionTimeStore(
    useCallback(
      (state: {
        getTiming: (workflowId: string, nodeId: string) => { startTime: number; endTime?: number } | undefined;
      }) => state.getTiming,
      []
    )
  );

  const nodePerformanceData = useMemo((): NodePerformanceData[] => {
    if (!enabled || !nodes.length) {
      return [];
    }

    return nodes.map((node: Node) => {
      const duration = getDuration(workflowId, node.id);
      const timing = getTiming(workflowId, node.id);
      const statusKey = `${workflowId}:${node.id}`;
      const statusValue = statuses[statusKey];
      const status = extractStatusString(statusValue);

      return {
        nodeId: node.id,
        nodeType: node.type || "unknown",
        nodeLabel: (node.data?.label as string) || node.type || "unknown",
        duration,
        startTime: timing?.startTime,
        endTime: timing?.endTime,
        status,
        isRunning: status === "running",
        isComplete: status === "completed",
        isError: status === "error"
      };
    });
  }, [nodes, statuses, workflowId, enabled, getDuration, getTiming]);

  const maxDuration = useMemo((): number => {
    return Math.max(
      0,
      ...nodePerformanceData
        .filter((n: NodePerformanceData) => n.duration !== undefined)
        .map((n: NodePerformanceData) => n.duration as number)
    );
  }, [nodePerformanceData]);

  const summary = useMemo((): PerformanceSummary => {
    const completed = nodePerformanceData.filter((n: NodePerformanceData) => n.isComplete);
    const errors = nodePerformanceData.filter((n: NodePerformanceData) => n.isError);
    const running = nodePerformanceData.filter((n: NodePerformanceData) => n.isRunning);
    const pending = nodePerformanceData.filter(
      (n: NodePerformanceData) => !n.isComplete && !n.isError && !n.isRunning
    );

    const durations = completed.map((n: NodePerformanceData) => n.duration as number);
    const totalDuration = durations.reduce((sum: number, d: number) => sum + d, 0);
    const averageDuration = durations.length > 0 ? totalDuration / durations.length : 0;

    const sortedByDuration = [...completed].sort(
      (a: NodePerformanceData, b: NodePerformanceData) => (b.duration || 0) - (a.duration || 0)
    );

    const completedWithTimes = nodePerformanceData.filter(
      (n: NodePerformanceData) => n.startTime !== undefined
    );
    let parallelDuration = 0;

    if (completedWithTimes.length > 0) {
      const allStarts = completedWithTimes.map((n: NodePerformanceData) => n.startTime as number);
      const allEnds = completedWithTimes
        .filter((n: NodePerformanceData) => n.endTime !== undefined)
        .map((n: NodePerformanceData) => n.endTime as number);

      const minStart = Math.min(...allStarts);
      const maxEnd = allEnds.length > 0 ? Math.max(...allEnds) : minStart;

      parallelDuration = maxEnd - minStart;
    }

    return {
      totalNodes: nodePerformanceData.length,
      completedNodes: completed.length,
      errorNodes: errors.length,
      runningNodes: running.length,
      pendingNodes: pending.length,
      totalDuration,
      parallelDuration,
      bottleneckNode: sortedByDuration[0] || null,
      fastestNode: sortedByDuration[sortedByDuration.length - 1] || null,
      averageDuration,
      completionPercentage:
        nodePerformanceData.length > 0
          ? (completed.length / nodePerformanceData.length) * 100
          : 0
    };
  }, [nodePerformanceData]);

  const timeline = useMemo((): TimelineEvent[] => {
    if (!enabled) {
      return [];
    }

    const eventsWithTimes = nodePerformanceData
      .filter((n: NodePerformanceData) => n.startTime !== undefined)
      .map((n: NodePerformanceData) => ({
        nodeId: n.nodeId,
        nodeLabel: n.nodeLabel,
        nodeType: n.nodeType,
        startTime: n.startTime as number,
        endTime: n.endTime,
        duration: n.duration,
        status: n.status,
        rowIndex: 0
      }));

    if (eventsWithTimes.length === 0) {
      return [];
    }

    const sortedByStart = [...eventsWithTimes].sort(
      (a: TimelineEvent, b: TimelineEvent) => (a.startTime || 0) - (b.startTime || 0)
    );

    const usedRows: number[] = [];
    const assignRow = (event: TimelineEvent): number => {
      for (let i = 0; i <= usedRows.length; i++) {
        const row = i;
        const hasOverlap = eventsWithTimes.some(
          (e: TimelineEvent) =>
            e.rowIndex === row &&
            e.startTime !== undefined &&
            event.startTime !== undefined &&
            e.startTime < (event.endTime || event.startTime) &&
            (e.endTime || e.startTime) > event.startTime
        );
        if (!hasOverlap) {
          return row;
        }
      }
      return usedRows.length;
    };

    sortedByStart.forEach((event: TimelineEvent) => {
      event.rowIndex = assignRow(event);
      if (event.rowIndex >= usedRows.length) {
        usedRows.push(event.rowIndex);
      }
    });

    return sortedByStart;
  }, [nodePerformanceData, enabled]);

  const getNodeHeatmapColor = useCallback(
    (nodeId: string): string => {
      const nodeData = nodePerformanceData.find((n: NodePerformanceData) => n.nodeId === nodeId);
      if (!nodeData || nodeData.duration === undefined) {
        return "transparent";
      }
      return getDurationColor(nodeData.duration, maxDuration);
    },
    [nodePerformanceData, maxDuration]
  );

  const isNodeBottleneck = useCallback(
    (nodeId: string): boolean => {
      const nodeData = nodePerformanceData.find((n: NodePerformanceData) => n.nodeId === nodeId);
      return (
        nodeData !== undefined &&
        summary.bottleneckNode !== null &&
        nodeData.nodeId === summary.bottleneckNode.nodeId
      );
    },
    [nodePerformanceData, summary.bottleneckNode]
  );

  return {
    nodePerformanceData,
    maxDuration,
    summary,
    timeline,
    formatDuration,
    getNodeHeatmapColor,
    isNodeBottleneck
  };
};

export default usePerformanceProfiler;
