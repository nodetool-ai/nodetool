/** @jsxImportSource @emotion/react */

import {
  Typography,
  Box,
  CircularProgress,
  Button,
  Tooltip,
  TextField,
  Switch,
  FormControlLabel,
  IconButton,
  InputAdornment
} from "@mui/material";
import { useCallback, useMemo, useState, useEffect } from "react";
import { Workflow, WorkflowList } from "../../stores/ApiTypes";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ErrorOutlineRounded } from "@mui/icons-material";
import { css } from "@emotion/react";
import { searchWorkflows, SearchResult } from "../../utils/workflowSearch";
import { Clear as ClearIcon } from "@mui/icons-material";
import {
  TOOLTIP_ENTER_DELAY,
  TOOLTIP_LEAVE_DELAY
} from "../../config/constants";
import ThemeNodetool from "../themes/ThemeNodetool";
import { usePanelStore } from "../../stores/PanelStore";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import BackToEditorButton from "../panels/BackToEditorButton";

const styles = (theme: any) =>
  css({
    ".workflow-grid": {
      height: "100%",
      width: "100%",
      position: "relative"
    },
    "&": {
      position: "relative",
      width: "100%",
      height: "calc(100vh - 64px)",
      overflow: "hidden",
      display: "flex",
      flexDirection: "column"
    },
    ".container": {
      display: "flex",
      flexWrap: "wrap",
      alignItems: "flex-start",
      overflowY: "auto",
      padding: "15px",
      gap: "1.5em"
    },
    ".workflow": {
      flexGrow: "1",
      flexShrink: "0",
      flexBasis: "200px",
      margin: ".5em",
      maxWidth: "200px",
      cursor: "pointer",
      display: "flex",
      flexDirection: "column",
      alignItems: "flex-start",
      height: "auto"
    },
    ".workflow h4": {
      marginTop: "8px",
      marginBottom: "4px"
    },
    ".workflow .description": {
      fontSize: "0.875rem",
      color: theme.palette.text.secondary,
      lineHeight: "1.2",
      display: "-webkit-box",
      WebkitBoxOrient: "vertical",
      WebkitLineClamp: 3,
      overflow: "hidden",
      width: "100%",
      transition: "all 0.3s ease",
      position: "relative",
      maxHeight: "4.5em",
      transform: "translateY(0)",
      opacity: 1
    },
    ".workflow:hover .description": {
      WebkitLineClamp: "unset",
      maxHeight: "none",
      overflow: "visible",
      zIndex: 10,
      backgroundColor: theme.palette.background.paper,
      boxShadow: "0 4px 8px rgba(0,0,0,0.2)",
      padding: "4px",
      borderRadius: "4px",
      marginTop: "-4px",
      transform: "translateY(2px)",
      opacity: 1,
      transition: "all 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)"
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
      overflow: "hidden",
      position: "relative",
      background: `linear-gradient(0deg, ${theme.palette.c_hl1}20, ${theme.palette.c_gray1}22)`
    },
    ".image-wrapper:hover": {
      animation: "sciFiPulse 2s infinite",
      boxShadow: `0 0 10px ${theme.palette.c_hl1}`,
      outline: `2px solid ${theme.palette.c_hl1}`
    },
    "@keyframes sciFiPulse": {
      "0%": {
        boxShadow: `0 0 5px ${theme.palette.c_hl1}`,
        filter: "brightness(1)"
      },
      "50%": {
        boxShadow: `0 0 20px ${theme.palette.c_hl1}`,
        filter: "brightness(1.2)"
      },
      "100%": {
        boxShadow: `0 0 5px ${theme.palette.c_hl1}`,
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
      color: theme.palette.text.primary,
      border: `1px solid ${theme.palette.c_gray2}`,
      "&:hover": {
        border: `1px solid ${theme.palette.c_hl1}`,
        transform: "translateY(-2px)",
        boxShadow: `0 4px 8px rgba(0, 0, 0, 0.2)`,
        color: theme.palette.common.white,
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
        ${theme.palette.c_hl2}dd, 
        ${theme.palette.c_hl1}dd
      )`,
      boxShadow: `0 2px 4px rgba(0, 0, 0, 0.3)`,
      color: theme.palette.c_black,
      animation: "glowPulse 1.5s infinite",
      "&:hover": {
        transform: "none",
        boxShadow: `0 2px 4px rgba(0, 0, 0, 0.3)`,
        color: theme.palette.c_black
      }
    },
    "@keyframes glowPulse": {
      "0%": {
        boxShadow: `0 0 5px ${theme.palette.c_hl1}50`
      },
      "50%": {
        boxShadow: `0 0 15px ${theme.palette.c_hl1}90`
      },
      "100%": {
        boxShadow: `0 0 5px ${theme.palette.c_hl1}50`
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
          borderColor: theme.palette.c_hl1
        },
        "&.Mui-focused fieldset": {
          borderColor: theme.palette.c_hl1
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
      color: theme.palette.text.secondary,
      maxHeight: "100px",
      overflowY: "auto"
    },
    ".matched-item": {
      fontSize: theme.fontSizeSmaller,
      fontWeight: 600,
      padding: ".1em .4em",
      marginRight: ".5em",
      borderRadius: ".3em",
      color: theme.palette.c_black,
      wordBreak: "break-word",
      backgroundColor: theme.palette.c_gray4
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
  const createWorkflow = useWorkflowManager((state) => state.create);
  const [selectedTag, setSelectedTag] = useState<string | null>("start");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [nodesOnlySearch, setNodesOnlySearch] = useState(false);
  const closePanel = usePanelStore((state) => state.closePanel);

  useEffect(() => {
    closePanel();
  }, [closePanel]);

  useEffect(() => {
    const nodeParam = searchParams.get("node");
    if (nodeParam) {
      setSearchQuery(nodeParam);
      setNodesOnlySearch(true);
      setSelectedTag(null);
    }
  }, [searchParams]);

  const { data, isLoading, isError, error } = useQuery<WorkflowList, Error>({
    queryKey: ["examples"],
    queryFn: loadWorkflows
  });

  const copyExampleWorkflow = useCallback(
    async (workflow: Workflow) => {
      const tags = workflow.tags || [];
      if (!tags.includes("example")) {
        tags.push("example");
      }
      const req = {
        name: workflow.name,
        description: workflow.description,
        thumbnail: workflow.thumbnail,
        thumbnail_url: workflow.thumbnail_url,
        tags: tags,
        access: "private",
        graph: JSON.parse(JSON.stringify(workflow.graph)),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      const newWorkflow = await createWorkflow(req);
      return newWorkflow;
    },
    [createWorkflow]
  );

  const onClickWorkflow = useCallback(
    async (workflow: Workflow) => {
      const newWorkflow = await copyExampleWorkflow(workflow);
      navigate("/editor/" + newWorkflow.id);
    },
    [copyExampleWorkflow, navigate]
  );

  const groupedWorkflows = useMemo(() => {
    if (!data) return {};
    return data.workflows.reduce((acc, workflow) => {
      workflow.tags?.forEach((tag) => {
        if (!acc[tag]) acc[tag] = [];
        acc[tag].push(workflow);
      });
      return acc;
    }, {} as Record<string, Workflow[]>);
  }, [data]);

  const filteredWorkflows = useMemo(() => {
    if (!data?.workflows) return [];

    const workflows =
      !selectedTag || !groupedWorkflows[selectedTag]
        ? data.workflows
        : groupedWorkflows[selectedTag];

    if (searchQuery.trim()) {
      const results = searchWorkflows(workflows, searchQuery, nodesOnlySearch);
      setSearchResults(results);
      return results.map((r) => r.workflow);
    }

    setSearchResults([]);
    return [...workflows].sort((a, b) =>
      a.name.toLowerCase().localeCompare(b.name.toLowerCase())
    );
  }, [selectedTag, groupedWorkflows, data, searchQuery, nodesOnlySearch]);

  // const renderSearchDebug = () => {
  //   if (!searchQuery.trim() || !searchResults.length) return null;

  //   return (
  //     <Box className="search-debug">
  //       <Typography variant="body2">
  //         Search results ({searchResults.length}):
  //       </Typography>
  //       {searchResults.slice(0, 3).map((result, idx) => {
  //         const data = prepareWorkflowData(result.workflow);
  //         return (
  //           <Typography key={idx} variant="body2">
  //             • {result.workflow.name} (score: {result.score.toFixed(2)})
  //             {result.matches.slice(0, 2).map((match, midx) => (
  //               <span key={midx}>
  //                 <br />
  //                 &nbsp;&nbsp;matched:{" "}
  //                 <span className="match-highlight">{match.text}</span>
  //               </span>
  //             ))}
  //             <br />
  //             &nbsp;&nbsp;nodes:{" "}
  //             <span className="match-highlight">
  //               {data.nodeNames.join(", ")}
  //             </span>
  //           </Typography>
  //         );
  //       })}
  //     </Box>
  //   );
  // };

  const handleClearSearch = () => {
    setSearchQuery("");
    setNodesOnlySearch(false);
    // Update URL to remove node parameter
    const newSearchParams = new URLSearchParams(searchParams);
    newSearchParams.delete("node");
    navigate({ search: newSearchParams.toString() });
  };

  return (
    <div className="workflow-grid" css={styles}>
      <Tooltip title="Back to Editor" enterDelay={TOOLTIP_ENTER_DELAY}>
        <BackToEditorButton />
      </Tooltip>
      <Box className="tag-menu">
        <div className="button-row">
          <Tooltip
            title="Basic examples to get started"
            enterDelay={TOOLTIP_ENTER_DELAY}
            leaveDelay={TOOLTIP_LEAVE_DELAY}
          >
            <Button
              onClick={() => setSelectedTag("getting-started")}
              variant="outlined"
              className={selectedTag === "getting-started" ? "selected" : ""}
            >
              Getting Started
            </Button>
          </Tooltip>
          {Object.keys(groupedWorkflows)
            .filter((tag) => tag !== "start")
            .sort((a, b) => a.localeCompare(b))
            .map((tag) => (
              <Tooltip
                key={tag}
                title={`Show ${tag} examples`}
                enterDelay={TOOLTIP_ENTER_DELAY}
                leaveDelay={TOOLTIP_LEAVE_DELAY}
              >
                <Button
                  onClick={() => setSelectedTag(tag)}
                  variant="outlined"
                  className={selectedTag === tag ? "selected" : ""}
                >
                  {tag}
                </Button>
              </Tooltip>
            ))}
          <Tooltip
            title="Show all example workflows"
            enterDelay={TOOLTIP_ENTER_DELAY}
            leaveDelay={TOOLTIP_LEAVE_DELAY}
          >
            <Button
              onClick={() => setSelectedTag(null)}
              className={selectedTag === null ? "selected" : ""}
            >
              SHOW ALL
            </Button>
          </Tooltip>
        </div>
      </Box>
      <Box className="search-container">
        <TextField
          className="search-field"
          placeholder="Search examples..."
          variant="outlined"
          size="small"
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            if (e.target.value.trim()) {
              setSelectedTag(null);
            }
          }}
          slotProps={{
            input: {
              endAdornment: searchQuery && (
                <InputAdornment position="end">
                  <IconButton
                    aria-label="clear search"
                    onClick={handleClearSearch}
                    edge="end"
                    size="small"
                  >
                    <ClearIcon />
                  </IconButton>
                </InputAdornment>
              )
            }
          }}
        />
        <Tooltip
          title="Search for Nodes used in the example workflows"
          enterDelay={TOOLTIP_ENTER_DELAY}
          leaveDelay={TOOLTIP_LEAVE_DELAY}
        >
          <FormControlLabel
            className="search-switch"
            control={
              <Switch
                checked={nodesOnlySearch}
                onChange={(e) => setNodesOnlySearch(e.target.checked)}
                size="small"
              />
            }
            label="Node Search"
          />
        </Tooltip>
      </Box>
      {/* {renderSearchDebug()} */}
      <Box className="container">
        {isLoading && (
          <div className="loading-indicator">
            <CircularProgress />
            <Typography variant="h4">Loading Examples</Typography>
          </div>
        )}
        {isError && (
          <ErrorOutlineRounded>
            <Typography>{error?.message}</Typography>
          </ErrorOutlineRounded>
        )}
        {filteredWorkflows.map((workflow) => {
          const searchResult = searchResults.find(
            (r) => r.workflow.id === workflow.id
          );
          const matchedNodes = searchResult?.matches?.length
            ? searchResult.matches
            : [];

          return (
            <Box
              key={workflow.id}
              className="workflow"
              onClick={() => onClickWorkflow(workflow)}
            >
              <Box className="image-wrapper">
                {workflow.thumbnail_url && (
                  <img
                    width="200px"
                    src={workflow.thumbnail_url}
                    alt={workflow.name}
                  />
                )}
              </Box>
              <Typography variant="h4" component={"h4"}>
                {workflow.name}
              </Typography>
              <Typography className="description">
                {workflow.description}
              </Typography>
              {nodesOnlySearch && matchedNodes.length > 0 && (
                <Box
                  sx={{ mt: 1, display: "flex", gap: 0.5, flexWrap: "wrap" }}
                >
                  {matchedNodes.map((match, idx) => (
                    <Typography key={idx} className="matched-item">
                      {match.text}
                    </Typography>
                  ))}
                </Box>
              )}
            </Box>
          );
        })}
        {filteredWorkflows.length === 0 && searchQuery && (
          <Box className="no-results">
            <Typography variant="body1" sx={{ marginBottom: "1em" }}>
              Nothing found for
              <strong style={{ color: ThemeNodetool.palette.c_hl1 }}>
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
    </div>
  );
};

export default ExampleGrid;
