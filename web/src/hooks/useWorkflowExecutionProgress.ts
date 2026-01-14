import { useMemo, useState, useEffect, useRef } from "react";
import useStatusStore, { hashKey } from "../stores/StatusStore";
import { useNodes } from "../contexts/NodeContext";

export type NodeExecutionStatus = "pending" | "running" | "completed" | "error";

export interface ExecutionProgress {
  total: number;
  completed: number;
  running: number;
  pending: number;
  error: number;
  progressPercent: number;
  elapsedMs: number;
}

export const useWorkflowExecutionProgress = (
  workflowId: string,
  isExecuting: boolean
): ExecutionProgress => {
  const nodes = useNodes((state) => state.nodes);
  const statuses = useStatusStore((state) => state.statuses);
  const [elapsedMs, setElapsedMs] = useState(0);
  const startTimeRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isExecuting) {
      if (startTimeRef.current === null) {
        startTimeRef.current = Date.now();
      }
      intervalRef.current = setInterval(() => {
        if (startTimeRef.current !== null) {
          setElapsedMs(Date.now() - startTimeRef.current);
        }
      }, 100);
    } else {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      startTimeRef.current = null;
      setElapsedMs(0);
    }

    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isExecuting]);

  const progress = useMemo(() => {
    const executableNodes = nodes.filter(
      (node) =>
        node.type !== "nodetool.workflows.base_node.Comment" &&
        node.type !== "nodetool.workflows.base_node.Preview"
    );

    let completed = 0;
    let running = 0;
    let error = 0;
    let pending = 0;

    for (const node of executableNodes) {
      const key = hashKey(workflowId, node.id);
      const status = statuses[key];

      if (status === "completed") {
        completed++;
      } else if (
        status === "running" ||
        status === "starting" ||
        status === "booting"
      ) {
        running++;
      } else if (status === "error" || status === "failed") {
        error++;
      } else {
        pending++;
      }
    }

    const total = executableNodes.length;
    const progressPercent =
      total > 0 ? Math.round(((completed + error) / total) * 100) : 0;

    return {
      total,
      completed,
      running,
      pending,
      error,
      progressPercent,
      elapsedMs
    };
  }, [nodes, statuses, workflowId, elapsedMs]);

  return progress;
};

export const formatElapsedTime = (ms: number): string => {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
};
