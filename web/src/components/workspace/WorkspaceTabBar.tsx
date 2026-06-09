/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, {
  useCallback,
  useMemo,
  useRef,
  useState,
  type DragEvent
} from "react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

import {
  useWorkspaceTabsStore,
  type WorkspaceTab,
  type WorkspaceTabType
} from "../../stores/WorkspaceTabsStore";
import { useWorkflowManager, useWorkflowManagerStore } from "../../contexts/WorkflowManagerContext";
import { colorForType } from "../../config/data_types";
import { TOOLBAR_WIDTH } from "../../config/constants";
import NotificationButton from "../panels/NotificationButton";
import OpenMenu from "./OpenMenu";
import WorkspaceTabItem from "./WorkspaceTabItem";

/** Whether a document type supports both View and Edit (vs view-only). */
const SUPPORTS_BOTH_MODES: Record<WorkspaceTabType, boolean> = {
  workflow: true,
  image: true,
  sketch: false,
  timeline: true,
  model3d: true,
  text: true,
  audio: true
};

const TYPE_GLYPH: Record<WorkspaceTabType, string> = {
  workflow: "⬡",
  image: "▦",
  sketch: "✎",
  timeline: "▤",
  model3d: "◈",
  audio: "♪",
  text: "¶"
};

/** Pin color per tab type, reusing the app's canonical data-type palette. */
const TYPE_COLOR: Record<WorkspaceTabType, string> = {
  workflow: colorForType("any"),
  image: colorForType("image"),
  sketch: colorForType("image"),
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
      fontSize: "var(--fontSizeSmall)",
      transition: "color 120ms, background-color 120ms",
      "&:hover": {
        color: theme.vars.palette.text.primary,
        backgroundColor: "rgba(255,255,255,0.03)"
      },
      "&.active": {
        color: theme.vars.palette.text.primary,
        backgroundColor: "var(--c_editor_bg_color)"
      },
      "&.drop-target-left": {
        boxShadow: `inset 2px 0 0 ${theme.vars.palette.primary.main}`
      },
      "&.drop-target-right": {
        boxShadow: `inset -2px 0 0 ${theme.vars.palette.primary.main}`
      }
    },

    "& .tab-input": {
      flex: 1,
      minWidth: 0,
      background: "transparent",
      border: "none",
      color: "inherit",
      padding: 0,
      fontSize: "inherit",
      width: "100%",
      outline: "none"
    },

    "& .glyph": { flexShrink: 0, fontSize: "var(--fontSizeSmall)" },
    "& .tab-name": {
      flex: 1,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      minWidth: 0
    },
    "& .dirty-dot": {
      width: "8px",
      height: "8px",
      borderRadius: "50%",
      backgroundColor: theme.vars.palette.warning.main,
      flexShrink: 0
    },
    "& .tab-close": {
      flexShrink: 0,
      width: "16px",
      height: "16px",
      minWidth: "16px",
      padding: 0,
      color: theme.vars.palette.text.disabled,
      "&:hover": {
        color: theme.vars.palette.text.primary,
        backgroundColor: "rgba(255,255,255,0.08)"
      },
      "& .MuiSvgIcon-root": {
        width: "14px",
        height: "14px",
        fontSize: "14px"
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
      fontSize: "var(--fontSizeSmall)",
      fontWeight: 500,
      whiteSpace: "nowrap",
      transition: "color 120ms, background-color 120ms",
      "& .new-tab-plus": {
        fontSize: "var(--fontSizeNormal)",
        lineHeight: 1
      },
      "& .new-tab-caret": {
        fontSize: "var(--fontSizeSmall)",
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
        fontSize: "var(--fontSizeSmaller)",
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
        fontSize: "var(--fontSizeNormal)"
      }
    }
  });

const WorkspaceTabBar = React.memo(function WorkspaceTabBar() {
  const theme = useTheme();
  const tabBarStyles = useMemo(() => styles(theme), [theme]);
  const tabs = useWorkspaceTabsStore((state) => state.tabs);
  const activeTabId = useWorkspaceTabsStore((state) => state.activeTabId);
  const setActiveTab = useWorkspaceTabsStore((state) => state.setActiveTab);
  const closeTab = useWorkspaceTabsStore((state) => state.closeTab);
  const closeOthers = useWorkspaceTabsStore((state) => state.closeOthers);
  const setMode = useWorkspaceTabsStore((state) => state.setMode);
  const moveTab = useWorkspaceTabsStore((state) => state.moveTab);

  const removeWorkflow = useWorkflowManager((state) => state.removeWorkflow);
  const workflowManagerStore = useWorkflowManagerStore();
  const getWorkflow = useWorkflowManager((state) => state.getWorkflow);
  const updateWorkflow = useWorkflowManager((state) => state.updateWorkflow);
  const saveWorkflow = useWorkflowManager((state) => state.saveWorkflow);

  const activeTab = useMemo(
    () => tabs.find((tab) => tab.id === activeTabId) ?? null,
    [tabs, activeTabId]
  );

  const newTabButtonRef = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    id: string;
    position: "left" | "right";
  } | null>(null);

  const syncWorkflowOrderFromTabs = useCallback(() => {
    const tabOrder = useWorkspaceTabsStore
      .getState()
      .tabs.filter((tab) => tab.type === "workflow")
      .map((tab) => tab.ref);

    let manager = workflowManagerStore.getState();
    for (let targetIdx = 0; targetIdx < tabOrder.length; targetIdx++) {
      const wantId = tabOrder[targetIdx];
      const currentIdx = manager.openWorkflows.findIndex((wf) => wf.id === wantId);
      if (currentIdx !== targetIdx && currentIdx !== -1) {
        manager.reorderWorkflows(currentIdx, targetIdx);
        manager = workflowManagerStore.getState();
      }
    }
  }, [workflowManagerStore]);

  const handleDragStart = useCallback(
    (event: DragEvent<HTMLDivElement>, tabId: string) => {
      event.dataTransfer.setData("text/plain", tabId);
    },
    []
  );

  const handleDragOver = useCallback(
    (event: DragEvent<HTMLDivElement>, tab: WorkspaceTab) => {
      event.preventDefault();
      const rect = event.currentTarget.getBoundingClientRect();
      const position =
        event.clientX < rect.left + rect.width / 2 ? "left" : "right";
      setDropTarget({ id: tab.id, position });
    },
    []
  );

  const handleDragLeave = useCallback(() => {
    setDropTarget(null);
  }, []);

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>, targetTab: WorkspaceTab) => {
      event.preventDefault();
      const sourceTabId = event.dataTransfer.getData("text/plain");
      if (!sourceTabId || sourceTabId === targetTab.id || !dropTarget) {
        setDropTarget(null);
        return;
      }

      const currentTabs = useWorkspaceTabsStore.getState().tabs;
      const sourceIndex = currentTabs.findIndex((tab) => tab.id === sourceTabId);
      const targetIndex = currentTabs.findIndex((tab) => tab.id === targetTab.id);
      if (sourceIndex === -1 || targetIndex === -1) {
        setDropTarget(null);
        return;
      }

      let toIndex =
        dropTarget.position === "right" ? targetIndex + 1 : targetIndex;
      if (sourceIndex < toIndex) {
        toIndex -= 1;
      }

      moveTab(sourceTabId, toIndex);

      const sourceTab = currentTabs[sourceIndex];
      if (sourceTab?.type === "workflow") {
        syncWorkflowOrderFromTabs();
      }

      setDropTarget(null);
    },
    [dropTarget, moveTab, syncWorkflowOrderFromTabs]
  );

  const commitWorkflowRename = useCallback(
    async (tab: WorkspaceTab, newName: string) => {
      const trimmed = newName.trim();
      setEditingTabId(null);
      if (tab.type !== "workflow" || trimmed.length === 0) {
        return;
      }

      const workflow = getWorkflow(tab.ref);
      if (!workflow || workflow.name === trimmed) {
        return;
      }

      const updatedWorkflow = { ...workflow, name: trimmed };
      updateWorkflow(updatedWorkflow);
      try {
        await saveWorkflow(updatedWorkflow);
      } catch {
        updateWorkflow(workflow);
      }
    },
    [getWorkflow, updateWorkflow, saveWorkflow]
  );

  const handleClose = useCallback(
    (tab: WorkspaceTab) => {
      closeTab(tab.id);
      if (tab.type === "workflow") {
        removeWorkflow(tab.ref);
      }
    },
    [closeTab, removeWorkflow]
  );

  const handleCloseOthers = useCallback(
    (keepTab: WorkspaceTab) => {
      const toClose = useWorkspaceTabsStore
        .getState()
        .tabs.filter((tab) => tab.id !== keepTab.id);
      for (const tab of toClose) {
        if (tab.type === "workflow") {
          removeWorkflow(tab.ref);
        }
      }
      closeOthers(keepTab.id);
    },
    [closeOthers, removeWorkflow]
  );

  const handleCloseAll = useCallback(() => {
    const snapshot = [...useWorkspaceTabsStore.getState().tabs];
    for (const tab of snapshot) {
      if (tab.type === "workflow") {
        removeWorkflow(tab.ref);
      }
      closeTab(tab.id);
    }
  }, [closeTab, removeWorkflow]);

  return (
    <div css={tabBarStyles} className="workspace-tabbar">
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
          <WorkspaceTabItem
            key={tab.id}
            tab={tab}
            isActive={tab.id === activeTabId}
            isEditing={editingTabId === tab.id}
            dropTarget={dropTarget}
            typeColor={TYPE_COLOR[tab.type]}
            typeGlyph={TYPE_GLYPH[tab.type]}
            onActivate={setActiveTab}
            onBeginRename={() => setEditingTabId(tab.id)}
            onClose={handleClose}
            onCloseOthers={handleCloseOthers}
            onCloseAll={handleCloseAll}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onCommitRename={commitWorkflowRename}
            onCancelRename={() => setEditingTabId(null)}
          />
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
});

export default WorkspaceTabBar;
