/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import {
  Drawer,
  IconButton,
  Tooltip,
  Box,
  Button,
  useMediaQuery
} from "@mui/material";
import { useResizePanel } from "../../hooks/handlers/useResizePanel";
import { useCombo } from "../../stores/KeyPressedStore";
import isEqual from "lodash/isEqual";
import { memo, useCallback, useContext } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import type { XYPosition, Node as ReactFlowNode } from "@xyflow/react";
import AssetGrid from "../assets/AssetGrid";
import WorkflowList from "../workflows/WorkflowList";
import WorkspaceTree from "../workspaces/WorkspaceTree";
import { IconForType } from "../../config/data_types";
import { LeftPanelView, usePanelStore } from "../../stores/PanelStore";
import { ContextMenuProvider } from "../../providers/ContextMenuProvider";
import { useLocation } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import ThreadList from "../chat/thread/ThreadList";
import useGlobalChatStore from "../../stores/GlobalChatStore";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import ThemeToggle from "../ui/ThemeToggle";
import { NodeContext } from "../../contexts/NodeContext";
import useMetadataStore from "../../stores/MetadataStore";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
// Icons
import CodeIcon from "@mui/icons-material/Code";
import ChatIcon from "@mui/icons-material/Chat";
import GridViewIcon from "@mui/icons-material/GridView";
import FolderIcon from "@mui/icons-material/Folder";
// import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import PanelResizeButton from "./PanelResizeButton";
import { Fullscreen } from "@mui/icons-material";
import { getShortcutTooltip } from "../../config/shortcuts";
import QuickActions, { QuickActionDefinition } from "./QuickActions";
import useNodePlacementStore from "../../stores/NodePlacementStore";
import { useNotificationStore } from "../../stores/NotificationStore";
import { useRunningJobs } from "../../hooks/useRunningJobs";
import WorkHistoryIcon from "@mui/icons-material/WorkHistory";
import { List, ListItem, ListItemText, ListItemIcon, CircularProgress } from "@mui/material";
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';

const PANEL_WIDTH_COLLAPSED = "52px";

const styles = (theme: Theme) =>
  css({
    position: "absolute",
    left: "0",
    ".panel-container": {
      flexShrink: 0,
      position: "absolute",
      backgroundColor: "transparent"
    },
    ".panel-left": {
      border: "none",
      direction: "ltr",
      position: "absolute",
      overflow: "hidden",
      width: "100%",
      padding: "0",
      top: "80px",
      height: "calc(100vh - 80px)",
      // Light mode defaults
      borderRight: "1px solid rgba(0, 0, 0, 0.06)",
      borderTop: "1px solid rgba(0, 0, 0, 0.06)",
      boxShadow: "0 8px 24px rgba(16,24,40,0.14), 0 2px 8px rgba(16,24,40,0.08)",

      // Dark mode overrides
      "[data-mui-color-scheme='dark'] &": {
        backgroundColor: "rgba(18, 18, 18, 0.6)",
        borderRight: "1px solid rgba(255, 255, 255, 0.08)",
        borderTop: "1px solid rgba(255, 255, 255, 0.08)",
        boxShadow: `0 14px 32px rgba(0,0,0,0.85), 0 4px 14px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.14), 0 0 24px ${theme.vars.palette.primary.main}33`
      }
    },
    ".panel-button": {
      position: "absolute",
      zIndex: 1200,
      left: "unset",
      right: "unset",
      width: "36px",
      height: "calc(100vh - 83px)",
      backgroundColor: "transparent",
      border: 0,
      borderRadius: 0,
      top: "80px",
      cursor: "e-resize",
      transition: "background-color 0.3s ease",
      "&::before": {
        content: '""',
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        width: "4px",
        height: "24px",
        borderRadius: "2px",
        backgroundColor: theme.vars.palette.grey[600],
        opacity: 0.5
      },

      "& svg": {
        fontSize: "0.8em !important",
        opacity: 0,
        marginLeft: "1px",
        transition: "all 0.5s ease"
      },

      "&:hover": {
        backgroundColor: `${theme.vars.palette.action.hover}55`,
        "&::before": {
          opacity: 0.8
        },
        "& svg": {
          opacity: 1,
          fontSize: "1em !important"
        }
      }
    },
    ".panel-tabs ": {
      minHeight: "2em"
    },
    ".panel-tabs button:hover:not(.Mui-selected)": {
      color: theme.vars.palette.grey[700],
      "[data-mui-color-scheme='dark'] &": {
        color: theme.vars.palette.grey[100]
      }
    },
    ".messages": {
      overflowY: "auto"
    },
    ".vertical-toolbar": {
      width: "50px",
      display: "flex",
      flexDirection: "column",
      gap: 6,
      backgroundColor: "transparent",
      // Ensure custom SVG icons (IconForType) are sized like MUI icons
      "& .icon-container": {
        width: "18px",
        height: "18px"
      },
      // Give a little extra top spacing to the very first icon button
      "& .MuiIconButton-root:first-of-type, & .MuiButton-root:first-of-type": {
        marginTop: "8px"
      },
      "& .MuiIconButton-root, .MuiButton-root": {
        padding: "12px",
        borderRadius: "8px",
        position: "relative",
        transition: "all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
        willChange: "transform, box-shadow",
        backgroundColor: "transparent",
        // Make icons smaller within toolbar buttons
        "& svg": {
          fontSize: "1.125rem",
          "[data-mui-color-scheme='dark'] &": {
            color: theme.vars.palette.grey[100]
          }
        },

        "&.active": {
          backgroundColor: `${theme.vars.palette.action.selected}66`,
          boxShadow: `0 0 0 1px ${theme.vars.palette.primary.main}44 inset`
        },
        "&.active svg": {
          color: theme.vars.palette.primary.main
        },
        "&:hover": {
          backgroundColor: `${theme.vars.palette.action.hover}66`,
          boxShadow: `0 4px 18px ${theme.vars.palette.action.hover}30`,
          transform: "scale(1.02)",
          "&::after": {
            content: '""',
            position: "absolute",
            left: 0,
            top: 0,
            right: 0,
            bottom: 0,
            background: `linear-gradient(135deg, ${theme.vars.palette.primary.main}20, transparent)`,
            borderRadius: "8px"
          },
          "& svg, & .icon-container svg": {
            transform: "scale(1.05)",
            filter: `drop-shadow(0 0 6px ${theme.vars.palette.primary.main}33)`
          }
        },
        "&:active": {
          transform: "scale(0.98)",
          boxShadow: `0 2px 10px ${theme.vars.palette.action.hover}24`
        }
      }
    },
    ".quick-actions-group": {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 8,
      padding: "14px 10px",
      marginTop: "8px",
      borderRadius: "20px",
      backgroundColor: "rgba(255, 255, 255, 0.4)",
      border: "1px solid rgba(0, 0, 0, 0.05)",
      boxShadow: "0 4px 16px rgba(0, 0, 0, 0.05), inset 0 0 0 1px rgba(255, 255, 255, 0.5)",
      backdropFilter: "blur(16px)",
      WebkitBackdropFilter: "blur(16px)",

      "[data-mui-color-scheme='dark'] &": {
        backgroundColor: "rgba(10, 12, 18, 0.3)",
        border: "1px solid rgba(255, 255, 255, 0.06)",
        boxShadow: "0 8px 32px rgba(0, 0, 0, 0.24), inset 0 0 0 1px rgba(255, 255, 255, 0.03)"
      }
    },
    ".quick-actions-group .quick-add-button": {
      width: "42px",
      height: "42px",
      borderRadius: "14px",
      padding: "0",
      position: "relative",
      overflow: "hidden",
      background: "var(--quick-gradient, rgba(255, 255, 255, 0.4))",
      border: "1px solid rgba(0, 0, 0, 0.06)",
      boxShadow: "var(--quick-shadow, 0 2px 8px rgba(0, 0, 0, 0.06))",
      color: theme.vars.palette.grey[800],

      transition: "all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      backdropFilter: "blur(8px)",
      WebkitBackdropFilter: "blur(8px)",

      "[data-mui-color-scheme='dark'] &": {
        background: "var(--quick-gradient, rgba(255, 255, 255, 0.03))",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        boxShadow: "var(--quick-shadow, 0 2px 8px rgba(0, 0, 0, 0.16))",
        color: theme.vars.palette.grey[100]
      },

      "& svg": {
        fontSize: "1.4rem",
        color: `var(--quick-icon-color, ${theme.vars.palette.grey[800]})`,
        position: "relative",
        zIndex: 1,
        filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.2))",
        transition: "transform 0.3s ease",

        "[data-mui-color-scheme='dark'] &": {
          color: "var(--quick-icon-color, #fff)"
        }
      },

      "&::before": {
        content: '""',
        position: "absolute",
        inset: 0,
        borderRadius: "inherit",
        background:
          "linear-gradient(180deg, rgba(255,255,255,0.16), transparent 60%)",
        opacity: 0.6,
        pointerEvents: "none",
        mixBlendMode: "overlay"
      },

      "&::after": {
        content: '""',
        position: "absolute",
        inset: 0,
        borderRadius: "inherit",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.2)",
        pointerEvents: "none",
        opacity: 0.8
      },

      "&:hover": {
        transform: "translateY(-3px) scale(1.05)",
        background: "var(--quick-hover-gradient, rgba(255, 255, 255, 0.08))",
        boxShadow:
          "var(--quick-shadow-hover, 0 12px 24px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.15))",
        borderColor: "rgba(255,255,255,0.25)",
        zIndex: 10,
        "& svg": {
          transform: "scale(1.1)"
        }
      },

      "&:active": {
        transform: "scale(0.96) translateY(0)",
        boxShadow: "0 2px 8px rgba(0,0,0,0.2)"
      },

      "&.active": {
        borderColor: `${theme.vars.palette.primary.main}`,
        boxShadow: `0 0 0 2px ${theme.vars.palette.primary.main}40, var(--quick-shadow)`,
        "& svg": {
          color: "#fff"
        }
      }
    },
    ".quick-actions-divider": {
      width: "24px",
      height: "1px",
      margin: "4px auto",
      background: theme.vars.palette.grey[300],
      opacity: 0.6,
      "[data-mui-color-scheme='dark'] &": {
        background: theme.vars.palette.grey[800]
      }
    },
    ".help-chat": {
      "& .MuiButton-root": {
        whiteSpace: "normal",
        wordWrap: "break-word",
        textTransform: "none",
        maxWidth: "160px",
        borderColor: theme.vars.palette.grey[400],
        color: theme.vars.palette.grey[700],
        margin: "0.5em",
        padding: "0.5em 1em",

        "[data-mui-color-scheme='dark'] &": {
          borderColor: theme.vars.palette.grey[200],
          color: theme.vars.palette.grey[200]
        },

        "&:hover": {
          borderColor: "var(--palette-primary-main)",
          color: "var(--palette-primary-main)"
        }
      }
    },
    ".panel-content": {
      display: "flex",
      flex: 1,
      height: "100%",
      border: "0"
    }
  });

const RunningJobsList = () => {
  const { data: jobs, isLoading, error } = useRunningJobs();

  if (isLoading) {return <div style={{ padding: "1em" }}>Loading...</div>;}
  if (error) {return <div style={{ padding: "1em" }}>Error loading jobs</div>;}
  if (!jobs?.length) {return <div style={{ padding: "1em" }}>No running jobs</div>;}

  return (
    <List>
      {jobs.map((job) => (
        <ListItem key={job.id}>
          <ListItemIcon>
            {job.status === 'running' ? (
               <CircularProgress size={24} />
            ) : job.status === 'queued' ? (
               <HourglassEmptyIcon />
            ) : (
               <PlayArrowIcon />
            )}
          </ListItemIcon>
          <ListItemText
            primary={job.job_type}
            secondary={`Status: ${job.status}`}
          />
        </ListItem>
      ))}
    </List>
  );
};

const VerticalToolbar = memo(function VerticalToolbar({
  activeView,
  onViewChange,
  handlePanelToggle
}: {
  activeView: string;
  onViewChange: (view: LeftPanelView) => void;
  handlePanelToggle: () => void;
}) {
  const theme = useTheme();
  const panelVisible = usePanelStore((state) => state.panel.isVisible);
  const nodeStoreFromContext = useContext(NodeContext);
  const getMetadata = useMetadataStore((state) => state.getMetadata);
  const { currentWorkflowId, getNodeStore } = useWorkflowManager((state) => ({
    currentWorkflowId: state.currentWorkflowId,
    getNodeStore: state.getNodeStore
  }));
  const nodeStore =
    nodeStoreFromContext ??
    (currentWorkflowId ? getNodeStore(currentWorkflowId) ?? null : null);

  return (
    <div className="vertical-toolbar">
      <Tooltip
        title={getShortcutTooltip("toggleChat")}
        placement="right-start"
        enterDelay={TOOLTIP_ENTER_DELAY}
      >
        <IconButton
          tabIndex={-1}
          onClick={() => onViewChange("chat")}
          className={activeView === "chat" && panelVisible ? "active" : ""}
        >
          <ChatIcon />
        </IconButton>
      </Tooltip>
      <Tooltip
        title={
          <div className="tooltip-span">
            <div className="tooltip-title">Workflows</div>
            <div className="tooltip-key">
              <kbd>2</kbd>
            </div>
          </div>
        }
        placement="right-start"
        enterDelay={TOOLTIP_ENTER_DELAY}
      >
        <IconButton
          tabIndex={-1}
          onClick={() => onViewChange("workflowGrid")}
          className={
            activeView === "workflowGrid" && panelVisible ? "active" : ""
          }
        >
          <GridViewIcon />
        </IconButton>
      </Tooltip>
      <Tooltip
        title={getShortcutTooltip("toggleAssets")}
        placement="right-start"
        enterDelay={TOOLTIP_ENTER_DELAY}
      >
        <IconButton
          tabIndex={-1}
          onClick={() => onViewChange("assets")}
          className={activeView === "assets" && panelVisible ? "active" : ""}
        >
          <IconForType iconName="asset" showTooltip={false} />
        </IconButton>
      </Tooltip>
      <Tooltip
        title={
          <div className="tooltip-span">
            <div className="tooltip-title">Workspace</div>
            <div className="tooltip-key">
              <kbd>4</kbd>
            </div>
          </div>
        }
        placement="right-start"
        enterDelay={TOOLTIP_ENTER_DELAY}
      >
        <IconButton
          tabIndex={-1}
          onClick={() => onViewChange("workspace")}
          className={activeView === "workspace" && panelVisible ? "active" : ""}
        >
          <FolderIcon />
        </IconButton>
      </Tooltip>
      <Tooltip
        title={
          <div className="tooltip-span">
            <div className="tooltip-title">Jobs</div>
          </div>
        }
        placement="right-start"
        enterDelay={TOOLTIP_ENTER_DELAY}
      >
        <IconButton
          tabIndex={-1}
          onClick={() => onViewChange("jobs")}
          className={activeView === "jobs" && panelVisible ? "active" : ""}
        >
          <WorkHistoryIcon />
        </IconButton>
      </Tooltip>

      <div style={{ flexGrow: 1 }} />
      <ThemeToggle />
      <Tooltip title="Toggle Panel" placement="right-start">
        <IconButton tabIndex={-1} onClick={handlePanelToggle}>
          <CodeIcon />
        </IconButton>
      </Tooltip>
    </div>
  );
});

const PanelContent = memo(function PanelContent({
  activeView,
  handlePanelToggle
}: {
  activeView: string;
  handlePanelToggle: (view: LeftPanelView) => void;
}) {
  const navigate = useNavigate();
  const path = useLocation().pathname;

  const {
    threads,
    currentThreadId,
    createNewThread,
    switchThread,
    deleteThread,
    messageCache
  } = useGlobalChatStore();

  const handleNewChat = () => {
    createNewThread()
      .then((newThreadId) => {
        switchThread(newThreadId);
        navigate(`/chat/${newThreadId}`);
        usePanelStore.getState().setVisibility(false);
      })
      .catch((error) => {
        console.error("Failed to create new thread:", error);
      });
  };

  const handleSelectThread = (id: string) => {
    switchThread(id);
    navigate(`/chat/${id}`);
    usePanelStore.getState().setVisibility(false);
  };

  const handleDeleteThread = (id: string) => {
    deleteThread(id).catch((error) => {
      console.error("Failed to delete thread:", error);
    });
  };

  const getThreadPreview = (threadId: string) => {
    if (!threads) {return "Loading...";}
    const thread = threads[threadId];
    if (!thread) {
      return "Empty conversation";
    }

    // Use thread title if available
    if (thread.title) {
      return thread.title;
    }

    // Check if we have cached messages for this thread
    const threadMessages = messageCache[threadId];
    if (!threadMessages || threadMessages.length === 0) {
      return "New conversation";
    }

    const firstUserMessage = threadMessages.find(
      (msg: any) => msg.role === "user"
    );
    if (firstUserMessage) {
      const content =
        typeof firstUserMessage.content === "string"
          ? firstUserMessage.content
          : Array.isArray(firstUserMessage.content) &&
            firstUserMessage.content[0]?.type === "text"
          ? (firstUserMessage.content[0] as any).text
          : "[Media message]";
      return content?.substring(0, 50) + (content?.length > 50 ? "..." : "");
    }

    return "New conversation";
  };

  // Create ThreadInfo compatible data for ThreadList
  const threadsWithMessages: Record<
    string,
    import("../chat/types/thread.types").ThreadInfo
  > = Object.fromEntries(
    Object.entries(threads).map(([id, thread]) => {
      const item: import("../chat/types/thread.types").ThreadInfo = {
        id: thread.id,
        title: (thread.title ?? undefined) as string | undefined,
        updatedAt: thread.updated_at,
        messages: messageCache[id] || []
      };
      return [id, item];
    })
  );

  return (
    <>
      {activeView === "chat" && (
        <Box
          sx={{
            width: "100%",
            height: "100%",
            overflow: "hidden",
            margin: "0"
          }}
        >
          <ThreadList
            threads={threadsWithMessages}
            currentThreadId={currentThreadId}
            onNewThread={handleNewChat}
            onSelectThread={handleSelectThread}
            onDeleteThread={handleDeleteThread}
            getThreadPreview={getThreadPreview}
          />
        </Box>
      )}
      {activeView === "assets" && (
        <Box
          className="assets-container"
          sx={{ width: "100%", height: "100%", margin: "0 20px" }}
        >
          <Tooltip title="Fullscreen" placement="right-start">
            <Button
              className={`${path === "/assets" ? "active" : ""}`}
              onClick={() => {
                navigate("/assets");
                handlePanelToggle("assets");
              }}
              tabIndex={-1}
              style={{
                float: "right",
                margin: "15px 0 0 0"
              }}
            >
              <Fullscreen />
            </Button>
          </Tooltip>
          <h3>Assets</h3>
          <AssetGrid maxItemSize={5} />
        </Box>
      )}
      {activeView === "workflowGrid" && (
        <Box
          sx={{
            width: "100%",
            height: "100%",
            overflow: "auto",
            margin: "10px 0"
          }}
        >
          <h3 style={{ paddingLeft: "1em" }}>Workflows</h3>
          <WorkflowList />
        </Box>
      )}
      {activeView === "workspace" && (
        <Box
          sx={{
            width: "100%",
            height: "100%",
            overflow: "hidden"
          }}
        >
          <WorkspaceTree />
        </Box>
      )}
      {activeView === "jobs" && (
        <Box
          sx={{
            width: "100%",
            height: "100%",
            overflow: "auto",
            margin: "10px 0"
          }}
        >
          <h3 style={{ paddingLeft: "1em" }}>Running Jobs</h3>
          <RunningJobsList />
        </Box>
      )}
    </>
  );
});

const PanelLeft: React.FC = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const {
    ref: panelRef,
    size: panelSize,
    isVisible,
    isDragging,
    handleMouseDown,
    handlePanelToggle
  } = useResizePanel("left");

  useCombo(["1"], () => handlePanelToggle("chat"), false);
  useCombo(["2"], () => handlePanelToggle("workflowGrid"), false);
  useCombo(["3"], () => handlePanelToggle("assets"), false);
  useCombo(["4"], () => handlePanelToggle("workspace"), false);

  useCombo(["5"], () => handlePanelToggle("packs"), false);

  const activeView =
    usePanelStore((state) => state.panel.activeView) || "workflowGrid";

  const onViewChange = useCallback(
    (view: LeftPanelView) => {
      handlePanelToggle(view);
    },
    [handlePanelToggle]
  );

  return (
    <div
      css={styles(theme)}
      className={`panel-container ${isVisible ? "panel-visible" : ""}`}
      style={{ width: isVisible ? `${panelSize}px` : "60px" }}
    >
      <PanelResizeButton
        side="left"
        isVisible={isVisible}
        panelSize={panelSize}
        onMouseDown={handleMouseDown}
      />
      <Drawer
        PaperProps={{
          ref: panelRef,
          className: `panel panel-left ${isDragging ? "dragging" : ""}`,
          style: {
            backdropFilter: isVisible ? "blur(12px)" : "none",
            backgroundColor: isVisible ? undefined : "transparent",
            borderRight: isVisible ? undefined : "none",
            borderTop: isVisible ? undefined : "none",
            boxShadow: isVisible ? undefined : "none",
            borderTopRightRadius: 0,
            borderBottomRightRadius: 0,
            width: isVisible
              ? `${
                  isMobile
                    ? Math.min(panelSize, Math.floor(window.innerWidth * 0.75))
                    : panelSize
                }px`
              : PANEL_WIDTH_COLLAPSED,
            maxWidth: isMobile ? "75vw" : "none",
            // Match the panel height to avoid any gap beneath the drawer
            height: isMobile ? "calc(100dvh - 56px)" : "calc(100vh - 80px)",
            contain: isMobile ? "layout style" : "none",
            boxSizing: "border-box",
            overflow: "hidden" // Prevent panel content from overflowing
          }
        }}
        variant="persistent"
        anchor="left"
        open={true}
      >
        <div className="panel-content">
          <ContextMenuProvider>
            <VerticalToolbar
              activeView={activeView}
              onViewChange={onViewChange}
              handlePanelToggle={() => handlePanelToggle(activeView)}
            />
            {isVisible && (
              <PanelContent
                activeView={activeView}
                handlePanelToggle={handlePanelToggle}
              />
            )}
          </ContextMenuProvider>
        </div>
      </Drawer>
    </div>
  );
};

export default memo(PanelLeft, isEqual);
