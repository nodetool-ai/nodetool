/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { Drawer, IconButton, Tooltip, Box, Button } from "@mui/material";
import { useResizePanel } from "../../hooks/handlers/useResizePanel";
import HelpChat from "../chat/HelpChat";
import { useCombo } from "../../stores/KeyPressedStore";
import { isEqual } from "lodash";
import { memo, useCallback } from "react";
import AssetGrid from "../assets/AssetGrid";
import WorkflowList from "../workflows/WorkflowList";
import { IconForType } from "../../config/data_types";
import { LeftPanelView, usePanelStore } from "../../stores/PanelStore";
import CollectionList from "../collections/CollectionList";
import { ContextMenuProvider } from "../../providers/ContextMenuProvider";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import ThemeNodetool from "../themes/ThemeNodetool";
import { useLocation } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import PackageList from "../packages/PackageList";
// Icons
import ExamplesIcon from "@mui/icons-material/Fluorescent";
import CodeIcon from "@mui/icons-material/Code";
import ChatIcon from "@mui/icons-material/Chat";
import GridViewIcon from "@mui/icons-material/GridView";
import WidgetsIcon from "@mui/icons-material/Widgets";
import { Fullscreen } from "@mui/icons-material";

const styles = (theme: any) =>
  css({
    ".panel-container": {
      flexShrink: 0,
      position: "absolute",
      backgroundColor: theme.palette.c_gray1
    },
    ".panel-left": {
      // boxShadow: "0 0 10px rgba(0, 0, 0, 0.3)",
      backgroundColor: "var(--c_gray1)",
      direction: "ltr",
      position: "absolute",
      overflowX: "hidden",
      overflowY: "auto",
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
        color: "var(--c_gray5)",
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
      color: theme.palette.c_gray6
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
          backgroundColor: `${theme.palette.action.selected}88`,
          boxShadow: `0 0 15px ${theme.palette.primary.main}40`,
          "&::before": {
            content: '""',
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: "3px",
            backgroundColor: theme.palette.primary.main,
            boxShadow: `0 0 10px ${theme.palette.primary.main}`
          },
          "&::after": {
            content: '""',
            position: "absolute",
            left: 0,
            top: 0,
            right: 0,
            bottom: 0,
            background: `linear-gradient(135deg, ${theme.palette.primary.main}40, transparent)`,
            borderRadius: "5px"
          }
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
        borderColor: theme.palette.c_gray5,
        color: theme.palette.c_gray5,
        margin: "0.5em",
        padding: "0.5em 1em",
        "&:hover": {
          borderColor: theme.palette.c_hl1,
          color: theme.palette.c_hl1
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
        placement="right"
        title="Explore Examples"
        enterDelay={TOOLTIP_ENTER_DELAY}
      >
        <Button
          className={`nav-button ${
            path === "/examples" && panelVisible ? "active" : ""
          }`}
          onClick={() => {
            navigate("/examples");
          }}
          tabIndex={-1}
          style={{
            color: path.startsWith("/examples")
              ? ThemeNodetool.palette.c_hl1
              : ThemeNodetool.palette.c_white
          }}
        >
          <ExamplesIcon />
        </Button>
      </Tooltip>
      <Tooltip title="Workflows (Key 1)" placement="right">
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
      <Tooltip title="Assets (Key 2)" placement="right">
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
      <Tooltip title="Collections (Key 3)" placement="right">
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
      <Tooltip title="Chat (Key 4)" placement="right">
        <IconButton
          tabIndex={-1}
          onClick={() => onViewChange("chat")}
          className={activeView === "chat" && panelVisible ? "active" : ""}
        >
          <ChatIcon />
        </IconButton>
      </Tooltip>
      <Tooltip title="Packs (Key 5)" placement="right">
        <IconButton
          tabIndex={-1}
          className={`toolbar-button ${activeView === "packs" ? "active" : ""}`}
          onClick={() => onViewChange("packs")}
        >
          <WidgetsIcon />
        </IconButton>
      </Tooltip>

      <div style={{ flexGrow: 1 }} />
      <Tooltip title="Close Panel" placement="right">
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

  return (
    <>
      {activeView === "chat" && <HelpChat />}
      {activeView === "assets" && (
        <Box
          className="assets-container"
          sx={{ width: "100%", height: "100%" }}
        >
          <Tooltip title="Fullscreen" placement="right">
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
            margin: "0 20px"
          }}
        >
          <h3>Workflows</h3>
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

  useCombo(["1"], () => handlePanelToggle("workflowGrid"), false);
  useCombo(["2"], () => handlePanelToggle("assets"), false);
  useCombo(["3"], () => handlePanelToggle("collections"), false);
  useCombo(["4"], () => handlePanelToggle("chat"), false);
  useCombo(["5"], () => handlePanelToggle("packs"), false);

  const activeView =
    usePanelStore((state) => state.panel.activeView) || "workflowGrid";
  const handleViewChange = usePanelStore((state) => state.handleViewChange);

  const onViewChange = useCallback(
    (view: typeof activeView) => {
      handleViewChange(view);
    },
    [handleViewChange]
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
          style: { width: isVisible ? `${panelSize}px` : "60px" }
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
