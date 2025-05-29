import Fuse from "fuse.js";
import { Workflow, Node } from "../stores/ApiTypes";

export interface SearchResult {
  workflow: Workflow;
  fuseScore: number;
  matches: {
    text: string;
  }[];
}

interface NodeMatch {
  textToShow: string;
  searchText: string;
}

export const findMatchingNodesInWorkflows = (
  workflows: Workflow[],
  searchQuery: string,
  fuseThreshold: number = 0.35,
  fuseMinMatchCharLengthFactor: number = 0.5
): SearchResult[] => {
  if (!searchQuery.trim() || !workflows || workflows.length === 0) {
    return workflows.map((workflow) => ({
      workflow,
      fuseScore: 1,
      matches: []
    }));
  }

  const lowerCaseQuery = searchQuery.toLowerCase();

  return workflows.map((workflow) => {
    const nodeInfos: NodeMatch[] = [];
    if (workflow.graph?.nodes) {
      Object.values(workflow.graph.nodes).forEach((node: Node) => {
        const title = String((node.data as { title?: string })?.title || "");
        const type = String(node.type || ""); // Full type string, e.g., "nodetool.llms.summarizer"

        // If title exists, add it for searching, but map it to show the full type.
        if (title && type) {
          // Ensure type is available to be shown
          nodeInfos.push({
            textToShow: type, // Always show the full type string
            searchText: title.toLowerCase() // Search against the title
          });
        }
        // Add the type itself for searching, also mapped to show the full type.
        if (type) {
          nodeInfos.push({
            textToShow: type, // Show the full type string
            searchText: type.toLowerCase() // Search against the full type string
          });
        }
      });
    }

    // Deduplicate nodeInfos: if a title is very similar to its type's display form,
    // and both are set to show the same displayType, Fuse might find it twice with slightly different scores.
    // We only care about the unique searchText for a given textToShow.
    // However, a simpler approach is to let Fuse find them and then deduplicate the textToShow results.

    const fuse = new Fuse(nodeInfos, {
      keys: ["searchText"], // Search against title or full type string
      includeScore: true,
      threshold: fuseThreshold,
      minMatchCharLength: Math.max(
        1,
        Math.floor(lowerCaseQuery.length * fuseMinMatchCharLengthFactor)
      ),
      ignoreLocation: true
    });

    const matchedNodeItems = fuse.search(lowerCaseQuery);

    // The text to display comes from `textToShow` of the matched item.
    const uniqueMatchedTextsToShow = new Set(
      matchedNodeItems.map((match) => match.item.textToShow)
    );

    const result = {
      workflow,
      fuseScore:
        matchedNodeItems.length > 0 ? 1 - (matchedNodeItems[0].score || 0) : 0,
      matches: Array.from(uniqueMatchedTextsToShow).map((text) => ({ text }))
    };
    return result;
  });
};
