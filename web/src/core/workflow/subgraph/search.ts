/**
 * Search functionality for subgraphs within workflows
 * 
 * Provides utilities to search for subgraph definitions by various criteria
 */

import { SubgraphDefinition } from "../../../types/subgraph";

export interface SearchOptions {
  name?: string;
  description?: string;
  tags?: string[];
  minNodes?: number;
  maxNodes?: number;
  hasInputs?: boolean;
  hasOutputs?: boolean;
}

export interface SearchResult {
  definition: SubgraphDefinition;
  score: number;
  matches: {
    name: boolean;
    description: boolean;
    tags: boolean;
  };
}

/**
 * Search subgraph definitions by query string
 */
export function searchSubgraphs(
  definitions: SubgraphDefinition[],
  query: string
): SearchResult[] {
  const lowerQuery = query.toLowerCase();
  const results: SearchResult[] = [];

  for (const definition of definitions) {
    let score = 0;
    const matches = {
      name: false,
      description: false,
      tags: false
    };

    // Name match (highest priority)
    if (definition.name.toLowerCase().includes(lowerQuery)) {
      score += 10;
      matches.name = true;
    }

    // Description match
    if (definition.description?.toLowerCase().includes(lowerQuery)) {
      score += 5;
      matches.description = true;
    }

    // Tag match
    if (definition.tags?.some((tag) => tag.toLowerCase().includes(lowerQuery))) {
      score += 3;
      matches.tags = true;
    }

    // Node type match
    const hasMatchingNodeType = definition.nodes.some((node) =>
      node.type.toLowerCase().includes(lowerQuery)
    );
    if (hasMatchingNodeType) {
      score += 2;
    }

    // Only include if there's at least one match
    if (score > 0) {
      results.push({
        definition,
        score,
        matches
      });
    }
  }

  // Sort by score (descending)
  return results.sort((a, b) => b.score - a.score);
}

/**
 * Filter subgraph definitions by options
 */
export function filterSubgraphs(
  definitions: SubgraphDefinition[],
  options: SearchOptions
): SubgraphDefinition[] {
  return definitions.filter((definition) => {
    // Name filter
    if (options.name) {
      const lowerName = definition.name.toLowerCase();
      const lowerQuery = options.name.toLowerCase();
      if (!lowerName.includes(lowerQuery)) {
        return false;
      }
    }

    // Description filter
    if (options.description) {
      const lowerDesc = definition.description?.toLowerCase() || "";
      const lowerQuery = options.description.toLowerCase();
      if (!lowerDesc.includes(lowerQuery)) {
        return false;
      }
    }

    // Tags filter (must have all specified tags)
    if (options.tags && options.tags.length > 0) {
      const definitionTags = definition.tags || [];
      const hasAllTags = options.tags.every((tag) =>
        definitionTags.some((dt) => dt.toLowerCase() === tag.toLowerCase())
      );
      if (!hasAllTags) {
        return false;
      }
    }

    // Node count filters
    const nodeCount = definition.nodes.length;
    if (options.minNodes !== undefined && nodeCount < options.minNodes) {
      return false;
    }
    if (options.maxNodes !== undefined && nodeCount > options.maxNodes) {
      return false;
    }

    // Input/output filters
    if (options.hasInputs !== undefined) {
      const hasInputs = definition.inputs.length > 0;
      if (hasInputs !== options.hasInputs) {
        return false;
      }
    }
    if (options.hasOutputs !== undefined) {
      const hasOutputs = definition.outputs.length > 0;
      if (hasOutputs !== options.hasOutputs) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Find subgraphs that contain a specific node type
 */
export function findSubgraphsWithNodeType(
  definitions: SubgraphDefinition[],
  nodeType: string
): SubgraphDefinition[] {
  return definitions.filter((definition) =>
    definition.nodes.some((node) => node.type === nodeType)
  );
}

/**
 * Find subgraphs by tag
 */
export function findSubgraphsByTag(
  definitions: SubgraphDefinition[],
  tag: string
): SubgraphDefinition[] {
  const lowerTag = tag.toLowerCase();
  return definitions.filter((definition) =>
    definition.tags?.some((t) => t.toLowerCase() === lowerTag)
  );
}

/**
 * Get all unique tags from subgraph definitions
 */
export function getAllSubgraphTags(
  definitions: SubgraphDefinition[]
): string[] {
  const tags = new Set<string>();
  definitions.forEach((definition) => {
    definition.tags?.forEach((tag) => tags.add(tag));
  });
  return Array.from(tags).sort();
}

/**
 * Get subgraph usage statistics
 */
export function getSubgraphStats(definition: SubgraphDefinition) {
  return {
    nodeCount: definition.nodes.length,
    edgeCount: definition.edges.length,
    inputCount: definition.inputs.length,
    outputCount: definition.outputs.length,
    complexity: calculateComplexity(definition)
  };
}

/**
 * Calculate complexity score for a subgraph (0-100)
 * Based on node count, edge count, and structure
 */
function calculateComplexity(definition: SubgraphDefinition): number {
  const { nodes, edges } = definition;
  
  // Base complexity from counts
  const nodeComplexity = Math.min(nodes.length * 2, 50);
  const edgeComplexity = Math.min(edges.length * 1.5, 30);
  
  // Connection density (how interconnected the graph is)
  const maxPossibleEdges = nodes.length * (nodes.length - 1) / 2;
  const density = maxPossibleEdges > 0 ? edges.length / maxPossibleEdges : 0;
  const densityComplexity = density * 20;
  
  return Math.round(nodeComplexity + edgeComplexity + densityComplexity);
}
