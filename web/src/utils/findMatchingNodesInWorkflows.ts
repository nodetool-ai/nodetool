import Fuse from "fuse.js";
import { Workflow } from "../stores/ApiTypes";

// Re-defining SearchResult here as it's a shared structure.
// Alternatively, it could be imported from a central types file if it doesn't cause circular dependencies.
export interface SearchResult {
  workflow: Workflow;
  score: number; // Score from Fuse.js, or a default if not applicable
  matches: {
    text: string; // The matched node title or type part
  }[];
}

interface NodeInfo {
  originalText: string; // The text to display (e.g., full title, or last part of type)
  searchText: string; // The text to search against (e.g., lowercased full title, lowercased full type)
}

export const findMatchingNodesInWorkflows = (
  workflows: Workflow[],
  searchQuery: string,
  fuseThreshold: number = 0.35,
  fuseMinMatchCharLengthFactor: number = 0.5
): SearchResult[] => {
  if (!searchQuery.trim() || !workflows || workflows.length === 0) {
    // If no query or workflows, return them with no matches
    return workflows.map((workflow) => ({ workflow, score: 1, matches: [] }));
  }

  const lowerCaseQuery = searchQuery.toLowerCase();

  return workflows.map((workflow) => {
    const nodeInfos: NodeInfo[] = [];
    if (workflow.graph?.nodes) {
      Object.values(workflow.graph.nodes).forEach((node: any) => {
        // Consider typing node more strictly if possible
        const title = String(node.title || "");
        const type = String(node.type || "");

        if (title) {
          const info = { originalText: title, searchText: title.toLowerCase() };
          nodeInfos.push(info);
        }
        if (type) {
          // For display, use the last part of the type (e.g., "FetchRSSFeed" from "lib.rss.FetchRSSFeed")
          const displayType = type.split(/[./]/).pop() || type;
          // For searching, use the full type string for better context
          const info = {
            originalText: displayType,
            searchText: type.toLowerCase()
          };
          nodeInfos.push(info);
        }
      });
    }

    const fuse = new Fuse(nodeInfos, {
      keys: ["searchText"],
      includeScore: true,
      threshold: fuseThreshold,
      minMatchCharLength: Math.max(
        1,
        Math.floor(lowerCaseQuery.length * fuseMinMatchCharLengthFactor)
      ),
      ignoreLocation: true
    });

    const matchedNodeItems = fuse.search(lowerCaseQuery);

    // Deduplicate matches based on originalText to avoid showing "RSS" twice if query "RSS" matches "lib.rss.RSS"
    const uniqueMatchedOriginalTexts = new Set(
      matchedNodeItems.map((match) => match.item.originalText)
    );

    return {
      workflow,
      score:
        matchedNodeItems.length > 0 ? 1 - (matchedNodeItems[0].score || 0) : 0,
      matches: Array.from(uniqueMatchedOriginalTexts).map((text) => ({ text }))
    };
  });
};
