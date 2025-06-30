/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { Drawer, IconButton, Tooltip, Box, Button } from "@mui/material";
import { useResizePanel } from "../../hooks/handlers/useResizePanel";
import { useCombo } from "../../stores/KeyPressedStore";
import { isEqual } from "lodash";
import { memo, useCallback } from "react";
import AssetGrid from "../assets/AssetGrid";
import WorkflowList from "../workflows/WorkflowList";
import { IconForType } from "../../config/data_types";
import { LeftPanelView, usePanelStore } from "../../stores/PanelStore";
import CollectionList from "../collections/CollectionList";
import { ContextMenuProvider } from "../../providers/ContextMenuProvider";
import { useLocation } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import PackageList from "../packages/PackageList";
import ThreadList from "../chat/thread/ThreadList";
import useGlobalChatStore from "../../stores/GlobalChatStore";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
// Icons
import CodeIcon from "@mui/icons-material/Code";
import ChatIcon from "@mui/icons-material/Chat";
import GridViewIcon from "@mui/icons-material/GridView";
import WidgetsIcon from "@mui/icons-material/Widgets";
import { Fullscreen } from "@mui/icons-material";

const PANEL_WIDTH_COLLAPSED = "52px";

const styles = (theme: any) =>
  css({
    position: "absolute",
    left: "0",
    ".panel-container": {
      flexShrink: 0,
      position: "absolute"
    },
    ".panel-left": {
      border: "none",
      direction: "ltr",
      position: "absolute",
      overflow: "hidden",
      width: "100%",
      padding: "0",
      top: "72px",
      height: "calc(-72px + 100vh)"
    },

    ".panel-button": {
      position: "absolute",
      zIndex: 1200,
      left: "unset",
      right: "unset",
      width: "40px",
      height: "calc(100vh - 75px)",
      backgroundColor: "transparent",
      border: 0,
      borderRadius: 0,
      top: "72px",
      cursor: "e-resize",
      transition: "background-color 0.3s ease",

      "& svg": {
        fontSize: "0.8em !important",
        color: "var(--palette-grey-200)",
        opacity: 0,
        marginLeft: "1px",
        transition: "all 0.5s ease"
      },

      "&:hover": {
        backgroundColor: "#33333344",
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
      color: theme.palette.grey[100]
    },
    ".messages": {
      overflowY: "auto"
    },
    ".vertical-toolbar": {
      width: "50px",
      display: "flex",
      flexDirection: "column",
      backgroundColor: "transparent",
      "& .MuiIconButton-root, .MuiButton-root": {
        padding: "14px",
        borderRadius: "5px",
        position: "relative",
        transition: "all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",

        "&.active": {
          backgroundColor: `${theme.palette.action.selected}88`
        },
        "&.active svg": {
          color: theme.palette.primary.main
        },
        "&:hover": {
          backgroundColor: `${theme.palette.action.hover}88`,
          boxShadow: `0 0 15px ${theme.palette.action.hover}40`,
          "&::after": {
            content: '""',
            position: "absolute",
            left: 0,
            top: 0,
            right: 0,
            bottom: 0,
            background: `linear-gradient(135deg, ${theme.palette.primary.main}20, transparent)`,
            borderRadius: "2px"
          }
        }
      }
    },
    ".help-chat": {
      "& .MuiButton-root": {
        whiteSpace: "normal",
        wordWrap: "break-word",
        textTransform: "none",
        maxWidth: "160px",
        borderColor: theme.palette.grey[200],
        color: theme.palette.grey[200],
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
  const navigate = useNavigate();
  const path = useLocation().pathname;
  const panelVisible = usePanelStore((state) => state.panel.isVisible);

  return (
    <div className="vertical-toolbar">
      <Tooltip
        title={
          <div className="tooltip-span">
            <div className="tooltip-title">Chat</div>
            <div className="tooltip-key">Key&nbsp;1</div>
          </div>
        }
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
            <div className="tooltip-key">Key&nbsp;2</div>
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
        title={
          <div className="tooltip-span">
            <div className="tooltip-title">Assets</div>
            <div className="tooltip-key">Key&nbsp;3</div>
          </div>
        }
        placement="right-start"
        enterDelay={TOOLTIP_ENTER_DELAY}
      >
        <Button
          tabIndex={-1}
          onClick={() => onViewChange("assets")}
          className={activeView === "assets" && panelVisible ? "active" : ""}
        >
          <IconForType
            iconName="asset"
            showTooltip={false}
            containerStyle={{
              borderRadius: "0 0 3px 0",
              marginLeft: "0.1em",
              marginTop: "0",
              color: "white"
            }}
            bgStyle={{
              backgroundColor: "transparent",
              width: "20px",
              height: "20px"
            }}
          />
        </Button>
      </Tooltip>
      <Tooltip
        title={
          <div className="tooltip-span">
            <div className="tooltip-title">Collections</div>
            <div className="tooltip-key">Key&nbsp;4</div>
          </div>
        }
        placement="right-start"
        enterDelay={TOOLTIP_ENTER_DELAY}
      >
        <IconButton
          tabIndex={-1}
          onClick={() => onViewChange("collections")}
          className={
            activeView === "collections" && panelVisible ? "active" : ""
          }
        >
          <IconForType
            iconName="database"
            showTooltip={false}
            containerStyle={{
              color: "white"
            }}
          />
        </IconButton>
      </Tooltip>
      <Tooltip
        title={
          <div className="tooltip-span">
            <div className="tooltip-title">Packs</div>
            <div className="tooltip-key">Key&nbsp;5</div>
          </div>
        }
        placement="right-start"
        enterDelay={TOOLTIP_ENTER_DELAY}
      >
        <IconButton
          tabIndex={-1}
          className={`toolbar-button ${activeView === "packs" ? "active" : ""}`}
          onClick={() => onViewChange("packs")}
        >
          <WidgetsIcon />
        </IconButton>
      </Tooltip>

      <div style={{ flexGrow: 1 }} />
      <Tooltip title="Toggle Panel" placement="right-start">
        <IconButton tabIndex={-1} onClick={handlePanelToggle}>
          <CodeIcon />
        </IconButton>
      </Tooltip>
    </div>
  );
});

const PanelContent = memo(function PanelContent({
  activeView
}: {
  activeView: string;
}) {
  const navigate = useNavigate();
  const path = useLocation().pathname;

  const {
    threads,
    currentThreadId,
    createNewThread,
    switchThread,
    deleteThread
  } = useGlobalChatStore();

  const handleNewChat = () => {
    createNewThread();
    navigate("/chat");
    usePanelStore.getState().setVisibility(false);
  };

  const handleSelectThread = (id: string) => {
    switchThread(id);
    navigate(`/chat/${id}`);
    usePanelStore.getState().setVisibility(false);
  };

  const handleDeleteThread = (id: string) => {
    deleteThread(id);
  };

  const getThreadPreview = (threadId: string) => {
    if (!threads) return "Loading...";
    const thread = threads[threadId];
    if (!thread || thread.messages.length === 0) {
      return "Empty conversation";
    }

    const firstUserMessage = thread.messages.find((msg) => msg.role === "user");
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
            threads={threads}
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
            margin: "0"
          }}
        >
          <h3 style={{ paddingLeft: "1em" }}>Workflows</h3>
          <WorkflowList />
        </Box>
      )}
      {activeView === "collections" && (
        <Box
          sx={{
            width: "100%",
            height: "100%",
            overflow: "hidden auto",
            margin: "0 20px"
          }}
        >
          <h3>Collections</h3>
          <CollectionList />
        </Box>
      )}
      {activeView === "packs" && (
        <Box
          sx={{
            width: "100%",
            height: "100%",
            overflow: "auto",
            margin: "0 20px"
          }}
        >
          <h3>Packs</h3>
          <PackageList />
        </Box>
      )}
    </>
  );
});

const PanelLeft: React.FC = () => {
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
  useCombo(["4"], () => handlePanelToggle("collections"), false);
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
      css={styles}
      className="panel-container"
      style={{ width: isVisible ? `${panelSize}px` : "60px" }}
    >
      <IconButton
        disableRipple={true}
        className={"panel-button panel-button-left"}
        edge="start"
        color="inherit"
        aria-label="menu"
        tabIndex={-1}
        onMouseDown={(e) => {
          e.stopPropagation();
          handleMouseDown(e);
        }}
        style={{
          left: isVisible ? `${Math.max(panelSize + 14, 25)}px` : "0px"
        }}
      >
        <CodeIcon />
      </IconButton>
      <Drawer
        PaperProps={{
          ref: panelRef,
          className: `panel panel-left ${isDragging ? "dragging" : ""}`,
          style: {
            // borderRight: isVisible ? "1px solid var(--palette-grey-600)" : "none",
            boxShadow: isVisible ? "0 4px 10px rgba(0, 0, 0, 0.8)" : "none",
            width: isVisible ? `${panelSize}px` : PANEL_WIDTH_COLLAPSED
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
            {isVisible && <PanelContent activeView={activeView} />}
          </ContextMenuProvider>
        </div>
      </Drawer>
    </div>
  );
};

export default memo(PanelLeft, isEqual);
