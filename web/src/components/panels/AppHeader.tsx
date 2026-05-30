/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import React, { memo, useCallback, useMemo } from "react";
import { Toolbar, useMediaQuery } from "@mui/material";
import { EditorButton } from "../editor_ui";
import AutoAwesomeMosaicIcon from "@mui/icons-material/AutoAwesomeMosaic";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { TOOLTIP_ENTER_DELAY, HEADER_HEIGHT } from "../../config/constants";
import RightSideButtons from "./RightSideButtons";
import SaveImageEditPill from "./SaveImageEditPill";
import Logo from "../Logo";
import { FlexRow, Tooltip, Box, Text } from "../ui_primitives";
import WorkspaceSelect from "../workspaces/WorkspaceSelect";
import { useCurrentWorkspace } from "../../hooks/useCurrentWorkspace";
import { isProduction } from "../../lib/env";

const workspacesEnabled = !isProduction;

/** Human-readable mode name for the current route, shown in the brand label. */
function modeLabelForPath(path: string): string {
  if (path.startsWith("/editor")) return "Editor";
  if (path.startsWith("/chat")) return "Chat";
  if (path.startsWith("/apps")) return "App";
  if (path.startsWith("/timeline")) return "Timeline";
  if (path.startsWith("/sketch")) return "Image";
  if (path.startsWith("/templates")) return "Templates";
  if (path.startsWith("/dashboard")) return "Dashboard";
  return "";
}

const styles = (theme: Theme) =>
  css({
    "&": {
      width: "100%",
      overflow: "visible",
      backgroundColor: theme.vars.palette.c_app_header,
      backdropFilter: "blur(12px)",
      borderBottom: `1px solid ${theme.vars.palette.divider}`,
      boxShadow: `0 4px 30px ${theme.vars.palette.grey[900]}1a`,
      paddingLeft: "0",
      position: "fixed",
      top: 0,
      left: 0,
      zIndex: 1100
    },
    ".toolbar": {
      backgroundColor: "transparent",
      overflow: "visible",
      position: "relative",
      height: `${HEADER_HEIGHT}px`,
      minHeight: `${HEADER_HEIGHT}px`,
      padding: "0 2px 0 12px",
      border: "0"
    },
    ".MuiIconButton-root": {
      height: "28px",
      padding: "4px",
      color: theme.vars.palette.text.primary,
      borderRadius: "var(--rounded-md)",
      fontSize: theme.typography.body2.fontSize,
      transition: "all 0.2s ease-out",
      "&:hover": {
        backgroundColor: theme.vars.palette.action.hover
      },
      "& svg, & .icon-container svg": {
        display: "block",
        width: "18px",
        height: "18px",
        fontSize: "18px",
        marginRight: "4px"
      },
      "& .icon-container": {
        width: "18px",
        height: "18px",
        marginRight: "4px"
      }
    },
    ".navigate": {
      flex: "1 1 auto",
      WebkitAppRegion: "no-drag"
    },
    ".logo-container": {
      display: "flex",
      alignItems: "center",
      paddingLeft: "2px",
      marginRight: "16px",
      cursor: "pointer",
      opacity: 0.55,
      transition: "opacity 150ms ease-out",
      "&:hover": {
        opacity: 1
      }
    },
    ".buttons-right": {
      display: "flex",
      flexDirection: "row",
      justifyContent: "flex-end",
      alignItems: "center",
      background: "transparent",
      flexShrink: 0,
      marginLeft: "1em",
      marginRight: "4px",
      gap: "4px",
      WebkitAppRegion: "no-drag"
    }
    // Mobile styles handled via separate CSS file
  });

// Templates button - positioned closer to right utility icons
const TemplatesButton = memo(function TemplatesButton({
  isActive
}: {
  isActive: boolean;
}) {
  const navigate = useNavigate();

  const handleClick = useCallback(() => {
    navigate("/templates");
  }, [navigate]);

  return (
    <Tooltip
      title="Explore Templates"
      delay={TOOLTIP_ENTER_DELAY}
      placement="bottom"
    >
      <EditorButton
        variant="outlined"
        size="small"
        sx={{
          height: "1.75em",
          minWidth: "auto",
          borderRadius: "var(--rounded-md)",
          color: "var(--palette-text-secondary)",
          border: "1px solid transparent",
          gap: "6px",
          transition:
            "color 150ms ease-out, background-color 150ms ease-out",
          "& .templates-icon": {
            width: "16px",
            height: "16px",
            fontSize: "16px"
          },
          "&:hover": {
            backgroundColor: "var(--palette-action-hover)",
            color: "var(--palette-text-primary)",
            borderColor: "transparent"
          },
          "&.active": {
            color: "var(--palette-text-primary)",
            backgroundColor: "var(--palette-action-selected)",
            borderColor: "transparent"
          }
        }}
        className={`nav-button templates-button ${isActive ? "active" : ""}`}
        onClick={handleClick}
        tabIndex={-1}
        aria-current={isActive ? "page" : undefined}
        aria-label="Templates"
      >
        <AutoAwesomeMosaicIcon className="templates-icon" />
        <span className="nav-button-text">Templates</span>
      </EditorButton>
    </Tooltip>
  );
});

const HeaderWorkspaceSelector = memo(function HeaderWorkspaceSelector() {
  const { workspaceId, setWorkspaceId } = useCurrentWorkspace();
  return (
    <Tooltip
      title="Current workspace"
      delay={TOOLTIP_ENTER_DELAY}
      placement="bottom"
    >
      <Box sx={{ width: 280 }}>
        <WorkspaceSelect
          value={workspaceId}
          onChange={setWorkspaceId}
          compact
        />
      </Box>
    </Tooltip>
  );
});

/**
 * "Return to Timeline" pill — shown in the editor header when the user arrived
 * via "Open in Node Editor" from the timeline inspector.
 * The `from` query param carries `timeline:{sequenceId}:{clipId}`.
 */
const ReturnToTimelinePill = memo(function ReturnToTimelinePill() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // from=timeline:{sequenceId}:{clipId}
  // Require at least 3 colon-separated parts: "timeline", sequenceId, clipId.
  const fromParam = searchParams.get("from") ?? "";
  const parts = fromParam.startsWith("timeline:") ? fromParam.split(":") : [];
  const sequenceId = parts.length >= 3 ? parts[1] : "";

  const handleReturn = useCallback(() => {
    navigate(`/timeline/${sequenceId}`);
  }, [navigate, sequenceId]);

  if (!sequenceId) return null;

  return (
    <Tooltip title="Return to Timeline" delay={TOOLTIP_ENTER_DELAY} placement="bottom">
      <EditorButton
        variant="outlined"
        size="small"
        onClick={handleReturn}
        aria-label="Return to Timeline"
        data-testid="return-to-timeline-pill"
        sx={{
          height: "1.75em",
          minWidth: "auto",
          borderRadius: "var(--rounded-md)",
          color: "var(--palette-primary-main)",
          border: "1px solid var(--palette-primary-main)",
          gap: "4px",
          "&:hover": {
            backgroundColor: "var(--palette-action-hover)"
          }
        }}
      >
        <ArrowBackIcon sx={{ fontSize: "14px" }} />
        <span>Timeline</span>
      </EditorButton>
    </Tooltip>
  );
});

/**
 * "Return to Sketch" pill — shown in the editor header when the user arrived
 * via "Open in Node Editor" from the sketch (image-editor) inspector.
 * The `from` query param carries `sketch:{documentId}:{layerId}`.
 */
const ReturnToSketchPill = memo(function ReturnToSketchPill() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // from=sketch:{documentId}:{layerId}
  // Require at least 3 colon-separated parts: "sketch", documentId, layerId.
  const fromParam = searchParams.get("from") ?? "";
  const parts = fromParam.startsWith("sketch:") ? fromParam.split(":") : [];
  const documentId = parts.length >= 3 ? parts[1] : "";

  const handleReturn = useCallback(() => {
    navigate(`/sketch/${documentId}`);
  }, [navigate, documentId]);

  if (!documentId) return null;

  return (
    <Tooltip title="Return to Image Editor" delay={TOOLTIP_ENTER_DELAY} placement="bottom">
      <EditorButton
        variant="outlined"
        size="small"
        onClick={handleReturn}
        aria-label="Return to Image Editor"
        data-testid="return-to-sketch-pill"
        sx={{
          height: "1.75em",
          minWidth: "auto",
          borderRadius: "var(--rounded-md)",
          color: "var(--palette-primary-main)",
          border: "1px solid var(--palette-primary-main)",
          gap: "4px",
          "&:hover": {
            backgroundColor: "var(--palette-action-hover)"
          }
        }}
      >
        <ArrowBackIcon sx={{ fontSize: "14px" }} />
        <span>Image</span>
      </EditorButton>
    </Tooltip>
  );
});

const AppHeader: React.FC = memo(function AppHeader() {
  const theme = useTheme();
  const path = useLocation().pathname;
  const headerStyles = useMemo(() => styles(theme), [theme]);
  const navigate = useNavigate();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  const isEditorRoute = path.startsWith("/editor/");
  const sketchDocumentId = path.match(/^\/sketch\/([^/]+)/)?.[1];

  const handleLogoClick = useCallback(() => {
    navigate("/dashboard");
  }, [navigate]);

  return (
    <div css={headerStyles} className="app-header">
      <Toolbar variant="dense" className="toolbar" tabIndex={-1} sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <FlexRow className="navigate" gap={1} align="center">
          {/* Logo - clicks to Dashboard */}
          <Tooltip title="Go to Dashboard" delay={TOOLTIP_ENTER_DELAY} placement="bottom">
            <div
              className="logo-container"
              onClick={handleLogoClick}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") handleLogoClick(); }}
              role="button"
              tabIndex={0}
            >
              <Logo
                small
                width="20px"
                height="20px"
                fontSize="1em"
                borderRadius="4px"
              />
            </div>
          </Tooltip>
          {/* Return to Timeline pill — only shown when opened from timeline */}
          {isEditorRoute && <ReturnToTimelinePill />}
          {/* Return to Image Editor pill — only shown when opened from sketch */}
          {isEditorRoute && <ReturnToSketchPill />}
          {/* Save-to-image pill — only while editing an asset-linked sketch */}
          {sketchDocumentId && (
            <SaveImageEditPill documentId={sketchDocumentId} />
          )}
          <Box sx={{ flexGrow: 1 }} />
        </FlexRow>
        <div className="buttons-right">
          <RightSideButtons />
        </div>
      </Toolbar>
    </div>
  );
});

AppHeader.displayName = "AppHeader";

export default AppHeader;
