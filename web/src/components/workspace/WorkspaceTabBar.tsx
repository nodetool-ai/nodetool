/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useCallback, useRef, useState } from "react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

import {
  useWorkspaceTabsStore,
  type WorkspaceTab,
  type WorkspaceTabType
} from "../../stores/WorkspaceTabsStore";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { colorForType } from "../../config/data_types";
import { TOOLBAR_WIDTH } from "../../config/constants";
import NotificationButton from "../panels/NotificationButton";
import OpenMenu from "./OpenMenu";

/** Whether a document type supports both View and Edit (vs view-only). */
const SUPPORTS_BOTH_MODES: Record<WorkspaceTabType, boolean> = {
  workflow: true,
  image: true,
  timeline: true,
  model3d: true,
  text: true,
  audio: false
};

const TYPE_GLYPH: Record<WorkspaceTabType, string> = {
  workflow: "⬡",
  image: "▦",
  timeline: "▤",
  model3d: "◈",
  audio: "♪",
  text: "¶"
};

/** Pin color per tab type, reusing the app's canonical data-type palette. */
const TYPE_COLOR: Record<WorkspaceTabType, string> = {
  workflow: colorForType("any"),
  image: colorForType("image"),
  timeline: colorForType("video"),
  model3d: colorForType("model_3d"),
  audio: colorForType("audio"),
  text: colorForType("text")
};

const styles = (theme: Theme) =>
  css({
    display: "flex",
    alignItems: "stretch",
    height: "40px",
    flexShrink: 0,
    // Clear the full-height left rail (PanelLeft) which now runs to top 0.
    paddingLeft: `${TOOLBAR_WIDTH}px`,
    backgroundColor: theme.vars.palette.c_app_header,
    borderBottom: `1px solid ${theme.vars.palette.divider}`,
    WebkitAppRegion: "drag",
    userSelect: "none",

    "& .tabs": {
      flex: 1,
      display: "flex",
      flexWrap: "nowrap",
      alignItems: "stretch",
      overflowX: "auto",
      overflowY: "hidden",
      scrollbarWidth: "none",
      msOverflowStyle: "none",
      "&::-webkit-scrollbar": { display: "none" }
    },

    "& .tab": {
      WebkitAppRegion: "no-drag",
      display: "flex",
      alignItems: "center",
      gap: "8px",
      minWidth: "150px",
      maxWidth: "240px",
      flex: "0 0 auto",
      padding: "0 10px 0 14px",
      cursor: "pointer",
      color: theme.vars.palette.text.secondary,
      borderRight: `1px solid ${theme.vars.palette.divider}`,
      fontSize: "13px",
      transition: "color 120ms, background-color 120ms",
      "&:hover": {
        color: theme.vars.palette.text.primary,
        backgroundColor: "rgba(255,255,255,0.03)"
      },
      "&.active": {
        color: theme.vars.palette.text.primary,
        backgroundColor: "var(--c_editor_bg_color)"
      }
    },

    "& .glyph": { flexShrink: 0, fontSize: "13px" },
    "& .tab-name": {
      flex: 1,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      minWidth: 0
    },
    "& .close": {
      flexShrink: 0,
      width: "16px",
      height: "16px",
      lineHeight: "16px",
      textAlign: "center",
      borderRadius: "3px",
      color: theme.vars.palette.text.disabled,
      "&:hover": {
        color: theme.vars.palette.text.primary,
        backgroundColor: "rgba(255,255,255,0.08)"
      }
    },

    "& .new-tab": {
      WebkitAppRegion: "no-drag",
      flexShrink: 0,
      display: "flex",
      alignItems: "center",
      gap: "5px",
      padding: "0 14px",
      border: "none",
      borderRight: `1px solid ${theme.vars.palette.divider}`,
      background: "transparent",
      color: theme.vars.palette.primary.main,
      cursor: "pointer",
      fontSize: "13px",
      fontWeight: 500,
      whiteSpace: "nowrap",
      transition: "color 120ms, background-color 120ms",
      "& .new-tab-plus": {
        fontSize: "15px",
        lineHeight: 1
      },
      "& .new-tab-caret": {
        fontSize: "13px",
        marginLeft: "1px",
        opacity: 0.75,
        lineHeight: 1
      },
      "&:hover": {
        color: theme.vars.palette.secondary.main,
        backgroundColor: theme.vars.palette.action.hover
      }
    },

    "& .mode-toggle": {
      WebkitAppRegion: "no-drag",
      display: "flex",
      alignItems: "center",
      gap: "2px",
      padding: "6px 10px",
      flexShrink: 0,
      "& button": {
        border: `1px solid ${theme.vars.palette.divider}`,
        background: "transparent",
        color: theme.vars.palette.text.secondary,
        cursor: "pointer",
        fontSize: "11px",
        padding: "3px 12px",
        "&:first-of-type": { borderRadius: "4px 0 0 4px", borderRight: "none" },
        "&:last-of-type": { borderRadius: "0 4px 4px 0" },
        "&.on": {
          color: theme.vars.palette.primary.contrastText,
          backgroundColor: theme.vars.palette.primary.main,
          borderColor: theme.vars.palette.primary.main
        }
      }
    },

    "& .right-actions": {
      WebkitAppRegion: "no-drag",
      display: "flex",
      alignItems: "center",
      flexShrink: 0,
      paddingRight: "4px",
      "& .MuiIconButton-root, & .MuiButtonBase-root": {
        minWidth: "28px",
        width: "28px",
        height: "28px",
        padding: 0,
        color: theme.vars.palette.text.secondary,
        borderRadius: "var(--rounded-md)",
        "&:hover": {
          color: theme.vars.palette.text.primary,
          backgroundColor: theme.vars.palette.action.hover
        }
      },
      "& svg, & .MuiSvgIcon-root": {
        width: "16px",
        height: "16px",
        fontSize: "15px"
      }
    }
  });

const WorkspaceTabBar = () => {
  const theme = useTheme();
  const tabs = useWorkspaceTabsStore((state) => state.tabs);
  const activeTabId = useWorkspaceTabsStore((state) => state.activeTabId);
  const setActiveTab = useWorkspaceTabsStore((state) => state.setActiveTab);
  const closeTab = useWorkspaceTabsStore((state) => state.closeTab);
  const setMode = useWorkspaceTabsStore((state) => state.setMode);

  const removeWorkflow = useWorkflowManager((state) => state.removeWorkflow);

  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? null;

  const newTabButtonRef = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const handleClose = useCallback(
    (tab: WorkspaceTab) => {
      closeTab(tab.id);
      if (tab.type === "workflow") {
        removeWorkflow(tab.ref);
      }
    },
    [closeTab, removeWorkflow]
  );

  return (
    <div css={styles(theme)} className="workspace-tabbar">
      <button
        ref={newTabButtonRef}
        type="button"
        className="new-tab"
        aria-label="Open or create a tab"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((v) => !v)}
      >
        <span className="new-tab-plus" aria-hidden>
          +
        </span>
        New
        <span className="new-tab-caret" aria-hidden>
          ▾
        </span>
      </button>
      <div className="tabs">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`tab${tab.id === activeTabId ? " active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="glyph" style={{ color: TYPE_COLOR[tab.type] }}>
              {TYPE_GLYPH[tab.type]}
            </span>
            <span className="tab-name">{tab.title}</span>
            <span
              className="close"
              role="button"
              aria-label={`Close ${tab.title}`}
              onClick={(event) => {
                event.stopPropagation();
                handleClose(tab);
              }}
            >
              ×
            </span>
          </div>
        ))}
      </div>

      <OpenMenu
        anchorEl={newTabButtonRef.current}
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
      />

      {activeTab && SUPPORTS_BOTH_MODES[activeTab.type] && (
        <div className="mode-toggle">
          <button
            type="button"
            className={activeTab.mode === "view" ? "on" : ""}
            onClick={() => setMode(activeTab.id, "view")}
          >
            {activeTab.type === "workflow" ? "App" : "View"}
          </button>
          <button
            type="button"
            className={activeTab.mode === "edit" ? "on" : ""}
            onClick={() => setMode(activeTab.id, "edit")}
          >
            Edit
          </button>
        </div>
      )}

      <div className="right-actions">
        <NotificationButton />
      </div>
    </div>
  );
};

export default WorkspaceTabBar;
