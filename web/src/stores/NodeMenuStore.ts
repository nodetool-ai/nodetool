import { create } from "zustand";
import { NodeMetadata, TypeName } from "./ApiTypes";
import { ConnectDirection } from "./ConnectionStore";
import Fuse, { IFuseOptions } from "fuse.js";
import { filterDataByType } from "../components/node_menu/typeFilterUtils";
import useMetadataStore from "./MetadataStore";
import useRemoteSettingsStore from "./RemoteSettingStore";
import { devLog } from "../utils/DevLog";
import { highlightText as highlightTextUtil } from "../utils/highlightText";

export interface SplitNodeDescription {
  description: string;
  tags: string[];
  useCases: {
    raw: string;
    html: string;
  };
  recommendedModels: {
    raw: string;
    html: string;
  };
}

export const formatNodeDocumentation = (
  fullDocumentation: string,
  searchTerm?: string,
  searchInfo?: any
): SplitNodeDescription => {
  const lines = fullDocumentation.split("\n").map((line) => line.trim());
  const description = lines[0] || "";
  const tags =
    lines[1]
      ?.split(",")
      .map((t) => t.trim())
      .filter(Boolean) || [];

  // Find section indices
  const useCasesIndex = lines.findIndex((line) =>
    line.startsWith("Use cases:")
  );
  const recommendedModelsIndex = lines.findIndex((line) =>
    line.startsWith("Recommended models:")
  );

  // Extract use cases if present
  let useCasesRaw = "";
  let useCasesHtml = "";
  if (useCasesIndex !== -1) {
    const endIndex =
      recommendedModelsIndex !== -1 ? recommendedModelsIndex : lines.length;
    const useCaseLines = lines
      .slice(useCasesIndex + 1, endIndex)
      .filter((line) => line.trim());

    // Check if we have bullet points
    const hasBullets = useCaseLines.some((line) => line.trim().startsWith("-"));

    if (hasBullets) {
      // Clean bullet points but keep as separate lines
      useCasesRaw = useCaseLines
        .filter((line) => line.trim().startsWith("-"))
        .map((line) => line.replace(/^-\s*/, "").trim())
        .join("\n");
    } else {
      // Join without bullets
      useCasesRaw = useCaseLines.join(" ");
    }

    // Highlight the text
    if (searchTerm && searchInfo) {
      const highlighted = highlightTextUtil(
        useCasesRaw,
        "use_cases",
        searchTerm,
        searchInfo,
        hasBullets // Pass this flag to highlightText
      );
      useCasesHtml = highlighted.html;
    } else {
      useCasesHtml = useCasesRaw;
    }
  }

  // Extract recommended models if present
  let recommendedModelsRaw = "";
  let recommendedModelsHtml = "";
  if (recommendedModelsIndex !== -1) {
    const modelLines = lines
      .slice(recommendedModelsIndex + 1)
      .filter((line) => line.trim().startsWith("-"))
      .map((line) => {
        const content = line.replace(/^-\s*/, "").trim();
        if (searchTerm && searchInfo) {
          const highlighted = highlightTextUtil(
            content,
            "description",
            searchTerm,
            searchInfo
          );
          return highlighted.html;
        }
        return content;
      })
      .filter((line) => line.length > 0);

    // Store raw text version
    recommendedModelsRaw = modelLines.join("\n");

    // Format HTML version
    if (modelLines.length > 0) {
      recommendedModelsHtml = modelLines
        .map((line) => `<li>${line}</li>`)
        .join("\n");
      recommendedModelsHtml = `<ul>${recommendedModelsHtml}</ul>`;
    }
  }

  return {
    description,
    tags,
    useCases: {
      raw: useCasesRaw,
      html: useCasesHtml
    },
    recommendedModels: {
      raw: recommendedModelsRaw,
      html: recommendedModelsHtml
    }
  };
};

// Extend Fuse options type
interface ExtendedFuseOptions<T> extends Omit<IFuseOptions<T>, "keys"> {
  keys?: Array<{ name: string; weight: number }>;
  tokenize?: boolean;
  matchAllTokens?: boolean;
  findAllMatches?: boolean;
}

const fuseOptions: ExtendedFuseOptions<any> = {
  keys: [
    // Relative importance
    { name: "title", weight: 0.8 },
    { name: "namespace", weight: 0.4 },
    { name: "tags", weight: 0.4 },
    { name: "description", weight: 0.3 }
  ],
  includeMatches: true,
  ignoreLocation: true,
  threshold: 0.3,
  distance: 2,
  includeScore: true,
  shouldSort: true,
  minMatchCharLength: 3,
  useExtendedSearch: true,
  tokenize: false,
  matchAllTokens: false,
  findAllMatches: true
};

export type SearchResultGroup = {
  title: string;
  nodes: NodeMetadata[];
};

type NodeMenuStore = {
  isMenuOpen: boolean;
  dragToCreate: boolean;
  setDragToCreate: (dragToCreate: boolean) => void;
  connectDirection: ConnectDirection;
  setConnectDirection: (direction: ConnectDirection) => void;
  openedByDrop: boolean;
  dropType: string;
  menuPosition: { x: number; y: number };
  setMenuPosition: (x: number, y: number) => void;
  menuWidth: number;
  menuHeight: number;
  searchTerm: string;
  selectedInputType: string;
  setSelectedInputType: (inputType: string) => void;
  selectedOutputType: string;
  setSelectedOutputType: (outputType: string) => void;
  setSearchTerm: (term: string) => void;
  selectedPath: string[];
  setSelectedPath: (path: string[]) => void;
  performSearch: (term: string) => void;
  updateHighlightedNamespaces: (results: NodeMetadata[]) => void;

  openNodeMenu: (
    x: number,
    y: number,
    openedByDrop?: boolean,
    dropType?: string,
    connectDirection?: ConnectDirection,
    searchTerm?: string
  ) => void;
  closeNodeMenu: () => void;

  searchResults: NodeMetadata[];
  allSearchMatches: NodeMetadata[];
  setSearchResults: (results: NodeMetadata[]) => void;
  highlightedNamespaces: string[];
  setHighlightedNamespaces: (namespaces: string[]) => void;
  hoveredNode: NodeMetadata | null;
  setHoveredNode: (node: NodeMetadata | null) => void;

  // DraggableNodeDocumentation
  selectedNodeType: string | null;
  setSelectedNodeType: (nodeType: string | null) => void;
  documentationPosition: { x: number; y: number };
  setDocumentationPosition: (position: { x: number; y: number }) => void;
  showDocumentation: boolean;
  openDocumentation: (
    nodeType: string,
    position: { x: number; y: number }
  ) => void;
  closeDocumentation: () => void;

  focusedNodeIndex: number;
  setFocusedNodeIndex: (index: number) => void;

  clickPosition: { x: number; y: number };

  groupedSearchResults: SearchResultGroup[];
};

const useNodeMenuStore = create<NodeMenuStore>((set, get) => {
  const shouldFilterByApiKey = (term: string, store: NodeMenuStore) => {
    return term.trim() || store.selectedInputType || store.selectedOutputType;
  };

  const isNodeApiKeyMissing = (node: NodeMetadata, secrets: any) => {
    const rootNamespace = node.namespace.split(".")[0];

    switch (rootNamespace) {
      case "openai":
        return !secrets.OPENAI_API_KEY || secrets.OPENAI_API_KEY.trim() === "";
      case "replicate":
        return (
          !secrets.REPLICATE_API_TOKEN ||
          secrets.REPLICATE_API_TOKEN.trim() === ""
        );
      case "anthropic":
        return (
          !secrets.ANTHROPIC_API_KEY || secrets.ANTHROPIC_API_KEY.trim() === ""
        );
      case "elevenlabs":
        return (
          !secrets.ELEVENLABS_API_KEY ||
          secrets.ELEVENLABS_API_KEY.trim() === ""
        );
      case "fal":
        return !secrets.FAL_API_KEY || secrets.FAL_API_KEY.trim() === "";
      case "aime":
        return (
          !secrets.AIME_API_KEY ||
          secrets.AIME_API_KEY.trim() === "" ||
          !secrets.AIME_USER ||
          secrets.AIME_USER.trim() === ""
        );
      default:
        return false;
    }
  };

  const performGroupedSearch = (entries: any[], term: string) => {
    // Title matches
    const titleFuse = new Fuse(entries, {
      ...fuseOptions,
      threshold: 0.2,
      distance: 3,
      minMatchCharLength: 2,
      keys: [{ name: "title", weight: 1.0 }]
    });

    // Title + tags matches
    const titleTagsFuse = new Fuse(entries, {
      ...fuseOptions,
      threshold: 0.2,
      distance: 2,
      minMatchCharLength: 2,
      keys: [
        { name: "namespace", weight: 0.8 },
        { name: "tags", weight: 0.6 }
      ]
    });

    // Description matches
    const descriptionFuse = new Fuse(entries, {
      ...fuseOptions,
      threshold: 0.29,
      distance: 100,
      minMatchCharLength: 3,
      keys: [
        { name: "description", weight: 0.95 },
        { name: "use_cases", weight: 0.9 },
        { name: "recommended_models", weight: 0.7 }
      ],
      tokenize: true,
      tokenSeparator: /[\s\.,\-_]+/,
      findAllMatches: true,
      ignoreLocation: true,
      includeMatches: true,
      useExtendedSearch: true
    } as ExtendedFuseOptions<any>);

    const titleResults = titleFuse.search(term).map((result) => ({
      ...result.item.metadata,
      searchInfo: {
        score: result.score,
        matches: result.matches
      }
    }));

    const titleTagsResults = titleTagsFuse
      .search(term)
      .filter(
        (result) =>
          !titleResults.some(
            (r) => r.node_type === result.item.metadata.node_type
          )
      )
      .map((result) => ({
        ...result.item.metadata,
        searchInfo: {
          score: result.score,
          matches: result.matches
        }
      }));

    // Search with original term and with spaces removed
    const termNoSpaces = term.replace(/\s+/g, "");
    const results = new Map();

    // Collect all results, keeping only one match per position
    [
      ...descriptionFuse.search(term),
      ...descriptionFuse.search(termNoSpaces)
    ].forEach((result) => {
      const nodeType = result.item.metadata.node_type;
      if (!results.has(nodeType)) {
        results.set(nodeType, result);
      }
    });

    const descriptionResults = Array.from(results.values())
      .filter(
        (result) =>
          !titleResults.some(
            (r) => r.node_type === result.item.metadata.node_type
          ) &&
          !titleTagsResults.some(
            (r) => r.node_type === result.item.metadata.node_type
          )
      )
      .map((result) => ({
        ...result.item.metadata,
        searchInfo: {
          score: result.score,
          matches: result.matches
        }
      }));

    return [
      {
        title: "Name",
        nodes: titleResults
      },
      {
        title: "Namespace + Tags",
        nodes: titleTagsResults
      },
      {
        title: "Description",
        nodes: descriptionResults
      }
    ].filter((group) => group.nodes.length > 0);
  };

  return {
    // menu
    isMenuOpen: false,
    openedByDrop: false,
    dropType: "",
    dragToCreate: false,
    selectedInputType: "",
    setSelectedInputType: (inputType) => {
      set({ selectedInputType: inputType });
      get().performSearch(get().searchTerm);
    },
    selectedOutputType: "",
    setSelectedOutputType: (outputType) => {
      set({ selectedOutputType: outputType });
      get().performSearch(get().searchTerm);
    },

    setDragToCreate: (dragToCreate) => {
      set({ dragToCreate });
    },
    connectDirection: null,
    setConnectDirection: (direction) => {
      set({ connectDirection: direction as ConnectDirection });
    },
    menuPosition: { x: 0, y: 0 },
    menuWidth: 900,
    menuHeight: 800,
    setMenuPosition: (x, y) => {
      set({
        menuPosition: { x, y }
      });
    },

    searchTerm: "",
    setSearchTerm: (term) => {
      set({
        searchTerm: term,
        selectedPath: []
      });
      get().performSearch(term);
    },
    selectedPath: [],
    setSelectedPath: (path: string[]) => {
      const currentPath = get().selectedPath;
      const newPath = currentPath.join(".") === path.join(".") ? [] : path;

      set({
        selectedPath: newPath
      });
      get().performSearch(get().searchTerm);
    },

    performSearch: (term: string) => {
      const metadata = useMetadataStore.getState().getAllMetadata();
      const secrets = useRemoteSettingsStore.getState().secrets;

      if (metadata.length === 0) {
        set({ searchResults: metadata, highlightedNamespaces: [] });
        return;
      }

      // Filter out nodes in the "default" namespace
      const filteredMetadata = metadata.filter((node) => {
        if (node.namespace === "default") return false;

        // Only filter by API keys during search or type filtering
        if (shouldFilterByApiKey(term, get())) {
          if (isNodeApiKeyMissing(node, secrets)) {
            return false;
          }
        }

        return true;
      });

      // Filter by type
      const typeFilteredMetadata = filterDataByType(
        filteredMetadata,
        get().selectedInputType as TypeName,
        get().selectedOutputType as TypeName
      );

      // Get nodes that match the search term
      let searchMatchedNodes = typeFilteredMetadata;
      if (term.trim()) {
        const allEntries = typeFilteredMetadata.map((node: NodeMetadata) => {
          const { description, tags, useCases, recommendedModels } =
            formatNodeDocumentation(node.description);

          return {
            title: node.title,
            node_type: node.node_type,
            namespace: node.namespace,
            description: description,
            use_cases: useCases.raw,
            recommended_models: recommendedModels.raw,
            tags: tags.join(", "),
            metadata: node
          };
        });
        const groupedResults = performGroupedSearch(allEntries, term);
        searchMatchedNodes = groupedResults.flatMap((group) => group.nodes);
      }

      // Store all search matches
      set({ allSearchMatches: searchMatchedNodes });

      // Get nodes in the selected path
      const selectedPathString = get().selectedPath.join(".");

      // Show results if we have a search term or type filters
      const hasTypeFilters =
        get().selectedInputType || get().selectedOutputType;
      const hasSearchTerm = term.trim().length > 0;

      if (!hasSearchTerm && !selectedPathString && !hasTypeFilters) {
        set({
          searchResults: [],
          groupedSearchResults: []
        });
        get().updateHighlightedNamespaces([]);
        return;
      }

      // If we have a search term or type filters, show all matching results
      if (hasSearchTerm || hasTypeFilters) {
        const filteredResults = selectedPathString
          ? searchMatchedNodes.filter((node) => {
              if (!selectedPathString.includes(".")) {
                return node.namespace.startsWith(selectedPathString);
              }
              return (
                node.namespace === selectedPathString ||
                (node.namespace.startsWith(selectedPathString + ".") &&
                  node.namespace.split(".").length ===
                    selectedPathString.split(".").length + 1)
              );
            })
          : searchMatchedNodes;

        const groupedResults = selectedPathString
          ? [
              {
                title: selectedPathString,
                nodes: filteredResults
              }
            ]
          : performGroupedSearch(
              filteredResults.map((node) => {
                const { description, tags, useCases, recommendedModels } =
                  formatNodeDocumentation(node.description);
                return {
                  title: node.title,
                  node_type: node.node_type,
                  namespace: node.namespace,
                  description: description,
                  use_cases: useCases.raw,
                  recommended_models: recommendedModels.raw,
                  tags: tags.join(", "),
                  metadata: node
                };
              }),
              term
            );

        set({
          searchResults: filteredResults,
          groupedSearchResults: groupedResults
        });

        get().updateHighlightedNamespaces(searchMatchedNodes);
        return;
      }

      // Show nodes for selected path only
      const nodesInPath = typeFilteredMetadata.filter((node) => {
        if (!selectedPathString.includes(".")) {
          return node.namespace.startsWith(selectedPathString);
        }
        const matches =
          node.namespace === selectedPathString ||
          (node.namespace.startsWith(selectedPathString + ".") &&
            node.namespace.split(".").length ===
              selectedPathString.split(".").length + 1);
        return matches;
      });

      const allResults = [
        {
          title: selectedPathString,
          nodes: nodesInPath
        }
      ];

      set({
        searchResults: nodesInPath,
        groupedSearchResults: allResults
      });

      get().updateHighlightedNamespaces(nodesInPath);
    },

    searchResults: [],
    allSearchMatches: [],
    setSearchResults: (results: NodeMetadata[]) =>
      set({ searchResults: results }),
    highlightedNamespaces: [],
    setHighlightedNamespaces: (namespaces: string[]) =>
      set({ highlightedNamespaces: namespaces }),
    hoveredNode: null,
    setHoveredNode: (node) => {
      set({ hoveredNode: node });
    },

    // DraggableNodeDocumentation
    selectedNodeType: null,
    setSelectedNodeType: (nodeType) => set({ selectedNodeType: nodeType }),
    documentationPosition: { x: 0, y: 0 },
    setDocumentationPosition: (position) =>
      set({ documentationPosition: position }),
    showDocumentation: false,
    openDocumentation: (nodeType, position) =>
      set({
        selectedNodeType: nodeType,
        documentationPosition: position,
        showDocumentation: true
      }),
    closeDocumentation: () =>
      set({
        selectedNodeType: null,
        showDocumentation: false
      }),

    focusedNodeIndex: -1,
    setFocusedNodeIndex: (index) => set({ focusedNodeIndex: index }),

    groupedSearchResults: [],

    // Add back missing required properties
    clickPosition: { x: 0, y: 0 },

    openNodeMenu: (
      x: number,
      y: number,
      openedByDrop: boolean = false,
      dropType: string = "",
      connectDirection: ConnectDirection = null,
      searchTerm: string = ""
    ) => {
      const { menuWidth, menuHeight } = get();

      // Store the original click position
      set({ clickPosition: { x, y } });

      // Calculate menu position
      const maxPosX = window.innerWidth - menuWidth;
      const maxPosY = window.innerHeight - menuHeight - 40;

      // Constrain x position to keep menu within window bounds
      const constrainedX = Math.min(Math.max(x, 0), maxPosX);

      // Ensure minimum Y position (add some padding from top)
      const minPosY = 80; // Minimum distance from top of window
      const menuOffset = 20; // Add some space between click point and menu

      // Constrain Y position between minimum and maximum bounds
      const constrainedY = Math.min(Math.max(y + menuOffset, minPosY), maxPosY);

      set({
        isMenuOpen: true,
        menuPosition: { x: constrainedX, y: constrainedY },
        openedByDrop,
        dropType,
        connectDirection
      });

      setTimeout(() => {
        get().performSearch(searchTerm);
      }, 0);
    },

    closeNodeMenu: () => {
      if (get().dragToCreate) {
        set({ dragToCreate: false });
        return;
      }
      if (get().openedByDrop) {
        set({ openedByDrop: false });
        return;
      }
      set({
        searchTerm: "",
        openedByDrop: false,
        dropType: "",
        dragToCreate: false,
        connectDirection: null,
        isMenuOpen: false,
        menuPosition: { x: 100, y: 100 },
        searchResults: [],
        groupedSearchResults: []
      });
    },

    updateHighlightedNamespaces: (results: NodeMetadata[]) => {
      const newHighlightedNamespaces = new Set<string>();
      const selectedPathString = get().selectedPath.join(".");

      // Add all search result namespaces and their parents
      results.forEach((result) => {
        const parts = result.namespace.split(".");
        let path = "";
        parts.forEach((part) => {
          path = path ? `${path}.${part}` : part;
          newHighlightedNamespaces.add(path);
        });
      });

      // Add selected path and its parents if it exists
      if (selectedPathString) {
        const selectedParts = selectedPathString.split(".");
        let path = "";
        selectedParts.forEach((part) => {
          path = path ? `${path}.${part}` : part;
          newHighlightedNamespaces.add(path);
        });
      }

      set({ highlightedNamespaces: [...newHighlightedNamespaces] });
    }
  };
});

export default useNodeMenuStore;
