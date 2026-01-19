/**
 * Version Analytics Utility
 *
 * Computes analytics and metrics from workflow version history
 * to provide insights into workflow evolution patterns.
 */

import { WorkflowVersion, Graph } from "../stores/ApiTypes";
import { computeGraphDiff } from "./graphDiff";

export interface VersionMetrics {
  version: number;
  nodeCount: number;
  edgeCount: number;
  complexity: number;
  timestamp: number;
  saveType: string;
}

export interface WorkflowEvolutionMetrics {
  totalVersions: number;
  totalEdits: number;
  averageNodesPerVersion: number;
  nodeGrowthRate: number;
  edgeGrowthRate: number;
  complexityGrowthRate: number;
  mostProductiveDay: string;
  saveTypeDistribution: Record<string, number>;
  versionSpan: number;
}

export interface EditPattern {
  dayOfWeek: number;
  hourOfDay: number;
  editCount: number;
}

export interface NodeTypeChange {
  type: string;
  addedCount: number;
  removedCount: number;
  modifiedCount: number;
}

export interface VersionAnalytics {
  metrics: VersionMetrics[];
  evolution: WorkflowEvolutionMetrics;
  editPatterns: EditPattern[];
  nodeTypeChanges: NodeTypeChange[];
  peakComplexityVersion: VersionMetrics | null;
  mostChangedVersion: VersionMetrics | null;
}

/**
 * Extract node type from node object
 */
const getNodeType = (node: { type?: string }): string => {
  return node.type?.split(".").pop() || "unknown";
};

/**
 * Compute metrics for a single version
 */
export const computeVersionMetrics = (
  version: WorkflowVersion
): VersionMetrics => {
  const nodeCount = version.graph.nodes?.length || 0;
  const edgeCount = version.graph.edges?.length || 0;

  const complexity = nodeCount + edgeCount * 2;

  return {
    version: version.version,
    nodeCount,
    edgeCount,
    complexity,
    timestamp: new Date(version.created_at).getTime(),
    saveType: version.save_type || "unknown"
  };
};

/**
 * Compute workflow evolution metrics from a series of versions
 */
export const computeEvolutionMetrics = (
  metrics: VersionMetrics[]
): WorkflowEvolutionMetrics => {
  if (metrics.length === 0) {
    return {
      totalVersions: 0,
      totalEdits: 0,
      averageNodesPerVersion: 0,
      nodeGrowthRate: 0,
      edgeGrowthRate: 0,
      complexityGrowthRate: 0,
      mostProductiveDay: "N/A",
      saveTypeDistribution: {},
      versionSpan: 0
    };
  }

  const sortedMetrics = [...metrics].sort((a, b) => a.version - b.version);

  const firstMetric = sortedMetrics[0];
  const lastMetric = sortedMetrics[sortedMetrics.length - 1];

  const versionCount = sortedMetrics.length;
  const totalNodes = sortedMetrics.reduce((sum, m) => sum + m.nodeCount, 0);
  const averageNodes = totalNodes / versionCount;

  const nodeGrowthRate = firstMetric.nodeCount > 0
    ? ((lastMetric.nodeCount - firstMetric.nodeCount) / firstMetric.nodeCount) * 100
    : 0;

  const edgeGrowthRate = firstMetric.edgeCount > 0
    ? ((lastMetric.edgeCount - firstMetric.edgeCount) / firstMetric.edgeCount) * 100
    : 0;

  const complexityGrowthRate = firstMetric.complexity > 0
    ? ((lastMetric.complexity - firstMetric.complexity) / firstMetric.complexity) * 100
    : 0;

  const versionSpan = lastMetric.timestamp - firstMetric.timestamp;

  const saveTypeDistribution: Record<string, number> = {};
  sortedMetrics.forEach(m => {
    saveTypeDistribution[m.saveType] = (saveTypeDistribution[m.saveType] || 0) + 1;
  });

  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const dayCounts: Record<number, number> = {};
  sortedMetrics.forEach(m => {
    const day = new Date(m.timestamp).getDay();
    dayCounts[day] = (dayCounts[day] || 0) + 1;
  });
  const mostProductiveDay = Object.entries(dayCounts)
    .sort((a, b) => b[1] - a[1])[0]?.[1] > 0
      ? dayNames[parseInt(Object.entries(dayCounts).sort((a, b) => b[1] - a[1])[0][0])]
      : "N/A";

  return {
    totalVersions: versionCount,
    totalEdits: versionCount - 1,
    averageNodesPerVersion: averageNodes,
    nodeGrowthRate,
    edgeGrowthRate,
    complexityGrowthRate,
    mostProductiveDay,
    saveTypeDistribution,
    versionSpan
  };
};

/**
 * Compute edit patterns (when edits happen)
 */
export const computeEditPatterns = (metrics: VersionMetrics[]): EditPattern[] => {
  const patterns: Record<string, EditPattern> = {};

  metrics.forEach(m => {
    const date = new Date(m.timestamp);
    const dayOfWeek = date.getDay();
    const hourOfDay = date.getHours();
    const key = `${dayOfWeek}-${hourOfDay}`;

    if (!patterns[key]) {
      patterns[key] = { dayOfWeek, hourOfDay, editCount: 0 };
    }
    patterns[key].editCount++;
  });

  return Object.values(patterns).sort((a, b) => b.editCount - a.editCount);
};

/**
 * Compute node type change frequencies
 */
export const computeNodeTypeChanges = (
  versions: WorkflowVersion[]
): NodeTypeChange[] => {
  if (versions.length < 2) {
    return [];
  }

  const sortedVersions = [...versions].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  const typeChanges: Record<string, NodeTypeChange> = {};

  for (let i = 1; i < sortedVersions.length; i++) {
    const oldVersion = sortedVersions[i - 1];
    const newVersion = sortedVersions[i];

    const diff = computeGraphDiff(
      oldVersion.graph as Graph,
      newVersion.graph as Graph
    );

    diff.addedNodes.forEach(node => {
      const type = getNodeType(node);
      if (!typeChanges[type]) {
        typeChanges[type] = { type, addedCount: 0, removedCount: 0, modifiedCount: 0 };
      }
      typeChanges[type].addedCount++;
    });

    diff.removedNodes.forEach(node => {
      const type = getNodeType(node);
      if (!typeChanges[type]) {
        typeChanges[type] = { type, addedCount: 0, removedCount: 0, modifiedCount: 0 };
      }
      typeChanges[type].removedCount++;
    });

    diff.modifiedNodes.forEach(nodeChange => {
      const type = nodeChange.nodeType?.split(".").pop() || "unknown";
      if (!typeChanges[type]) {
        typeChanges[type] = { type, addedCount: 0, removedCount: 0, modifiedCount: 0 };
      }
      typeChanges[type].modifiedCount++;
    });
  }

  return Object.values(typeChanges).sort((a, b) =>
    (b.addedCount + b.removedCount + b.modifiedCount) -
    (a.addedCount + a.removedCount + a.modifiedCount)
  );
};

/**
 * Generate comprehensive version analytics
 */
export const generateVersionAnalytics = (
  versions: WorkflowVersion[]
): VersionAnalytics => {
  if (versions.length === 0) {
    return {
      metrics: [],
      evolution: {
        totalVersions: 0,
        totalEdits: 0,
        averageNodesPerVersion: 0,
        nodeGrowthRate: 0,
        edgeGrowthRate: 0,
        complexityGrowthRate: 0,
        mostProductiveDay: "N/A",
        saveTypeDistribution: {},
        versionSpan: 0
      },
      editPatterns: [],
      nodeTypeChanges: [],
      peakComplexityVersion: null,
      mostChangedVersion: null
    };
  }

  const metrics = versions
    .filter(v => v.graph?.nodes)
    .map(computeVersionMetrics)
    .sort((a, b) => a.version - b.version);

  const evolution = computeEvolutionMetrics(metrics);
  const editPatterns = computeEditPatterns(metrics);
  const nodeTypeChanges = computeNodeTypeChanges(versions);

  const peakComplexityVersion = metrics.reduce(
    (max, m) => (m.complexity > (max?.complexity || 0) ? m : max),
    null as VersionMetrics | null
  );

  const versionChanges = metrics.map(m => ({
    version: m,
    changes: Math.abs(
      (metrics[m.version - 2]?.complexity || m.complexity) - m.complexity
    )
  }));
  const mostChangedVersion = versionChanges.reduce(
    (max, v) => (v.changes > (max?.changes || 0) ? v : max),
    { version: null as VersionMetrics | null, changes: 0 }
  ).version;

  return {
    metrics,
    evolution,
    editPatterns,
    nodeTypeChanges,
    peakComplexityVersion,
    mostChangedVersion
  };
};

/**
 * Format duration in human-readable format
 */
export const formatDuration = (ms: number): string => {
  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  }
  if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  if (ms < 3600000) {
    return `${(ms / 60000).toFixed(1)}m`;
  }
  if (ms < 86400000) {
    return `${(ms / 3600000).toFixed(1)}h`;
  }
  return `${(ms / 86400000).toFixed(1)}d`;
};

/**
 * Format growth rate with sign
 */
export const formatGrowthRate = (rate: number): string => {
  const sign = rate >= 0 ? "+" : "";
  return `${sign}${rate.toFixed(1)}%`;
};
