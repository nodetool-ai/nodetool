/** @jsxImportSource @emotion/react */

import { Typography, Box, CircularProgress } from "@mui/material";
import { useCallback, useMemo, useState, useEffect, memo } from "react";
import { Workflow, WorkflowList } from "../../stores/ApiTypes";
import { useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ErrorOutlineRounded } from "@mui/icons-material";
import { css } from "@emotion/react";
import { useWorkflowSearch, searchWorkflowsWithFuse } from "../../utils/workflowSearch";
import { findMatchingNodesInWorkflows } from "../../utils/findMatchingNodesInWorkflows";
import { SearchResult as FrontendSearchResult } from "../../types/search";
import { SEARCH_DEBOUNCE_MS } from "../../config/constants";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { usePanelStore } from "../../stores/PanelStore";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import SearchBar from "./SearchBar";
import TagFilter from "./TagFilter";
import WorkflowCard from "./WorkflowCard";
import AppHeader from "../panels/AppHeader";
import AutoSizer from "react-virtualized-auto-sizer";
import { FixedSizeGrid as Grid, GridChildComponentProps } from "react-window";

const styles = (theme: Theme) =>
  css({
    "&": {
      position: "relative",
      width: "100%",
      height: "100%",
      overflow: "hidden",
      display: "flex",
      flexDirection: "column",
      flex: "1 1 auto",
      minHeight: 0
    },
    ".workflow-grid": {
      position: "relative",
      top: "0",
      left: "0",
      height: "100%",
      width: "100%",
      paddingTop: "64px",
      paddingLeft: "48px",
      boxSizing: "border-box",
      overflowY: "hidden",
      overflowX: "hidden",
      display: "flex",
      flexDirection: "column",
      flex: "1 1 auto",
      minHeight: 0
    },
    ".container": {
      display: "flex",
      flexWrap: "wrap",
      alignItems: "flex-start",
      overflowY: "auto",
      padding: "2em",
      gap: "1em",
      flex: "1 1 auto",
      minHeight: 0
    },
    ".virtualized-container": {
      flex: "1 1 auto",
      minHeight: 0,
      padding: "0 1em"
    },
    ".loading-indicator": {
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      flexDirection: "column",
      height: "50vh",
      width: "100%"
    },
    ".tag-menu": {
      margin: "20px",
      display: "flex",
      flexDirection: "column",
      gap: "10px",
      "& .MuiButtonGroup-root": {
        flexWrap: "wrap",
        gap: "4px",
        "& .MuiButton-root": {
          marginLeft: "0 !important",
          borderRadius: "4px !important",
          minWidth: "80px",
          margin: "2px"
        }
      }
    },
    ".tag-menu .button-row": {
      display: "flex",
      flexWrap: "wrap",
      gap: "4px"
    },
    ".tag-menu button": {
      transition: "all 0.2s ease",
      textTransform: "uppercase",
      letterSpacing: "0.5px",
      fontWeight: 600,
      color: theme.vars.palette.text.secondary,
      border: `1px solid ${theme.vars.palette.divider}`,
      background: theme.vars.palette.action.hover,
      borderRadius: "20px !important",
      "&:hover": {
        border: `1px solid ${theme.vars.palette.primary.main}`,
        background: theme.vars.palette.action.selected,
        color: theme.vars.palette.text.primary
      },
      fontSize: "0.8rem",
      padding: "6px 16px",
      "@media (max-width: 600px)": {
        fontSize: "0.75rem",
        padding: "4px 12px"
      }
    },
    ".tag-menu .selected": {
      border: `1px solid ${theme.vars.palette.primary.main}`,
      background: "rgba(var(--palette-primary-main-channel) / 0.1)",
      color: theme.vars.palette.primary.main,
      "&:hover": {
        background: "rgba(var(--palette-primary-main-channel) / 0.15)"
      }
    },
    ".search-container": {
      display: "flex",
      alignItems: "center",
      justifyContent: "flex-start",
      padding: "0 1.25em",
      gap: "2em"
    },
    ".search-field": {
      width: "100%",
      marginBottom: "0",
      maxWidth: "400px",
      "& .MuiOutlinedInput-root": {
        background: theme.vars.palette.action.hover,
        borderRadius: "12px",
        "& .MuiOutlinedInput-notchedOutline": {
          borderColor: theme.vars.palette.divider
        },
        "&:hover .MuiOutlinedInput-notchedOutline": {
          borderColor: theme.vars.palette.action.focus
        },
        "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
          borderColor: theme.vars.palette.primary.main,
          boxShadow: `0 0 0 2px rgba(var(--palette-primary-main-channel) / 0.2)`
        }
      }
    },
    ".search-switch": {
      minHeight: "2em",
      display: "flex",
      gap: ".5em"
    },
    ".search-debug": {
      padding: "0 20px",
      marginBottom: "10px",
      fontSize: "0.8rem",
      color: theme.vars.palette.text.secondary,
      maxHeight: "100px",
      overflowY: "auto"
    },
    ".no-results": {
      padding: "2em",
      opacity: 0,
      animation: "fadeIn 0.3s ease-in forwards",
      animationDelay: "1s"
    },
    "@keyframes fadeIn": {
      from: { opacity: 0 },
      to: { opacity: 1 }
    }
  });

const TemplateGrid = memo(function TemplateGrid() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const loadWorkflows = useWorkflowManager((state) => state.loadTemplates);
  const searchTemplates = useWorkflowManager((state) => state.searchTemplates);
  const createWorkflow = useWorkflowManager((state) => state.create);
  const closePanel = usePanelStore((state) => state.closePanel);

  const [selectedTag, setSelectedTag] = useState<string | null>("start");
  const [inputValue, setInputValue] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<FrontendSearchResult[]>(
    []
  );
  const [nodesOnlySearch, setNodesOnlySearch] = useState(false);
  const [loadingWorkflowId, setLoadingWorkflowId] = useState<string | null>(
    null
  );

  useEffect(() => {
    closePanel();
  }, [closePanel]);

  // Sync state from URL node param - runs on mount and URL changes
  // Using location.search as dependency for reliable trigger on navigation
  useEffect(() => {
    const nodeParam = searchParams.get("node");
    if (nodeParam) {
      setSearchQuery(nodeParam);
      setInputValue(nodeParam);
      setNodesOnlySearch(true);
      setSelectedTag(null);
    }
  }, [location.search, searchParams]);

  const {
    data,
    isLoading: isLoadingTemplates,
    isError,
    error
  } = useQuery<WorkflowList, Error>({
    queryKey: ["templates"],
    queryFn: loadWorkflows
  });

  // search backend for node matches
  const {
    data: searchData,
    isLoading: isLoadingSearchData,
    isFetching: isFetchingSearchData
  } = useQuery<WorkflowList>({
    queryKey: ["", searchQuery],
    queryFn: () => searchTemplates(searchQuery),
    enabled: searchQuery.trim().length > 1 && nodesOnlySearch,
    placeholderData: (previousData, previousQueryInstance) => {
      if (
        previousQueryInstance &&
        previousQueryInstance.queryKey[1] !== searchQuery
      ) {
        return undefined;
      }
      return previousData;
    }
  });

  // Debounce search query
  useEffect(() => {
    const handler = setTimeout(() => {
      setSearchQuery(inputValue);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handler);
  }, [inputValue]);

  const groupedWorkflows = useMemo(() => {
    if (!data) { return {}; }
    return data.workflows.reduce(
      (acc: Record<string, Workflow[]>, workflow: Workflow) => {
        workflow.tags?.forEach((tag: string) => {
          if (!acc[tag]) { acc[tag] = []; }
          acc[tag].push(workflow);
        });
        return acc;
      },
      {} as Record<string, Workflow[]>
    );
  }, [data]);

  // Filter tags to only show those with at least 2 workflows
  const filteredTags = useMemo(() => {
    const result: Record<string, Workflow[]> = {};
    for (const [tag, workflows] of Object.entries(groupedWorkflows)) {
      if (workflows.length >= 2) {
        result[tag] = workflows;
      }
    }
    return result;
  }, [groupedWorkflows]);

  // Memoize Fuse instance for workflow search - only recreates when workflows change
  // This is a significant performance optimization: Fuse indexing is O(n) and
  // should only happen when the workflows array changes, not on every keystroke
  const baseWorkflowsForSearch = useMemo(() => {
    return data?.workflows || [];
  }, [data]);
  const fuse = useWorkflowSearch(baseWorkflowsForSearch);

  useEffect(() => {
    if (
      nodesOnlySearch &&
      searchQuery.trim().length > 1 &&
      searchData?.workflows
    ) {
      try {
        const detailedNodeMatchResults = findMatchingNodesInWorkflows(
          searchData.workflows,
          searchQuery
        );
        setSearchResults(
          detailedNodeMatchResults.filter((sr) => sr.matches.length > 0)
        );
      } catch (error) {
        console.error("Search failed:", error);
        setSearchResults([]); // Clear results on error
      }
    } else if (
      !nodesOnlySearch &&
      searchQuery.trim().length > 1 &&
      data?.workflows
    ) {
      const baseWorkflowsForGeneralSearch =
        !selectedTag || !groupedWorkflows[selectedTag]
          ? data.workflows
          : groupedWorkflows[selectedTag] || [];
      // Use the memoized Fuse instance for efficient search
      const generalResults = searchWorkflowsWithFuse(
        fuse,
        baseWorkflowsForGeneralSearch,
        searchQuery
      );
      setSearchResults(generalResults);
    } else {
      setSearchResults([]);
    }
  }, [
    searchData,
    data,
    searchQuery,
    nodesOnlySearch,
    selectedTag,
    groupedWorkflows,
    fuse
  ]);

  // Filtered workflows for display
  const filteredWorkflows = useMemo(() => {
    let workflowsToDisplay: Workflow[];
    if (searchQuery.trim()) {
      workflowsToDisplay = searchResults.map((r) => r.workflow);
    } else {
      const base = data?.workflows || [];
      workflowsToDisplay =
        !selectedTag || !groupedWorkflows[selectedTag]
          ? base
          : groupedWorkflows[selectedTag] || [];
    }
    return [...workflowsToDisplay].sort((a, b) =>
      a.name.toLowerCase().localeCompare(b.name.toLowerCase())
    );
  }, [searchQuery, searchResults, data, selectedTag, groupedWorkflows]);

  const copyTemplateWorkflow = useCallback(
    async (workflow: Workflow) => {
      const tags = workflow.tags || [];
      if (!tags.includes("example")) {
        tags.push("example");
      }
      // Create a minimal workflow request with the example parameters
      const req = {
        name: workflow.name,
        package_name: workflow.package_name,
        description: workflow.description,
        tags: tags,
        access: "private",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      // Call createWorkflow with the example parameters
      const newWorkflow = await createWorkflow(
        req,
        workflow.package_name || undefined,
        workflow.name
      );
      return newWorkflow;
    },
    [createWorkflow]
  );

  const onClickWorkflow = useCallback(
    async (workflow: Workflow) => {
      if (loadingWorkflowId) { return; } // Prevent multiple clicks

      setLoadingWorkflowId(workflow.id);
      try {
        const newWorkflow = await copyTemplateWorkflow(workflow);
        navigate("/editor/" + newWorkflow.id);
      } catch (error) {
        console.error("Error copying workflow:", error);
        setLoadingWorkflowId(null);
      }
    },
    [copyTemplateWorkflow, navigate, loadingWorkflowId]
  );

  useEffect(() => {
    return () => {
      // Reset loading state when component unmounts (navigation occurs)
      setLoadingWorkflowId(null);
    };
  }, []);

  const handleClearSearch = useCallback(() => {
    setSearchQuery("");
    setInputValue("");
    // Update URL to remove node parameter
    const newSearchParams = new URLSearchParams(searchParams);
    newSearchParams.delete("node");
    navigate({ search: newSearchParams.toString() });
  }, [searchParams, navigate]);

  const handleInputChange = useCallback((newInputValue: string) => {
    setInputValue(newInputValue);
    if (newInputValue.trim()) {
      setSelectedTag(null);
      if (newInputValue.length > 1) {
        setSearchResults([]);
      }
    } else {
      handleClearSearch();
    }
  }, [handleClearSearch]);
  const theme = useTheme();

  // Grid configuration - adjusted for new card design with image-first layout
  const CARD_WIDTH = 260;
  const CARD_HEIGHT = 260;
  const GAP = 20;

  // Calculate grid dimensions based on container width
  const calculateColumns = useCallback((width: number) => {
    if (width <= 0) { return 1; }
    return Math.max(1, Math.floor((width + GAP) / (CARD_WIDTH + GAP)));
  }, []);

  // Grid item data for virtualization
  const gridItemData = useMemo(
    () => ({
      filteredWorkflows,
      searchResults,
      nodesOnlySearch,
      loadingWorkflowId,
      onClickWorkflow,
      columns: 1 // Will be updated dynamically
    }),
    [
      filteredWorkflows,
      searchResults,
      nodesOnlySearch,
      loadingWorkflowId,
      onClickWorkflow
    ]
  );

  // Grid cell renderer
  const GridCell = useCallback(
    ({
      columnIndex,
      rowIndex,
      style,
      data
    }: GridChildComponentProps<typeof gridItemData & { columns: number }>) => {
      const index = rowIndex * data.columns + columnIndex;
      const workflow = data.filteredWorkflows[index];

      if (!workflow) { return null; }

      const searchResult = data.searchResults.find(
        (r: FrontendSearchResult) => r.workflow.id === workflow.id
      );
      const matchedNodes = searchResult?.matches?.length
        ? searchResult.matches
        : [];
      const isLoading = data.loadingWorkflowId === workflow.id;

      return (
        <div
          style={{
            ...style,
            padding: GAP / 2
          }}
        >
          <WorkflowCard
            workflow={workflow}
            matchedNodes={matchedNodes}
            nodesOnlySearch={data.nodesOnlySearch}
            isLoading={isLoading}
            onClick={data.onClickWorkflow}
          />
        </div>
      );
    },
    []
  );

  // Show loading state
  const showLoading = isLoadingTemplates || isFetchingSearchData;
  const showGrid =
    !((isLoadingSearchData || isFetchingSearchData) && nodesOnlySearch) &&
    filteredWorkflows.length > 0;
  const showNoResults =
    filteredWorkflows.length === 0 &&
    searchQuery.trim().length > 1 &&
    !((isLoadingSearchData || isFetchingSearchData) && nodesOnlySearch);

  return (
    <Box css={styles(theme)}>
      <Box
        className="actions-container"
        sx={{
          position: "absolute",
          top: "32px",
          left: 0,
          right: 0,
          zIndex: 1000
        }}
      >
        <AppHeader />
      </Box>
      <Box className="workflow-grid">
        <TagFilter
          tags={filteredTags}
          selectedTag={selectedTag}
          onSelectTag={setSelectedTag}
        />
        <SearchBar
          inputValue={inputValue}
          nodesOnlySearch={nodesOnlySearch}
          onInputChange={handleInputChange}
          onToggleNodeSearch={setNodesOnlySearch}
          onClear={handleClearSearch}
        />
        {showLoading && (
          <div className="loading-indicator">
            <CircularProgress />
            <Typography variant="h4">
              {isFetchingSearchData && nodesOnlySearch
                ? "Searching for Templates"
                : "Loading Templates"}
            </Typography>
          </div>
        )}
        {isError && (
          <Box className="container">
            <ErrorOutlineRounded>
              <Typography>{error?.message}</Typography>
            </ErrorOutlineRounded>
          </Box>
        )}
        {showGrid && (
          <Box className="virtualized-container">
            <AutoSizer>
              {({ height, width }: { height: number; width: number }) => {
                const columns = calculateColumns(width);
                const rowCount = Math.ceil(filteredWorkflows.length / columns);
                const columnWidth = Math.floor(width / columns);

                return (
                  <Grid
                    columnCount={columns}
                    columnWidth={columnWidth}
                    height={height}
                    rowCount={rowCount}
                    rowHeight={CARD_HEIGHT + GAP}
                    width={width}
                    itemData={{ ...gridItemData, columns }}
                  >
                    {GridCell}
                  </Grid>
                );
              }}
            </AutoSizer>
          </Box>
        )}
        {showNoResults && (
          <Box className="container">
            <Box className="no-results">
              <Typography variant="body1" sx={{ marginBottom: "1em" }}>
                Nothing found for
                <strong style={{ color: theme.vars.palette.primary.main }}>
                  {" "}
                  &quot;{searchQuery}&quot;
                </strong>
              </Typography>

              <Typography variant="h4" sx={{ margin: "1em 0 0.5em 0" }}>
                Help us improve the templates
              </Typography>
              <Typography variant="body1" sx={{ marginBottom: "1em" }}>
                Let us know what you&apos;re missing!
              </Typography>
              <ul
                style={{
                  listStyleType: "none",
                  padding: 0,
                  margin: 0
                }}
              >
                <li>
                  <a
                    href="https://discord.gg/WmQTWZRcYE"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: "var(--palette-info-light)" }}
                  >
                    Join our Discord
                  </a>
                </li>
                <li>
                  <a
                    href="https://forum.nodetool.ai"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: "var(--palette-info-light)" }}
                  >
                    Join the Nodetool Forum
                  </a>
                </li>
              </ul>
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  );
});

TemplateGrid.displayName = "TemplateGrid";

export default TemplateGrid;
