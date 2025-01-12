import Fuse from "fuse.js";
import { Workflow } from "../stores/ApiTypes";
import { devError } from "./DevLog";

interface WorkflowSearchData {
  workflow: Workflow;
  nodeNames: string[];
  searchText: string;
}

const workflowSearchCache = new Map<string, WorkflowSearchData>();

const extractNodeNames = (workflow: Workflow): string[] => {
  if (!workflow.graph) return [];

  try {
    const graph =
      typeof workflow.graph === "string"
        ? JSON.parse(workflow.graph)
        : workflow.graph;
    const nodes = Object.values(graph.nodes || {});
    return nodes
      .map((node: any) => {
        const title = node.title || "";
        const type = node.type || "";
        const dataType = node.data?.type;
        return [title, type, dataType].filter(Boolean);
      })
      .flat();
  } catch (e) {
    devError("Error extracting node names:", e);
    return [];
  }
};

export const prepareWorkflowData = (workflow: Workflow): WorkflowSearchData => {
  const nodeNames = extractNodeNames(workflow);
  // Create individual search entries for each node name
  const searchText = nodeNames.join(" ");

  return {
    workflow,
    nodeNames,
    searchText
  };
};

const nodeOnlySearchOptions = {
  includeScore: true,
  includeMatches: true,
  keys: ["nodeNames"],
  threshold: 0.1,
  distance: 100,
  tokenize: false,
  minMatchCharLength: 3,
  ignoreLocation: true,
  useExtendedSearch: false
};

export interface SearchResult {
  workflow: Workflow;
  score: number;
  matches: {
    text: string;
  }[];
}

export const searchWorkflows = (
  workflows: Workflow[],
  query: string,
  nodesOnly: boolean = false
): SearchResult[] => {
  if (!query.trim())
    return workflows.map((workflow) => ({ workflow, score: 1, matches: [] }));

  const searchData = workflows.map((workflow) => {
    const data = prepareWorkflowData(workflow);
    return {
      workflow: data.workflow,
      nodeNames: data.nodeNames
    };
  });

  const fuse = new Fuse(searchData, nodeOnlySearchOptions);
  const results = fuse.search(query);

  return results.map((result) => {
    const uniqueMatches = new Set(
      result.matches?.map((match) => {
        const text = Array.isArray(match.value)
          ? match.value.join(", ")
          : String(match.value || "");
        return text.split(".").pop() || text;
      }) || []
    );

    return {
      workflow: result.item.workflow,
      score: 1 - (result.score || 0),
      matches: Array.from(uniqueMatches).map((text) => ({ text }))
    };
  });
};
