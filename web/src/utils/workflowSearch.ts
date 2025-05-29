import Fuse, { type IFuseOptions } from "fuse.js";
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
  fuseScore: number;
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
    return workflows.map((workflow) => ({
      workflow,
      fuseScore: 1,
      matches: []
    }));

  const searchData = workflows.map((wf) => prepareWorkflowData(wf));

  const fuse = new Fuse(
    searchData,
    nodesOnly ? nodeOnlySearchOptions : workflowSearchOptions
  );
  const fuseResults = fuse.search(query);

  if (nodesOnly) {
    return fuseResults.map((result) => {
      const matchedNodeTexts = new Set<string>();
      const workflow = result.item.workflow;
      const lowerCaseQuery = query.toLowerCase();

      if (workflow.graph && workflow.graph.nodes) {
        Object.values(workflow.graph.nodes).forEach((node: any) => {
          const nodeTitle = String(node.title || "").toLowerCase();
          const nodeType = String(node.type || "").toLowerCase();

          if (nodeTitle.includes(lowerCaseQuery)) {
            matchedNodeTexts.add(String(node.title || ""));
          }
          if (nodeType.includes(lowerCaseQuery)) {
            const typeParts = String(node.type || "").split(/[./]/);
            const matchedPart = typeParts.find((part) =>
              part.toLowerCase().includes(lowerCaseQuery)
            );
            if (matchedPart) {
              matchedNodeTexts.add(matchedPart);
            } else if (
              String(node.type || "")
                .toLowerCase()
                .includes(lowerCaseQuery)
            ) {
              matchedNodeTexts.add(String(node.type || ""));
            }
          }
        });
      }
      return {
        workflow: workflow,
        fuseScore: 1 - (result.score || 0),
        matches: Array.from(matchedNodeTexts).map((text) => ({ text }))
      };
    });
  } else {
    return fuseResults.map((result) => {
      const uniqueMatches = new Set<string>();
      result.matches?.forEach((match) => {
        const text = String(match.value || "");
        if (text) {
          uniqueMatches.add(text.split(/[./]/).pop() || text);
        }
      });
      return {
        workflow: result.item.workflow,
        fuseScore: 1 - (result.score || 0),
        matches: Array.from(uniqueMatches).map((text) => ({ text }))
      };
    });
  }
};
