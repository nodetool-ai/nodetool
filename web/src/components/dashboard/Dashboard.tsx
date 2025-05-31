/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useCallback, useState, useEffect } from "react";
import {
  Box,
  Typography,
  CircularProgress,
  Button,
  ToggleButton,
  ToggleButtonGroup
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Workflow, WorkflowList, Message } from "../../stores/ApiTypes";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { useSettingsStore } from "../../stores/SettingsStore";
import useGlobalChatStore from "../../stores/GlobalChatStore";
import ThemeNodetool from "../themes/ThemeNodetool";
import { prettyDate, relativeTime } from "../../utils/formatDateAndTime";
import { truncateString } from "../../utils/truncateString";
import { DEFAULT_MODEL } from "../../config/constants";
import { client, BASE_URL } from "../../stores/ApiClient";
import { createErrorMessage } from "../../utils/errorHandling";
import ChatInputSection from "../chat/containers/ChatInputSection";
import { MessageContent } from "../../stores/ApiTypes";

const styles = (theme: any) =>
  css({
    "&": {
      width: "100vw",
      height: "100vh",
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gridTemplateRows: "1fr auto",
      gap: theme.spacing(4),
      padding: theme.spacing(4),
      backgroundColor: theme.palette.background.default,
      overflow: "hidden"
    },

    ".section": {
      backgroundColor: theme.palette.c_gray1,
      borderRadius: theme.spacing(1),
      padding: theme.spacing(4),
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
      boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)"
    },

    ".section-title": {
      color: theme.palette.c_gray6,
      marginBottom: theme.spacing(3)
    },

    ".workflows-section": {
      gridRow: "1",
      gridColumn: "1"
    },

    ".workflow-controls": {
      height: "40px",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center"
    },

    ".examples-section": {
      gridRow: "1",
      gridColumn: "2"
    },

    ".chat-section": {
      gridRow: "2",
      gridColumn: "1 / -1",
      padding: theme.spacing(3),
      maxHeight: "280px",
      display: "flex",
      flexDirection: "column",
      gap: theme.spacing(2)
    },

    ".content-scrollable": {
      flex: 1,
      overflow: "auto",
      paddingRight: theme.spacing(1)
    },

    ".workflow-item": {
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(2),
      padding: theme.spacing(2),
      marginBottom: theme.spacing(1.5),
      cursor: "pointer",
      borderRadius: theme.shape.borderRadius,
      backgroundColor: theme.palette.c_gray2,
      transition: "all 0.2s",
      "&:hover": {
        backgroundColor: theme.palette.c_gray3,
        transform: "translateX(4px)"
      }
    },

    ".workflow-thumbnail": {
      width: "60px",
      height: "60px",
      borderRadius: theme.shape.borderRadius,
      backgroundColor: theme.palette.c_gray3,
      backgroundSize: "cover",
      backgroundPosition: "center",
      flexShrink: 0
    },

    ".workflow-info": {
      flex: 1,
      minWidth: 0
    },

    ".workflow-name": {
      color: theme.palette.c_white,
      fontWeight: 500,
      marginBottom: theme.spacing(0.5),
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    },

    ".workflow-description": {
      color: theme.palette.c_gray5,
      fontSize: "0.875rem",
      lineHeight: 1.4,
      display: "-webkit-box",
      WebkitBoxOrient: "vertical",
      WebkitLineClamp: 2,
      overflow: "hidden"
    },

    ".workflow-date": {
      color: theme.palette.c_gray6,
      fontSize: "0.75rem",
      marginLeft: "auto",
      flexShrink: 0
    },

    ".example-grid": {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
      gap: theme.spacing(3)
    },

    ".example-card": {
      position: "relative",
      cursor: "pointer",
      borderRadius: theme.spacing(1),
      overflow: "hidden",
      backgroundColor: "var(--c_gray1)",
      "&:hover": {
        opacity: 0.9
      },
      ".example-description-tooltip": {
        visibility: "hidden",
        width: "200px",
        backgroundColor: theme.palette.c_black,
        color: theme.palette.c_white,
        textAlign: "center",
        borderRadius: "6px",
        padding: "5px 0",
        position: "absolute",
        zIndex: 1,
        bottom: "125%",
        left: "50%",
        marginLeft: "-100px",
        opacity: 0,
        transition: "opacity 0.3s",
        "&::after": {
          content: '""',
          position: "absolute",
          top: "100%",
          left: "50%",
          marginLeft: "-5px",
          borderWidth: "5px",
          borderStyle: "solid",
          borderColor: `${theme.palette.c_black} transparent transparent transparent`
        }
      },
      "&:hover .example-description-tooltip": {
        visibility: "visible",
        opacity: 1
      }
    },

    ".example-image": {
      width: "100%",
      height: "150px",
      objectFit: "cover",
      backgroundColor: theme.palette.c_gray2
    },

    ".example-name": {
      padding: ".2em .5em .5em 0",
      color: theme.palette.c_white,
      backgroundColor: theme.palette.c_gray1,
      fontSize: "var(--fontSizeNormal)"
    },

    ".header-controls": {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: theme.spacing(3)
    },

    ".create-button": {
      padding: ".3em 1em",
      backgroundColor: theme.palette.c_gray2,
      color: theme.palette.c_white,
      "&:hover": {
        backgroundColor: theme.palette.c_gray3
      }
    },

    ".sort-toggle": {
      "& .MuiToggleButton-root": {
        lineHeight: "1.2em",
        color: theme.palette.c_gray5,
        borderColor: theme.palette.c_gray3,
        "&.Mui-selected": {
          backgroundColor: theme.palette.c_gray3,
          color: theme.palette.c_white
        }
      }
    },

    ".loading-container": {
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      height: "300px"
    },

    ".loading-overlay": {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(0, 0, 0, 0.7)",
      zIndex: 10
    },

    // Responsive adjustments
    "@media (max-width: 1200px)": {
      "&": {
        gridTemplateColumns: "1fr",
        gridTemplateRows: "1fr 1fr auto",
        gap: theme.spacing(3),
        padding: theme.spacing(3)
      },
      ".workflows-section": {
        gridRow: "1",
        gridColumn: "1"
      },
      ".examples-section": {
        gridRow: "2",
        gridColumn: "1"
      },
      ".chat-section": {
        gridRow: "3",
        gridColumn: "1"
      }
    },

    "@media (max-width: 768px)": {
      "&": {
        padding: theme.spacing(2),
        gap: theme.spacing(2)
      },
      ".section": {
        padding: theme.spacing(2)
      },
      ".example-grid": {
        gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
        gap: theme.spacing(2)
      }
    },

    "@media (max-width: 480px)": {
      "&": {
        padding: theme.spacing(1),
        gap: theme.spacing(1)
      },
      ".section": {
        padding: theme.spacing(1)
      },
      ".workflow-controls": {
        flexDirection: "column",
        alignItems: "stretch",
        gap: theme.spacing(1)
      }
    }
  });

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const settings = useSettingsStore((state) => state.settings);
  const setWorkflowOrder = useSettingsStore((state) => state.setWorkflowOrder);
  const createNewWorkflow = useWorkflowManager((state) => state.createNew);
  const loadExamples = useWorkflowManager((state) => state.loadExamples);
  const createWorkflow = useWorkflowManager((state) => state.create);

  const [selectedModel, setSelectedModel] = useState<string>(DEFAULT_MODEL);
  const [selectedTools, setSelectedTools] = useState<string[]>([]);
  const [loadingExampleId, setLoadingExampleId] = useState<string | null>(null);

  const {
    connect,
    disconnect,
    status,
    sendMessage,
    createNewThread,
    switchThread
  } = useGlobalChatStore();

  // Load workflows
  const loadWorkflows = async () => {
    const { data, error } = await client.GET("/api/workflows/", {
      params: {
        query: {
          cursor: "",
          limit: 20,
          columns: "name,id,updated_at,description,thumbnail_url"
        }
      }
    });
    if (error) {
      throw createErrorMessage(error, "Failed to load workflows");
    }
    return data;
  };

  const { data: workflowsData, isLoading: isLoadingWorkflows } =
    useQuery<WorkflowList>({
      queryKey: ["workflows"],
      queryFn: loadWorkflows
    });

  const { data: examplesData, isLoading: isLoadingExamples } =
    useQuery<WorkflowList>({
      queryKey: ["examples"],
      queryFn: loadExamples
    });

  // Filter examples to show only those with "start" tag
  const startExamples =
    examplesData?.workflows.filter(
      (workflow) =>
        workflow.tags?.includes("start") ||
        workflow.tags?.includes("getting-started")
    ) || [];

  // Sort workflows
  const sortedWorkflows =
    workflowsData?.workflows.sort((a, b) => {
      if (settings.workflowOrder === "name") {
        return a.name.localeCompare(b.name);
      }
      return b.updated_at.localeCompare(a.updated_at);
    }) || [];

  const handleCreateNewWorkflow = async () => {
    const workflow = await createNewWorkflow();
    navigate(`/editor/${workflow.id}`);
  };

  const handleWorkflowClick = (workflow: Workflow) => {
    navigate(`/editor/${workflow.id}`);
  };

  const handleExampleClick = async (example: Workflow) => {
    if (loadingExampleId) return;

    setLoadingExampleId(example.id);
    try {
      const tags = example.tags || [];
      if (!tags.includes("example")) {
        tags.push("example");
      }

      const req = {
        name: example.name,
        package_name: example.package_name,
        description: example.description,
        tags: tags,
        access: "private",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const newWorkflow = await createWorkflow(
        req,
        example.package_name || undefined,
        example.name
      );
      navigate(`/editor/${newWorkflow.id}`);
    } catch (error) {
      console.error("Error copying example:", error);
      setLoadingExampleId(null);
    }
  };

  const handleSendChat = useCallback(
    async (content: MessageContent[], prompt: string) => {
      if (!prompt.trim()) return;

      // Ensure chat is connected
      if (status !== "connected") {
        await connect();
      }
      const threadId = createNewThread();
      switchThread(threadId);

      sendMessage({
        type: "message",
        name: "",
        role: "user",
        content: content,
        model: selectedModel
      });
      // Navigate to chat view
      navigate("/chat");
    },
    [
      status,
      connect,
      navigate,
      selectedModel,
      sendMessage,
      createNewThread,
      switchThread
    ]
  );

  const handleModelChange = useCallback((modelId: string) => {
    setSelectedModel(modelId);
  }, []);

  const handleOrderChange = (_: any, newOrder: any) => {
    if (newOrder !== null) {
      setWorkflowOrder(newOrder);
    }
  };

  const handleViewAllExamples = () => {
    navigate("/examples");
  };

  return (
    <Box css={styles(ThemeNodetool)}>
      {/* Recent Workflows Section */}
      <Box className="section workflows-section">
        <Box className="header-controls">
          <Typography variant="h2" className="section-title">
            Recent Workflows
          </Typography>
          <Box
            className="workflow-controls"
            sx={{ display: "flex", gap: 2, alignItems: "center" }}
          >
            <ToggleButtonGroup
              className="sort-toggle"
              value={settings.workflowOrder}
              onChange={handleOrderChange}
              exclusive
              size="small"
            >
              <ToggleButton value="name">Name</ToggleButton>
              <ToggleButton value="updated_at">Date</ToggleButton>
            </ToggleButtonGroup>
            <Button
              className="create-button"
              startIcon={<AddIcon />}
              onClick={handleCreateNewWorkflow}
              size="small"
            >
              Create New
            </Button>
          </Box>
        </Box>

        <Box className="content-scrollable">
          {isLoadingWorkflows ? (
            <Box className="loading-container">
              <CircularProgress />
            </Box>
          ) : (
            sortedWorkflows.map((workflow) => (
              <Box
                key={workflow.id}
                className="workflow-item"
                onClick={() => handleWorkflowClick(workflow)}
              >
                <Box
                  className="workflow-thumbnail"
                  sx={{
                    backgroundImage: workflow.thumbnail_url
                      ? `url(${workflow.thumbnail_url})`
                      : undefined
                  }}
                />
                <Box className="workflow-info">
                  <Typography className="workflow-name">
                    {workflow.name}
                  </Typography>
                  <Typography className="workflow-description">
                    {truncateString(workflow.description, 100)}
                  </Typography>
                </Box>
                <Typography className="workflow-date">
                  {relativeTime(workflow.updated_at)}
                </Typography>
              </Box>
            ))
          )}
        </Box>
      </Box>

      {/* Start Examples Section */}
      <Box className="section examples-section">
        <Typography variant="h2" className="section-title">
          Getting Started
        </Typography>
        <Box className="content-scrollable">
          {isLoadingExamples ? (
            <Box className="loading-container">
              <CircularProgress />
            </Box>
          ) : (
            <Box className="example-grid">
              {startExamples.map((example) => (
                <Box
                  key={example.id}
                  className="example-card"
                  onClick={() => handleExampleClick(example)}
                >
                  {loadingExampleId === example.id && (
                    <Box className="loading-overlay">
                      <CircularProgress size={30} />
                    </Box>
                  )}
                  <img
                    className="example-image"
                    src={`${BASE_URL}/api/assets/packages/${example.package_name}/${example.name}.jpg`}
                    alt={example.name}
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                  <Typography className="example-name">
                    {example.name}
                  </Typography>
                  {example.description && (
                    <Typography className="example-description-tooltip">
                      {truncateString(example.description, 150)}
                    </Typography>
                  )}
                </Box>
              ))}
            </Box>
          )}
        </Box>
        <Button
          onClick={handleViewAllExamples}
          sx={{ marginTop: 2, alignSelf: "center" }}
        >
          View All Examples
        </Button>
      </Box>

      {/* Chat Input Section */}
      <Box className="section chat-section">
        <ChatInputSection
          status={status as any}
          onSendMessage={handleSendChat}
          selectedTools={selectedTools}
          onToolsChange={setSelectedTools}
          selectedModel={selectedModel}
          onModelChange={handleModelChange}
        />
      </Box>
    </Box>
  );
};

export default Dashboard;
