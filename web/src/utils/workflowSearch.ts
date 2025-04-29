import Fuse from "fuse.js";
import { Workflow } from "../stores/ApiTypes";
import log from "loglevel";

interface WorkflowSearchData {
  workflow: Workflow;
  nodeNames: string[];
  nodeDescriptions: string[];
  searchText: string;
}

const workflowSearchCache = new Map<string, WorkflowSearchData>();

const extractNodeData = (
  workflow: Workflow
): { names: string[]; descriptions: string[] } => {
  if (!workflow.graph) return { names: [], descriptions: [] };

  try {
    const graph =
      typeof workflow.graph === "string"
        ? JSON.parse(workflow.graph)
        : workflow.graph;

    const nodes = Object.values(graph.nodes || {});
    const names: string[] = [];
    const descriptions: string[] = [];

    nodes.forEach((node: any) => {
      const title = node.title || "";
      const type = node.type || "";
      const dataType = node.data?.type;
      const description = node.data?.description || "";

      names.push(...[title, type, dataType].filter(Boolean));
      if (description) descriptions.push(description);
    });

    return { names, descriptions };
  } catch (e) {
    log.error("Error extracting node data:", e);
    return { names: [], descriptions: [] };
  }
};

export const prepareWorkflowData = (workflow: Workflow): WorkflowSearchData => {
  const { names, descriptions } = extractNodeData(workflow);
  const searchText = [...names, ...descriptions].join(" ");

  return {
    workflow,
    nodeNames: names,
    nodeDescriptions: descriptions,
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
  minMatchCharLength: 2,
  ignoreLocation: true,
  useExtendedSearch: false
};

const workflowSearchOptions = {
  ...nodeOnlySearchOptions,
  keys: [
    { name: "workflow.name", weight: 2 },
    { name: "workflow.description", weight: 1 }
  ]
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
      workflow,
      nodeNames: data.nodeNames
    };
  });

  const fuse = new Fuse(
    searchData,
    nodesOnly ? nodeOnlySearchOptions : workflowSearchOptions
  );
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
