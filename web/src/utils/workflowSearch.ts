import Fuse from "fuse.js";
import { Workflow } from "../stores/ApiTypes";

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
    // Get all nodes from the graph
    const nodes = Object.values(graph.nodes || {});
    // Extract both the title and the type of each node
    return nodes
      .map((node: any) => {
        const title = node.title || "";
        const type = node.type || "";
        return [title, type].filter(Boolean);
      })
      .flat();
  } catch (e) {
    console.error("Error extracting node names:", e);
    return [];
  }
};

export const prepareWorkflowData = (workflow: Workflow): WorkflowSearchData => {
  const cached = workflowSearchCache.get(workflow.id);
  if (cached) return cached;

  const nodeNames = extractNodeNames(workflow);
  const searchText = [workflow.name, workflow.description, ...nodeNames]
    .filter(Boolean)
    .join(" ");

  const data = { workflow, nodeNames, searchText };
  workflowSearchCache.set(workflow.id, data);
  return data;
};

const normalSearchOptions = {
  includeScore: true,
  keys: [
    { name: "workflow.name", weight: 0.9 },
    { name: "workflow.description", weight: 0.8 },
    { name: "nodeNames", weight: 0.2 }
  ],
  threshold: 0.2,
  distance: 30,
  minMatchCharLength: 2,
  ignoreLocation: true,
  useExtendedSearch: true,
  findAllMatches: true
};

const nodeOnlySearchOptions = {
  includeScore: true,
  keys: [{ name: "nodeNames", weight: 1.0 }],
  threshold: 0.2,
  distance: 20,
  minMatchCharLength: 2,
  ignoreLocation: true,
  useExtendedSearch: true,
  findAllMatches: true
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

  const fuse = new Fuse(
    searchData,
    nodesOnly ? nodeOnlySearchOptions : normalSearchOptions
  );

  return fuse.search(query).map((result) => {
    const data = prepareWorkflowData(result.item.workflow);
    console.log(
      `Node names for "${result.item.workflow.name}":`,
      data.nodeNames,
      nodesOnly ? "(nodes only search)" : "(normal search)"
    );

    return {
      workflow: result.item.workflow,
      score: 1 - (result.score || 0),
      matches:
        result.matches?.map((match) => ({
          text: match.value || ""
        })) || []
    };
  });
};
