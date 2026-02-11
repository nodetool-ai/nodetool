/**
 * useWorkflowHealth provides convenient access to workflow health metrics.
 *
 * This hook wraps the WorkflowHealthStore and provides formatted,
 * easy-to-use health data for components.
 *
 * @example
 * ```typescript
 * import useWorkflowHealth from './useWorkflowHealth';
 *
 * function HealthDisplay({ workflowId }: { workflowId: string }) {
 *   const { health, formatScore, formatRate } = useWorkflowHealth(workflowId);
 *
 *   if (!health) return <p>No data yet</p>;
 *
 *   return (
 *     <div>
 *       <h2>Health Score: {formatScore(health.score)}</h2>
 *       <p>Success Rate: {formatRate(health.successRate)}</p>
 *     </div>
 *   );
 * }
 * ```
 */

import { useMemo } from "react";
import useWorkflowHealthStore, { type WorkflowHealth } from "../stores/WorkflowHealthStore";

interface UseWorkflowHealthReturn {
  health: WorkflowHealth | undefined;
  hasData: boolean;
  healthColor: "success" | "warning" | "error" | "default";
  formatScore: (score: number) => string;
  formatRate: (rate: number) => string;
  formatDuration: (ms: number) => string;
  getRecommendationsByType: (type: WorkflowHealth["recommendations"][number]["type"]) => WorkflowHealth["recommendations"];
}

/**
 * Custom hook for accessing workflow health metrics
 *
 * @param workflowId - The ID of the workflow to get health data for
 * @returns Workflow health data and utility functions
 */
const useWorkflowHealth = (workflowId: string): UseWorkflowHealthReturn => {
  const health = useWorkflowHealthStore((state) => state.getWorkflowHealth(workflowId));

  /**
   * Determine if we have meaningful health data
   */
  const hasData = useMemo(() => {
    return health !== undefined && health.totalExecutions > 0;
  }, [health]);

  /**
   * Determine health color based on score
   */
  const healthColor = useMemo(() => {
    if (!health) {
      return "default";
    }
    if (health.score >= 80) {
      return "success";
    }
    if (health.score >= 50) {
      return "warning";
    }
    return "error";
  }, [health]);

  /**
   * Format health score as a percentage
   */
  const formatScore = useMemo(
    () => (score: number): string => {
      return `${Math.round(score)}%`;
    },
    []
  );

  /**
   * Format rate as a percentage
   */
  const formatRate = useMemo(
    () => (rate: number): string => {
      return `${Math.round(rate * 100)}%`;
    },
    []
  );

  /**
   * Format duration in human-readable format
   */
  const formatDuration = useMemo(
    () => (ms: number): string => {
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
    },
    []
  );

  /**
   * Get recommendations filtered by type
   */
  const getRecommendationsByType = useMemo(
    () => (type: WorkflowHealth["recommendations"][number]["type"]) => {
      if (!health) {
        return [];
      }
      return health.recommendations.filter((rec) => rec.type === type);
    },
    [health]
  );

  return {
    health,
    hasData,
    healthColor,
    formatScore,
    formatRate,
    formatDuration,
    getRecommendationsByType,
  };
};

export default useWorkflowHealth;
