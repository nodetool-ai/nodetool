import Fuse from "fuse.js";
import { Workflow } from "../stores/ApiTypes";

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

export interface SearchResult {
  workflow: Workflow;
  fuseScore: number;
  matches: {
    text: string;
  }[];
}

export const searchWorkflows = (
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

  const fuse = new Fuse(workflows, workflowSearchOptions);
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
