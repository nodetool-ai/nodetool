/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import {
  IconButton,
  Tooltip,
  Box,
  Button,
  useMediaQuery,
  Typography
} from "@mui/material";
import { useResizePanel } from "../../hooks/handlers/useResizePanel";
import { useCombo } from "../../stores/KeyPressedStore";
import isEqual from "lodash/isEqual";
import { memo, useCallback, useState, useEffect } from "react";
import AssetGrid from "../assets/AssetGrid";
import WorkflowList from "../workflows/WorkflowList";
import PatternLibraryPanel from "../patterns/PatternLibraryPanel";
import { IconForType } from "../../config/data_types";
import { LeftPanelView, usePanelStore } from "../../stores/PanelStore";
import { ContextMenuProvider } from "../../providers/ContextMenuProvider";
import ContextMenus from "../context_menus/ContextMenus";
import { useLocation } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import ThemeToggle from "../ui/ThemeToggle";
// Icons
import CodeIcon from "@mui/icons-material/Code";
import GridViewIcon from "@mui/icons-material/GridView";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";

import { Fullscreen } from "@mui/icons-material";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import { getShortcutTooltip } from "../../config/shortcuts";
import { useRunningJobs } from "../../hooks/useRunningJobs";
import WorkHistoryIcon from "@mui/icons-material/WorkHistory";
import {
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  CircularProgress
} from "@mui/material";
import HourglassEmptyIcon from "@mui/icons-material/HourglassEmpty";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import StopIcon from "@mui/icons-material/Stop";
import { useWorkflowRunnerState } from "../../hooks/useWorkflowRunnerState";
import { Job } from "../../stores/ApiTypes";
import { useWorkflow } from "../../serverState/useWorkflow";
import { queryClient } from "../../queryClient";
import { getWorkflowRunnerStore } from "../../stores/WorkflowRunner";

const TOOLBAR_WIDTH = 50;
const HEADER_HEIGHT = 77;
const HEADER_HEIGHT_MOBILE = 56;

const styles = (
  theme: Theme,
  hasHeader: boolean = true,
  isMobile: boolean = false
) => {
  const headerHeight = hasHeader
    ? isMobile
      ? HEADER_HEIGHT_MOBILE
      : HEADER_HEIGHT
    : 0;
  return css({
    // Main container - fixed to left edge of viewport
    position: "fixed",
    left: 0,
    top: `${headerHeight}px`,
    height: `calc(100vh - ${headerHeight}px)`,
    display: "flex",
    flexDirection: "row",
    zIndex: 1100,

    // Drawer content area (appears right of toolbar)
    ".drawer-content": {
      height: "100%",
      backgroundColor: theme.vars.palette.background.paper,
      borderRight: `1px solid ${theme.vars.palette.divider}`,
      boxShadow: "4px 0 10px rgba(0, 0, 0, 0.15)",
      overflow: "hidden",
      display: "flex",
      flexDirection: "column"
    },

    // Resize handle on right edge of drawer
    ".panel-resize-handle": {
      width: "6px",
      position: "absolute",
      right: 0,
      top: 0,
      height: "100%",
      backgroundColor: "transparent",
      border: 0,
      borderRadius: 0,
      cursor: "ew-resize",
      zIndex: 10,
      transition: "background-color 0.2s ease",

      "&:hover": {
        backgroundColor: theme.vars.palette.primary.main
      }
    },

    // Fixed toolbar on the left edge
    ".vertical-toolbar": {
      width: `${TOOLBAR_WIDTH}px`,
      flexShrink: 0,
      display: "flex",
      flexDirection: "column",
      gap: 6,
      backgroundColor: theme.vars.palette.background.default,
      borderRight: `1px solid ${theme.vars.palette.divider}`,
      paddingTop: "8px",

      // Ensure custom SVG icons (IconForType) are sized like MUI icons
      "& .icon-container": {
        width: "18px",
        height: "18px"
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

    // Inner content wrapper
    ".panel-inner-content": {
      display: "flex",
      flex: 1,
      height: "100%",
      overflow: "hidden"
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
    }
  });
};

/**
 * Format elapsed time since job started
 */
const formatElapsedTime = (startedAt: string | null | undefined): string => {
  if (!startedAt) { return "Not started"; }
  const start = new Date(startedAt).getTime();
  // Validate the date - getTime() returns NaN for invalid dates
  if (isNaN(start)) { return "Invalid date"; }
  const now = Date.now();
  const elapsed = Math.floor((now - start) / 1000);
  // Handle negative elapsed time (future dates)
  if (elapsed < 0) { return "0s"; }

  if (elapsed < 60) { return `${elapsed}s`; }
  if (elapsed < 3600) { return `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`; }
  const hours = Math.floor(elapsed / 3600);
  const minutes = Math.floor((elapsed % 3600) / 60);
  return `${hours}h ${minutes}m`;
};

/**
 * Component to display a single job item with workflow name and runner state detection
 */
const JobItem = ({ job }: { job: Job }) => {
  const navigate = useNavigate();
  const runnerState = useWorkflowRunnerState(job.workflow_id);
  const { data: workflow } = useWorkflow(job.workflow_id);
  const [elapsedTime, setElapsedTime] = useState(
    formatElapsedTime(job.started_at)
  );

  // Update elapsed time every second while job is running
  useEffect(() => {
    if (job.status !== "running" && job.status !== "queued") { return; }

    const interval = setInterval(() => {
      setElapsedTime(formatElapsedTime(job.started_at));
    }, 1000);

    return () => clearInterval(interval);
  }, [job.started_at, job.status]);

  // Refresh jobs list when runner state changes from running to idle/error/cancelled
  useEffect(() => {
    if (
      runnerState === "idle" ||
      runnerState === "error" ||
      runnerState === "cancelled"
    ) {
      // Invalidate all jobs queries to refresh the list
      // queryKey: ["jobs"] matches any query whose key starts with "jobs"
      // This includes ["jobs", "running", userId] used in useRunningJobs
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
    }
  }, [runnerState]);

  const handleClick = () => {
    navigate(`/editor/${job.workflow_id}`);
  };

  const handleStop = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent navigation
    const runnerStore = getWorkflowRunnerStore(job.workflow_id);
    runnerStore.getState().cancel();
  };

  const getStatusIcon = () => {
    if (job.error) {
      return <ErrorOutlineIcon color="error" />;
    }
    switch (job.status) {
      case "running":
        return <CircularProgress size={24} />;
      case "queued":
      case "starting":
        return <HourglassEmptyIcon color="action" />;
      default:
        return <PlayArrowIcon color="action" />;
    }
  };

  const workflowName = workflow?.name || "Loading...";
  const statusText =
    job.status === "running"
      ? `Running • ${elapsedTime}`
      : job.status === "queued"
        ? "Queued"
        : job.status === "starting"
          ? "Starting..."
          : job.status;

  return (
    <ListItem
      onClick={handleClick}
      sx={{
        cursor: "pointer",
        borderRadius: 1,
        mb: 0.5,
        "&:hover": {
          backgroundColor: "action.hover"
        }
      }}
    >
      <ListItemIcon sx={{ minWidth: 40 }}>{getStatusIcon()}</ListItemIcon>
      <ListItemText
        primary={
          <Typography variant="body2" noWrap sx={{ fontWeight: 500 }}>
            {workflowName}
          </Typography>
        }
        secondary={
          <Box component="span" sx={{ display: "flex", flexDirection: "column", gap: 0.25 }}>
            <Typography variant="caption" color="text.secondary">
              {statusText}
            </Typography>
            {job.error && (
              <Typography variant="caption" color="error" noWrap>
                {job.error}
              </Typography>
            )}
          </Box>
        }
      />
      {(job.status === "running" || job.status === "queued" || job.status === "starting") && (
        <IconButton
          size="small"
          onClick={handleStop}
          sx={{
            ml: 1,
            color: "error.main",
            "&:hover": {
              backgroundColor: "error.light",
              color: "error.contrastText"
            }
          }}
        >
          <StopIcon fontSize="small" />
        </IconButton>
      )}
    </ListItem>
  );
};

const RunningJobsList = () => {
  const { data: jobs, isLoading, error } = useRunningJobs();

  if (isLoading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", p: 2 }}>
        <CircularProgress size={24} />
      </Box>
    );
  }
  if (error) {
    return (
      <Box sx={{ p: 2, color: "error.main" }}>
        <Typography variant="body2">Error loading jobs</Typography>
      </Box>
    );
  }
  if (!jobs?.length) {
    return (
      <Box sx={{ p: 5, color: "text.secondary" }}>
        <Typography variant="body2">No running jobs</Typography>
      </Box>
    );
  }

  return (
    <List sx={{ px: 1 }}>
      {jobs.map((job) => (
        <JobItem key={job.id} job={job} />
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
  const panelVisible = usePanelStore((state) => state.panel.isVisible);

  return (
    <div className="vertical-toolbar">
      <Tooltip
        title={
          <div className="tooltip-span">
            <div className="tooltip-title">Workflows</div>
            <div className="tooltip-key">
              <kbd>1</kbd>
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
        title={
          <div className="tooltip-span">
            <div className="tooltip-title">Patterns</div>
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
          onClick={() => onViewChange("patternLibrary")}
          className={activeView === "patternLibrary" && panelVisible ? "active" : ""}
        >
          <AutoAwesomeIcon />
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
            <div className="tooltip-title">Jobs</div>
            <div className="tooltip-key">
              <kbd>3</kbd>
            </div>
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

  return (
    <>
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
      {activeView === "patternLibrary" && (
        <PatternLibraryPanel />
      )}
    </>
  );
});

const PanelLeft: React.FC = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const location = useLocation();

  // Detect routes that don't have AppHeader (standalone modes)
  const isStandaloneMode =
    location.pathname.startsWith("/standalone-chat") ||
    location.pathname.startsWith("/miniapp");
  const hasHeader = !isStandaloneMode;

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
  useCombo(["3"], () => handlePanelToggle("jobs"), false);
  useCombo(["4"], () => handlePanelToggle("patternLibrary"), false);

  const activeView =
    usePanelStore((state) => state.panel.activeView) || "workflowGrid";

  const onViewChange = useCallback(
    (view: LeftPanelView) => {
      handlePanelToggle(view);
    },
    [handlePanelToggle]
  );



  return (
    <div css={styles(theme, hasHeader, isMobile)} className="panel-left-container">
      {/* Fixed toolbar - always on the left edge */}
      <ContextMenuProvider>
        <ContextMenus />
        <VerticalToolbar
          activeView={activeView}
          onViewChange={onViewChange}
          handlePanelToggle={() => handlePanelToggle(activeView)}
        />

        {/* Drawer content - appears right of toolbar when visible */}
        {isVisible && (
          <div
            ref={panelRef}
            className={`drawer-content ${isDragging ? "dragging" : ""}`}
            style={{
              width: `${isMobile
                ? Math.min(panelSize - TOOLBAR_WIDTH, Math.floor(window.innerWidth * 0.75) - TOOLBAR_WIDTH)
                : Math.max(panelSize - TOOLBAR_WIDTH, 250)
                }px`,
              minWidth: "250px",
              maxWidth: isMobile ? `calc(75vw - ${TOOLBAR_WIDTH}px)` : "none"
            }}
          >
            {/* Resize handle on right edge */}
            <div
              className="panel-resize-handle"
              onMouseDown={handleMouseDown}
              role="slider"
              aria-label="Resize panel"
              tabIndex={-1}
            />
            <div className="panel-inner-content">
              <PanelContent
                activeView={activeView}
                handlePanelToggle={handlePanelToggle}
              />
            </div>
          </div>
        )}
      </ContextMenuProvider>
    </div>
  );
};

export default memo(PanelLeft, isEqual);
