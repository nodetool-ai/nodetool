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
import { isEqual } from "lodash";
import { memo, useCallback, useContext } from "react";
import type { CSSProperties, ReactNode } from "react";
import type { XYPosition, Node as ReactFlowNode } from "@xyflow/react";
import AssetGrid from "../assets/AssetGrid";
import WorkflowList from "../workflows/WorkflowList";
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
// import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import PanelResizeButton from "./PanelResizeButton";
import { Fullscreen } from "@mui/icons-material";
import { getShortcutTooltip } from "../../config/shortcuts";
import SupportAgentIcon from "@mui/icons-material/SupportAgent";
import ImageIcon from "@mui/icons-material/Image";
import RecordVoiceOverIcon from "@mui/icons-material/RecordVoiceOver";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";

const PANEL_WIDTH_COLLAPSED = "52px";

const styles = (theme: Theme) =>
  css({
    position: "absolute",
    left: "0",
    ".panel-container": {
      flexShrink: 0,
      position: "absolute",
      backgroundColor: theme.vars.palette.background.default
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
      backgroundColor: theme.vars.palette.background.default
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
        color: "var(--palette-grey-200)",
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
      color: theme.vars.palette.grey[100]
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
        backgroundColor: "var(--palette-background-default)",
        // Make icons smaller within toolbar buttons
        "& svg": {
          fontSize: "1.125rem",
          color: theme.vars.palette.grey[100]
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
      gap: 6,
      padding: "12px 10px",
      marginTop: "6px",
      borderRadius: "16px",
      background: "rgba(16, 18, 28, 0.14)",
      border: `1px solid ${theme.vars.palette.grey[800]}33`,
      boxShadow: "0 6px 20px rgba(0, 0, 0, 0.18)",
      backdropFilter: "blur(12px)",
      WebkitBackdropFilter: "blur(12px)"
    },
    ".quick-actions-group .quick-add-button": {
      width: "40px",
      height: "40px",
      borderRadius: "12px",
      padding: "6px",
      position: "relative",
      overflow: "hidden",
      background: "var(--quick-gradient, rgba(28, 30, 38, 0.1))",
      border: `1px solid ${theme.vars.palette.grey[700]}30`,
      boxShadow:
        "var(--quick-shadow, 0 3px 12px rgba(0, 0, 0, 0.22), inset 0 0 0 1px rgba(255,255,255,0.04))",
      color: theme.vars.palette.grey[100],
      transition: "all 0.28s cubic-bezier(0.34, 1.56, 0.64, 1)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      backdropFilter: "blur(12px)",
      WebkitBackdropFilter: "blur(12px)",

      "& svg": {
        fontSize: "1.3rem",
        color: "var(--quick-icon-color, #f5f7ff)",
        position: "relative",
        zIndex: 1
      },

      "&::before": {
        content: '""',
        position: "absolute",
        inset: 0,
        borderRadius: "inherit",
        background:
          "linear-gradient(135deg, rgba(255,255,255,0.28), transparent 45%)",
        opacity: 0.32,
        pointerEvents: "none",
        mixBlendMode: "screen"
      },

      "&::after": {
        content: '""',
        position: "absolute",
        inset: 0,
        borderRadius: "inherit",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.22)",
        pointerEvents: "none"
      },

      "&:hover": {
        transform: "translateY(-2px) scale(1.04)",
        background: "var(--quick-hover-gradient, rgba(42, 46, 60, 0.16))",
        boxShadow:
          "var(--quick-shadow-hover, 0 10px 20px rgba(0,0,0,0.28), 0 0 16px rgba(56,189,248,0.18))",
        borderColor: "var(--quick-border-hover, rgba(255,255,255,0.2))"
      },

      "&:active": {
        transform: "scale(0.96)",
        boxShadow: "0 4px 12px rgba(0,0,0,0.4)"
      }
    },
    ".quick-actions-divider": {
      width: "24px",
      height: "1px",
      margin: "4px auto",
      background: theme.vars.palette.grey[800],
      opacity: 0.6
    },
    ".help-chat": {
      "& .MuiButton-root": {
        whiteSpace: "normal",
        wordWrap: "break-word",
        textTransform: "none",
        maxWidth: "160px",
        borderColor: theme.vars.palette.grey[200],
        color: theme.vars.palette.grey[200],
        margin: "0.5em",
        padding: "0.5em 1em",
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

  const getViewportCenter = useCallback((): XYPosition => {
    if (!nodeStore || typeof window === "undefined") {
      return { x: 0, y: 0 };
    }
    const { viewport } = nodeStore.getState();
    const { innerWidth, innerHeight } = window;
    if (!viewport) {
      return { x: 0, y: 0 };
    }
    const { x, y, zoom } = viewport;
    const centerX = innerWidth / 2;
    const centerY = innerHeight / 2;

    return {
      x: (centerX - x) / zoom,
      y: (centerY - y) / zoom
    };
  }, [nodeStore]);

  const computePlacementPosition = useCallback((): XYPosition => {
    const basePosition = getViewportCenter();
    if (!nodeStore) {
      return basePosition;
    }

    const { nodes } = nodeStore.getState();
    if (!nodes || nodes.length === 0) {
      return basePosition;
    }

    const spacingX = 240;
    const spacingY = 180;

    const candidateOffsets: Array<{ offset: XYPosition; distance: number }> =
      [];
    const maxRadius = 3;
    for (let y = -maxRadius; y <= maxRadius; y++) {
      for (let x = -maxRadius; x <= maxRadius; x++) {
        const distance = Math.abs(x) + Math.abs(y);
        candidateOffsets.push({
          offset: { x: x * spacingX, y: y * spacingY },
          distance
        });
      }
    }

    candidateOffsets.sort((a, b) => a.distance - b.distance);

    const isPositionFree = (candidate: XYPosition) => {
      const horizontalBuffer = spacingX * 0.6;
      const verticalBuffer = spacingY * 0.6;

      return nodes.every((node: ReactFlowNode<any>) => {
        const pos = node.position ?? { x: 0, y: 0 };
        const nodeWidth = node.width ?? 200;
        const nodeHeight = node.height ?? 140;

        const deltaX = Math.abs(candidate.x - pos.x);
        const deltaY = Math.abs(candidate.y - pos.y);

        const minX = nodeWidth / 2 + horizontalBuffer;
        const minY = nodeHeight / 2 + verticalBuffer;

        return deltaX >= minX || deltaY >= minY;
      });
    };

    for (const { offset } of candidateOffsets) {
      const candidate = {
        x: basePosition.x + offset.x,
        y: basePosition.y + offset.y
      };
      if (isPositionFree(candidate)) {
        return candidate;
      }
    }

    const fallbackOffset = nodes.length + 1;
    return {
      x: basePosition.x + fallbackOffset * (spacingX / 2),
      y: basePosition.y + fallbackOffset * (spacingY / 2)
    };
  }, [getViewportCenter, nodeStore]);

  const handleAddNode = useCallback(
    (nodeType: string) => {
      if (!nodeStore) {
        return;
      }
      const metadata = getMetadata(nodeType);
      if (!metadata) {
        console.warn(`Metadata not found for node type: ${nodeType}`);
        return;
      }
      const store = nodeStore.getState();
      const position = computePlacementPosition();
      const newNode = store.createNode(metadata, position);
      store.addNode(newNode);
    },
    [nodeStore, getMetadata, computePlacementPosition]
  );

  const quickActionsAvailable = Boolean(nodeStore);

  type QuickActionButton = {
    key: string;
    label: string;
    nodeType: string;
    icon: ReactNode;
    gradient: string;
    hoverGradient: string;
    shadow: string;
    hoverShadow?: string;
    iconColor: string;
  };

  const quickActionButtons: QuickActionButton[] = [
    {
      key: "agent",
      label: "Add Agent",
      nodeType: "nodetool.agents.Agent",
      icon: <SupportAgentIcon />,
      gradient:
        "linear-gradient(135deg, rgba(79, 70, 229, 0.48), rgba(124, 58, 237, 0.32))",
      hoverGradient:
        "linear-gradient(135deg, rgba(99, 102, 241, 0.6), rgba(139, 92, 246, 0.42))",
      shadow: "0 6px 16px rgba(99, 102, 241, 0.28)",
      hoverShadow:
        "0 10px 26px rgba(99, 102, 241, 0.38), 0 0 20px rgba(79, 70, 229, 0.26)",
      iconColor: "#eef2ff"
    },
    {
      key: "text-to-image",
      label: "Add Text to Image",
      nodeType: "nodetool.image.TextToImage",
      icon: <ImageIcon />,
      gradient:
        "linear-gradient(135deg, rgba(249, 115, 22, 0.45), rgba(236, 72, 153, 0.32))",
      hoverGradient:
        "linear-gradient(135deg, rgba(251, 146, 60, 0.55), rgba(244, 114, 182, 0.42))",
      shadow: "0 6px 16px rgba(249, 115, 22, 0.28)",
      hoverShadow:
        "0 10px 26px rgba(236, 72, 153, 0.38), 0 0 20px rgba(249, 115, 22, 0.24)",
      iconColor: "#fff5f5"
    },
    {
      key: "text-to-speech",
      label: "Add Text to Speech",
      nodeType: "nodetool.audio.TextToSpeech",
      icon: <RecordVoiceOverIcon />,
      gradient:
        "linear-gradient(135deg, rgba(34, 211, 238, 0.45), rgba(59, 130, 246, 0.32))",
      hoverGradient:
        "linear-gradient(135deg, rgba(45, 212, 191, 0.55), rgba(96, 165, 250, 0.42))",
      shadow: "0 6px 16px rgba(34, 211, 238, 0.24)",
      hoverShadow:
        "0 10px 24px rgba(59, 130, 246, 0.32), 0 0 18px rgba(34, 211, 238, 0.2)",
      iconColor: "#e6f6ff"
    },
    {
      key: "image-to-image",
      label: "Add Image to Image",
      nodeType: "nodetool.image.ImageToImage",
      icon: <AutoFixHighIcon />,
      gradient:
        "linear-gradient(135deg, rgba(168, 85, 247, 0.45), rgba(34, 211, 238, 0.28))",
      hoverGradient:
        "linear-gradient(135deg, rgba(192, 132, 252, 0.55), rgba(56, 189, 248, 0.38))",
      shadow: "0 6px 16px rgba(168, 85, 247, 0.26)",
      hoverShadow:
        "0 10px 26px rgba(168, 85, 247, 0.36), 0 0 20px rgba(34, 211, 238, 0.22)",
      iconColor: "#f8f5ff"
    }
  ];

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

      {quickActionsAvailable && (
        <>
          <div className="quick-actions-divider" />
          <div className="quick-actions-group">
            {quickActionButtons.map(
              ({
                key,
                label,
                nodeType,
                icon,
                gradient,
                hoverGradient,
                shadow,
                hoverShadow = shadow,
                iconColor
              }) => (
                <Tooltip
                  key={key}
                  title={label}
                  placement="right-start"
                  enterDelay={TOOLTIP_ENTER_DELAY}
                >
                  <IconButton
                    tabIndex={-1}
                    onClick={() => handleAddNode(nodeType)}
                    className="quick-add-button"
                    style={
                      {
                        "--quick-gradient": gradient,
                        "--quick-hover-gradient": hoverGradient,
                        "--quick-shadow": shadow,
                        "--quick-shadow-hover": hoverShadow ?? shadow,
                        "--quick-icon-color": iconColor
                      } as CSSProperties
                    }
                  >
                    {icon}
                  </IconButton>
                </Tooltip>
              )
            )}
          </div>
        </>
      )}

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
    if (!threads) return "Loading...";
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
            boxShadow: isVisible
              ? theme.palette.mode === "dark"
                ? `0 14px 32px rgba(0,0,0,0.85), 0 4px 14px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.14), 0 0 24px ${theme.vars.palette.primary.main}33`
                : "0 8px 24px rgba(16,24,40,0.14), 0 2px 8px rgba(16,24,40,0.08)"
              : "none",
            backgroundColor: isVisible
              ? "var(--palette-background-default)"
              : "transparent",
            borderRight: isVisible
              ? `1px solid ${theme.vars.palette.grey[800]}`
              : "none",
            borderTop: isVisible
              ? `1px solid ${theme.vars.palette.grey[800]}`
              : "none",
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
