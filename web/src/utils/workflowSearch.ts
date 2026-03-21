import Fuse from "fuse.js";
import { useMemo } from "react";
import { Workflow } from "../stores/ApiTypes";
import { SearchResult } from "../types/search";

const workflowSearchOptions = {
  includeScore: true,
  includeMatches: true,
  threshold: 0.1,
  distance: 100,
  tokenize: false,
  minMatchCharLength: 2,
  ignoreLocation: true,
  useExtendedSearch: false,
  keys: [
    { name: "name", weight: 2 },
    { name: "description", weight: 1 }
  ]
};

/**
 * Custom hook that memoizes the Fuse instance for workflow search.
 * The Fuse instance is only recreated when the workflows array changes,
 * not on every search query. This significantly improves performance
 * when searching with multiple keystrokes.
 *
 * @param workflows - The array of workflows to search through
 * @returns A memoized Fuse instance for workflow search
 */
export const useWorkflowSearch = (workflows: Workflow[]) => {
  return useMemo(() => {
    return new Fuse(workflows, workflowSearchOptions);
  }, [workflows]);
};

/**
 * Search workflows using a memoized Fuse instance.
 * This function is more efficient than creating a new Fuse instance
 * on every search call.
 *
 * @param fuse - The memoized Fuse instance from useWorkflowSearch
 * @param workflows - The array of workflows to search through
 * @param query - The search query string
 * @returns Array of search results with workflow, score, and matches
 */
export const searchWorkflowsWithFuse = (
  fuse: Fuse<Workflow>,
  workflows: Workflow[],
  query: string
): SearchResult[] => {
  if (!query.trim()) {
    return workflows.map((workflow) => ({
      workflow,
      fuseScore: 1,
      matches: []
    }));
  }

  const fuseResults = fuse.search(query);

  const finalResults: SearchResult[] = fuseResults.map((result) => {
    const uniqueMatches = new Set<string>();
    result.matches?.forEach((match) => {
      const text = String(match.value || "");
      if (text) {
        uniqueMatches.add(text.split(/[./]/).pop() || text);
      }
    });
    return {
      workflow: result.item,
      fuseScore: 1 - (result.score || 0),
      matches: Array.from(uniqueMatches).map((text) => ({ text }))
    };
  });

  return finalResults;
};

/**
 * Search workflows (legacy function for backward compatibility).
 * NOTE: This creates a new Fuse instance on every call and is less efficient.
 * Use useWorkflowSearch + searchWorkflowsWithFuse for better performance.
 *
 * @deprecated Use useWorkflowSearch hook instead for optimal performance
 * @param workflows - The array of workflows to search through
 * @param query - The search query string
 * @returns Array of search results with workflow, score, and matches
 */
export const searchWorkflows = (
  workflows: Workflow[],
  query: string
): SearchResult[] => {
  const fuse = new Fuse(workflows, workflowSearchOptions);
  return searchWorkflowsWithFuse(fuse, workflows, query);
};
