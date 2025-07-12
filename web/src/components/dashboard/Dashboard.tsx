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
import { relativeTime } from "../../utils/formatDateAndTime";
import { truncateString } from "../../utils/truncateString";
import { client, BASE_URL } from "../../stores/ApiClient";
import { createErrorMessage } from "../../utils/errorHandling";
import ThreadList from "../chat/thread/ThreadList";
import BackToEditorButton from "../panels/BackToEditorButton";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

const styles = (theme: Theme) =>
  css({
    "&": {
      width: "100vw",
      height: "100vh",
      display: "grid",
      gridTemplateColumns: "1fr 1fr 1fr",
      gridTemplateRows: "auto 1fr auto",
      gap: theme.spacing(4),
      padding: theme.spacing(4),
      backgroundColor: theme.palette.background.default,
      overflow: "hidden"
    },

    ".section": {
      backgroundColor: theme.palette.grey[800],
      borderRadius: theme.spacing(1),
      padding: theme.spacing(4),
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
      boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)"
    },

    ".section-title": {
      color: theme.palette.grey[100],
      marginBottom: theme.spacing(3)
    },

    ".examples-section": {
      gridRow: "1",
      gridColumn: "1 / -1",
      maxHeight: "400px"
    },

    ".threads-section": {
      gridRow: "2",
      gridColumn: "1"
    },

    ".workflows-section": {
      gridRow: "2",
      gridColumn: "2"
    },

    ".workflow-controls": {
      height: "40px",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center"
    },

    ".content-scrollable": {
      flex: 1,
      overflow: "auto",
      paddingRight: theme.spacing(1)
    },

    ".workflow-item": {
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(4),
      padding: theme.spacing(1),
      marginBottom: theme.spacing(1),
      cursor: "pointer",
      borderRadius: theme.shape.borderRadius,
      backgroundColor: theme.palette.grey[800],
      transition: "all 0.2s",
      "&:hover": {
        backgroundColor: theme.palette.grey[600]
      }
    },

    ".workflow-thumbnail": {
      width: "60px",
      height: "60px",
      borderRadius: theme.shape.borderRadius,
      backgroundColor: "transparent",
      border: `1px solid ${theme.palette.grey[600]}`,
      backgroundSize: "cover",
      backgroundPosition: "center",
      flexShrink: 0
    },

    ".workflow-info": {
      flex: 1,
      minWidth: 0
    },

    ".workflow-name": {
      color: theme.palette.grey[0],
      fontWeight: 500,
      marginBottom: theme.spacing(0.5),
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    },

    ".workflow-description": {
      color: theme.palette.grey[200],
      fontSize: "0.875rem",
      lineHeight: "1.2em",
      display: "-webkit-box",
      WebkitBoxOrient: "vertical",
      WebkitLineClamp: 2,
      overflow: "hidden"
    },

    ".workflow-date": {
      color: theme.palette.grey[100],
      fontSize: "0.75rem",
      marginLeft: "auto",
      flexShrink: 0
    },

    ".example-grid": {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
      gap: theme.spacing(2)
    },

    ".example-card": {
      position: "relative",
      cursor: "pointer",
      borderRadius: theme.spacing(1),
      overflow: "hidden",
      backgroundColor: "var(--palette-grey-800)",
      "&:hover": {
        opacity: 0.9
      },
      ".example-description-tooltip": {
        visibility: "hidden",
        width: "200px",
        backgroundColor: theme.palette.grey[1000],
        color: theme.palette.grey[0],
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
          borderColor: `${theme.palette.grey[1000]} transparent transparent transparent`
        }
      },
      "&:hover .example-description-tooltip": {
        visibility: "visible",
        opacity: 1
      }
    },

    ".example-image": {
      width: "100%",
      height: "180px",
      objectFit: "cover",
      backgroundColor: theme.palette.grey[600]
    },

    ".example-name": {
      padding: ".2em .5em .5em 0",
      color: theme.palette.grey[0],
      backgroundColor: theme.palette.grey[800],
      fontSize: "var(--fontSizeSmall)"
    },

    ".header-controls": {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: theme.spacing(3)
    },

    ".create-button": {
      padding: ".3em 1em",
      backgroundColor: theme.palette.grey[600],
      color: theme.palette.grey[0],
      "&:hover": {
        backgroundColor: theme.palette.grey[500]
      }
    },

    ".sort-toggle": {
      "& .MuiToggleButton-root": {
        lineHeight: "1.2em",
        color: theme.palette.grey[200],
        borderColor: theme.palette.grey[500],
        "&.Mui-selected": {
          backgroundColor: theme.palette.grey[500],
          color: theme.palette.grey[0]
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
    "@media (max-width: 1400px)": {
      "&": {
        gridTemplateColumns: "1fr 1fr",
        gridTemplateRows: "auto 1fr auto",
        gap: theme.spacing(3),
        padding: theme.spacing(3)
      },
      ".examples-section": {
        gridRow: "1",
        gridColumn: "1 / -1"
      },
      ".threads-section": {
        gridRow: "2",
        gridColumn: "1"
      },
      ".workflows-section": {
        gridRow: "2",
        gridColumn: "2"
      },
    },

    "@media (max-width: 900px)": {
      "&": {
        gridTemplateColumns: "1fr",
        gridTemplateRows: "repeat(4, auto)",
        gap: theme.spacing(2)
      },
      ".examples-section": {
        gridRow: "1",
        gridColumn: "1"
      },
      ".threads-section": {
        gridRow: "2",
        gridColumn: "1"
      },
      ".workflows-section": {
        gridRow: "3",
        gridColumn: "1"
      },
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
  const theme = useTheme();
  const navigate = useNavigate();
  const settings = useSettingsStore((state) => state.settings);
  const setWorkflowOrder = useSettingsStore((state) => state.setWorkflowOrder);
  const createNewWorkflow = useWorkflowManager((state) => state.createNew);
  const { currentWorkflowId } = useWorkflowManager((state) => ({
    currentWorkflowId: state.currentWorkflowId
  }));
  const loadExamples = useWorkflowManager((state) => state.loadExamples);
  const createWorkflow = useWorkflowManager((state) => state.create);

  const [loadingExampleId, setLoadingExampleId] = useState<string | null>(null);

  const {
    connect,
    disconnect,
    status,
    sendMessage,
    createNewThread,
    switchThread,
    getCurrentMessages,
    threads,
    currentThreadId,
    deleteThread
  } = useGlobalChatStore();

  const messages = getCurrentMessages();

  // Handle WebSocket connection lifecycle
  useEffect(() => {
    // Connect on mount if not already connected
    if (status === "disconnected") {
      connect().catch((error) => {
        console.error("Failed to connect to chat service:", error);
      });
    }

    return () => {
      // Disconnect on unmount
      disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency array - only run on mount/unmount

  // Monitor connection state and reconnect when disconnected or failed
  useEffect(() => {
    let reconnectTimer: NodeJS.Timeout | null = null;

    const attemptReconnect = () => {
      if (status === "disconnected" || status === "failed") {
        console.log(
          "Dashboard: Connection lost, attempting automatic reconnect..."
        );
        connect().catch((error) => {
          console.error("Dashboard: Automatic reconnect failed:", error);
        });
      }
    };

    // Check connection state periodically
    if (status === "disconnected" || status === "failed") {
      // Initial reconnect attempt after 2 seconds
      reconnectTimer = setTimeout(attemptReconnect, 2000);
    }

    return () => {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
    };
  }, [status, connect]);

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

  const currentWorkflow = workflowsData?.workflows.find(
    (workflow) => workflow.id === currentWorkflowId
  );

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

  const handleOrderChange = (_: any, newOrder: any) => {
    if (newOrder !== null) {
      setWorkflowOrder(newOrder);
    }
  };

  const handleViewAllExamples = () => {
    navigate("/examples");
  };

  const handleThreadSelect = (threadId: string) => {
    switchThread(threadId);
    navigate(`/chat/${threadId}`);
  };

  const handleNewThread = () => {
    const newThreadId = createNewThread();
    navigate(`/chat/${newThreadId}`);
  };

  const getThreadPreview = (threadId: string) => {
    const thread = threads[threadId];
    if (!thread || thread.messages.length === 0) {
      return "No messages yet";
    }

    const firstUserMessage = thread.messages.find((m) => m.role === "user");
    const preview = firstUserMessage?.content
      ? typeof firstUserMessage.content === "string"
        ? firstUserMessage.content
        : "Chat started"
      : "Chat started";

    return truncateString(preview, 100);
  };

  return (
    <Box css={styles}>
      {/* Start Examples Section */}
      <Box className="section examples-section">
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center"
          }}
        >
          <Typography variant="h2" className="section-title">
            Examples
          </Typography>
          {currentWorkflowId && <BackToEditorButton />}
        </Box>
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

      {/* Recent Threads Section */}
      <Box className="section threads-section">
        <Typography variant="h2" className="section-title">
          Recent Chats
        </Typography>
        <Box className="content-scrollable">
          <ThreadList
            threads={Object.fromEntries(
              Object.entries(threads)
                .sort(([, a], [, b]) => b.updatedAt.localeCompare(a.updatedAt))
                .slice(0, 5)
            )}
            currentThreadId={currentThreadId}
            onNewThread={handleNewThread}
            onSelectThread={handleThreadSelect}
            onDeleteThread={deleteThread}
            getThreadPreview={getThreadPreview}
          />
        </Box>
      </Box>

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
    </Box>
  );
};

export default Dashboard;
