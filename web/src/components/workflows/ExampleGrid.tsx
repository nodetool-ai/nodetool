/** @jsxImportSource @emotion/react */

import { Typography, Box, CircularProgress } from "@mui/material";
import { useCallback, useMemo, useState, useEffect } from "react";
import { Workflow, WorkflowList } from "../../stores/ApiTypes";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ErrorOutlineRounded } from "@mui/icons-material";
import { css } from "@emotion/react";
import { searchWorkflows as searchWorkflowsFrontend } from "../../utils/workflowSearch";
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
import TabsNodeEditor from "../editor/TabsNodeEditor";
import AppHeader from "../panels/AppHeader";

const styles = (theme: Theme) =>
  css({
    ".workflow-grid": {
      position: "relative",
      top: "64px",
      left: "48px",
      height: "calc(100vh - 16px)",
      width: "calc(100% - 64px)",
      overflow: "scroll"
    },
    "&": {
      position: "relative",
      width: "100%",
      overflow: "hidden",
      display: "flex",
      flexDirection: "column"
    },
    ".container": {
      display: "flex",
      flexWrap: "wrap",
      alignItems: "flex-start",
      overflowY: "auto",
      padding: "15px 15px 100px 15px",
      gap: ".5em"
    },
    ".workflow": {
      position: "relative",
      flexGrow: "1",
      flexShrink: "0",
      flexBasis: "200px",
      margin: ".5em",
      maxWidth: "200px",
      cursor: "pointer",
      display: "flex",
      flexDirection: "column",
      alignItems: "flex-start",
      height: "auto",
      overflow: "visible"
    },
    ".workflow.loading": {
      cursor: "wait",
      pointerEvents: "none" /* Disables all clicks */
    },
    ".loading-overlay": {
      position: "absolute",
      top: 0,
      left: 0,
      width: "100%",
      height: "100%",
      display: "flex",
      padding: "10px",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(0, 0, 0, 0.7)",
      zIndex: 10,
      borderRadius: "4px",
      backdropFilter: "blur(2px)",
      boxShadow: `0 0 15px ${"var(--palette-primary-main)"}60`,
      border: `1px solid ${"var(--palette-primary-main)"}80`
    },
    ".loading-text": {
      color: "var(--palette-primary-main)",
      fontSize: "0.9rem",
      marginTop: "12px",
      textAlign: "center",
      fontWeight: "bold",
      textShadow: "0 1px 3px rgba(0,0,0,0.8)"
    },
    ".workflow h3": {
      color: "var(--c_brightest)",
      marginTop: "8px",
      marginBottom: "4px",
      height: "2.2em",
      lineHeight: "1.1em",
      overflow: "hidden",
      position: "relative",
      zIndex: 2
    },
    ".workflow .package-name": {
      position: "absolute",
      bottom: "-6px",
      left: "-4px",
      fontSize: "var(--fontSizeTiny)",
      lineHeight: "1.2",
      backgroundColor: theme.vars.palette.grey[800],
      color: theme.vars.palette.grey[200],
      padding: "0.2em 0.4em",
      margin: "0",
      zIndex: 110
    },
    ".workflow .description": {
      fontSize: "0.875rem",
      color: theme.vars.palette.text.secondary,
      lineHeight: "1.2",
      display: "-webkit-box",
      WebkitBoxOrient: "vertical",
      WebkitLineClamp: 3,
      overflow: "hidden",
      width: "100%",
      position: "relative",
      maxHeight: "4.5em",
      margin: "0.5em 0",
      backgroundColor: "transparent",
      transition:
        "color 0.3s ease, background-color 0.3s ease, opacity 0.3s ease, transform 0.3s ease"
    },
    ".workflow:hover .description": {
      WebkitLineClamp: "unset",
      position: "absolute",
      zIndex: 100,
      width: "calc(100% + 10px)",
      backgroundColor: theme.vars.palette.background.default,
      boxShadow: "0 1px 4px rgba(0,0,0,0.6)",
      padding: "0 5px 1em 5px",
      left: "-5px",
      borderRadius: "4px",
      maxHeight: "none",
      height: "auto",
      top: "100%",
      color: "#fff"
    },
    ".loading-indicator": {
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      flexDirection: "column",
      height: "50vh",
      width: "100%"
    },
    ".image-wrapper": {
      width: "200px",
      height: "200px",
      overflow: "visible",
      position: "relative",
      background: `linear-gradient(0deg, ${"var(--palette-primary-main)"}20, ${
        theme.vars.palette.grey[800]
      }22)`
    },
    ".image-wrapper:hover": {
      animation: "sciFiPulse 2s infinite",
      boxShadow: `0 0 10px ${"var(--palette-primary-main)"}`,
      outline: `2px solid ${"var(--palette-primary-main)"}`
    },

    "@keyframes sciFiPulse": {
      "0%": {
        boxShadow: `0 0 5px ${"var(--palette-primary-main)"}`,
        filter: "brightness(1)"
      },
      "50%": {
        boxShadow: `0 0 20px ${"var(--palette-primary-main)"}`,
        filter: "brightness(1.2)"
      },
      "100%": {
        boxShadow: `0 0 5px ${"var(--palette-primary-main)"}`,
        filter: "brightness(1)"
      }
    },
    ".workflow img": {
      width: "100%",
      height: "100%",
      objectFit: "cover"
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
      transition: "all 0.3s ease",
      textTransform: "uppercase",
      letterSpacing: "1px",
      fontWeight: "bold",
      color: theme.vars.palette.text.primary,
      border: `1px solid ${theme.vars.palette.grey[600]}`,
      "&:hover": {
        border: `1px solid ${"var(--palette-primary-main)"}`,
        // transform: "translateY(-2px)",
        boxShadow: `0 4px 8px rgba(0, 0, 0, 0.2)`,
        color: theme.vars.palette.common.white,
        animation: "glowPulse 1.5s infinite"
      },
      fontSize: "0.8rem",
      padding: "6px 12px",
      "@media (max-width: 600px)": {
        fontSize: "0.75rem",
        padding: "4px 8px"
      }
    },
    ".tag-menu .selected": {
      background: `linear-gradient(0deg, 
        ${"var(--palette-secondary-main)"}dd, 
        ${"var(--palette-primary-main)"}dd
      )`,
      boxShadow: `0 2px 4px rgba(0, 0, 0, 0.3)`,
      color: theme.vars.palette.grey[1000],
      animation: "glowPulse 1.5s infinite",
      "&:hover": {
        transform: "none",
        boxShadow: `0 2px 4px rgba(0, 0, 0, 0.3)`,
        color: theme.vars.palette.grey[1000]
      }
    },
    "@keyframes glowPulse": {
      "0%": {
        boxShadow: `0 0 5px ${"var(--palette-primary-main)"}50`
      },
      "50%": {
        boxShadow: `0 0 15px ${"var(--palette-primary-main)"}90`
      },
      "100%": {
        boxShadow: `0 0 5px ${"var(--palette-primary-main)"}50`
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
        "&:hover fieldset": {
          borderColor: "var(--palette-primary-main)"
        },
        "&.Mui-focused fieldset": {
          borderColor: "var(--palette-primary-main)"
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
    ".matched-nodes": {
      position: "absolute",
      top: "2px",
      left: "2px",
      display: "flex",
      flexDirection: "column",
      gap: "2px",
      width: "fit-content",
      height: "100%",
      zIndex: 100
    },
    ".matched-item": {
      width: "fit-content",
      fontSize: "var(--fontSizeSmaller)",
      fontWeight: 600,
      padding: ".2em .4em",
      marginRight: ".5em",
      borderRadius: ".3em",
      color: theme.vars.palette.grey[1000],
      wordBreak: "break-word",
      backgroundColor: theme.vars.palette.grey[200],
      opacity: 0.96
    },
    ".matched-item-name": {
      fontSize: "14px",
      color: theme.vars.palette.grey[900]
    },
    ".matched-item-namespace": {
      display: "block",
      color: theme.vars.palette.grey[800],
      fontSize: "11px",
      fontWeight: 600
    },
    ".no-results": {
      padding: "2em",
      opacity: 0,
      animation: "fadeIn 0.2s ease-in forwards",
      animationDelay: "2s"
    },
    "@keyframes fadeIn": {
      from: { opacity: 0 },
      to: { opacity: 1 }
    }
  });

const ExampleGrid = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const loadWorkflows = useWorkflowManager((state) => state.loadExamples);
  const searchExamples = useWorkflowManager((state) => state.searchExamples);
  const createWorkflow = useWorkflowManager((state) => state.create);
  const [selectedTag, setSelectedTag] = useState<string | null>("start");
  const [inputValue, setInputValue] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<FrontendSearchResult[]>(
    []
  );
  const [nodesOnlySearch, setNodesOnlySearch] = useState(false);
  const closePanel = usePanelStore((state) => state.closePanel);
  const [loadingWorkflowId, setLoadingWorkflowId] = useState<string | null>(
    null
  );

  useEffect(() => {
    closePanel();
  }, [closePanel]);

  useEffect(() => {
    const nodeParam = searchParams.get("node");
    if (nodeParam) {
      setSearchQuery(nodeParam);
      setInputValue(nodeParam);
      setNodesOnlySearch(true);
      setSelectedTag(null);
    }
  }, [searchParams]);

  const {
    data,
    isLoading: isLoadingExamples,
    isError,
    error
  } = useQuery<WorkflowList, Error>({
    queryKey: ["examples"],
    queryFn: loadWorkflows
  });

  // search backend for node matches
  const {
    data: searchData,
    isLoading: isLoadingSearchData,
    isFetching: isFetchingSearchData
  } = useQuery<WorkflowList>({
    queryKey: ["", searchQuery],
    queryFn: () => searchExamples(searchQuery),
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
    if (!data) return {};
    return data.workflows.reduce(
      (acc: Record<string, Workflow[]>, workflow: Workflow) => {
        workflow.tags?.forEach((tag: string) => {
          if (!acc[tag]) acc[tag] = [];
          acc[tag].push(workflow);
        });
        return acc;
      },
      {} as Record<string, Workflow[]>
    );
  }, [data]);

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
      const generalResults = searchWorkflowsFrontend(
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
    groupedWorkflows
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

  const copyExampleWorkflow = useCallback(
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
      if (loadingWorkflowId) return; // Prevent multiple clicks

      setLoadingWorkflowId(workflow.id);
      try {
        const newWorkflow = await copyExampleWorkflow(workflow);
        navigate("/editor/" + newWorkflow.id);
      } catch (error) {
        console.error("Error copying workflow:", error);
        setLoadingWorkflowId(null);
      }
    },
    [copyExampleWorkflow, navigate, loadingWorkflowId]
  );

  useEffect(() => {
    return () => {
      // Reset loading state when component unmounts (navigation occurs)
      setLoadingWorkflowId(null);
    };
  }, []);

  const handleClearSearch = () => {
    setSearchQuery("");
    setInputValue("");
    // Update URL to remove node parameter
    const newSearchParams = new URLSearchParams(searchParams);
    newSearchParams.delete("node");
    navigate({ search: newSearchParams.toString() });
  };

  const handleInputChange = (newInputValue: string) => {
    setInputValue(newInputValue);
    if (newInputValue.trim()) {
      setSelectedTag(null);
      if (newInputValue.length > 1) {
        setSearchResults([]);
      }
    } else {
      handleClearSearch();
    }
  };
  const theme = useTheme();

  return (
    <Box css={styles(theme)}>
      <TabsNodeEditor hideContent />
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
          tags={groupedWorkflows}
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
        <Box className="container">
          {(isLoadingExamples || isFetchingSearchData) && (
            <div className="loading-indicator">
              <CircularProgress />
              <Typography variant="h4">
                {isFetchingSearchData && nodesOnlySearch
                  ? "Searching for Examples"
                  : "Loading Examples"}
              </Typography>
            </div>
          )}
          {isError && (
            <ErrorOutlineRounded>
              <Typography>{error?.message}</Typography>
            </ErrorOutlineRounded>
          )}
          {/* Hide workflows while searching */}
          {!(
            (isLoadingSearchData || isFetchingSearchData) &&
            nodesOnlySearch
          ) &&
            filteredWorkflows.map((workflow) => {
              const searchResult = searchResults.find(
                (r) => r.workflow.id === workflow.id
              );
              const matchedNodes = searchResult?.matches?.length
                ? searchResult.matches
                : [];
              const isLoading = loadingWorkflowId === workflow.id;

              return (
                <WorkflowCard
                  key={workflow.id}
                  workflow={workflow}
                  matchedNodes={matchedNodes}
                  nodesOnlySearch={nodesOnlySearch}
                  isLoading={isLoading}
                  onClick={onClickWorkflow}
                />
              );
            })}
          {filteredWorkflows.length === 0 &&
            searchQuery.trim().length > 1 &&
            !(
              (isLoadingSearchData || isFetchingSearchData) &&
              nodesOnlySearch
            ) && (
              <Box className="no-results">
                <Typography variant="body1" sx={{ marginBottom: "1em" }}>
                  Nothing found for
                  <strong style={{ color: theme.vars.palette.primary.main }}>
                    {" "}
                    &quot;{searchQuery}&quot;
                  </strong>
                </Typography>

                <Typography variant="h4" sx={{ margin: "1em 0 0.5em 0" }}>
                  Help us improve the examples
                </Typography>
                <Typography variant="body1" sx={{ marginBottom: "1em" }}>
                  Let us know what you&apos;re missing!
                </Typography>
                <ul
                  style={{
                    listStyleType: "none",
                    padding: 0,
                    margin: 0
                    // "& li": { marginBottom: "0.5em" }
                  }}
                >
                  <li>
                    <a
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        window.open(
                          "https://discord.gg/WmQTWZRcYE",
                          "_blank",
                          "noopener,noreferrer"
                        );
                      }}
                      style={{ color: "#61dafb" }}
                    >
                      Join our Discord
                    </a>
                  </li>
                  <li>
                    <a
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        window.open(
                          "https://forum.nodetool.ai",
                          "_blank",
                          "noopener,noreferrer"
                        );
                      }}
                      style={{ color: "#61dafb" }}
                    >
                      Join the Nodetool Forum
                    </a>
                  </li>
                </ul>
              </Box>
            )}
        </Box>
      </Box>
    </Box>
  );
};

export default ExampleGrid;
