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
        return [title, type].filter(Boolean);
      })
      .flat();
  } catch (e) {
    devError("Error extracting node names:", e);
    return [];
  }
};

export const prepareWorkflowData = (workflow: Workflow): WorkflowSearchData => {
  // const cached = workflowSearchCache.get(workflow.id);
  // if (cached) {
  //   console.log(`Cache hit for workflow "${workflow.name}" (${workflow.id})`);
  //   return cached;
  // }

  // console.log(
  //   `Cache miss for workflow "${workflow.name}" (${workflow.id}), computing node names...`
  // );
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
  threshold: 0.1,
  distance: 100,
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
