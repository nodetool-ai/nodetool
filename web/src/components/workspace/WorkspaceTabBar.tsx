/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, {
  Fragment,
  useCallback,
  useMemo,
  useRef,
  useState,
  type DragEvent
} from "react";
import { useMediaQuery } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

import {
  orderTabsForRender,
  useWorkspaceTabsStore,
  type WorkspaceTab,
  type WorkspaceTabType
} from "../../stores/WorkspaceTabsStore";
import { useWorkflowManager, useWorkflowManagerStore } from "../../contexts/WorkflowManagerContext";
import { useAssetStore } from "../../stores/AssetStore";
import { useJsScriptStore } from "../../stores/jsScript/JsScriptStore";
import useGlobalChatStore from "../../stores/GlobalChatStore";
import { trpc, trpcClient } from "../../trpc/client";
import { getActiveSketchInstance } from "../../stores/sketch/SketchInstance";
import { renameSketchDocument } from "../../stores/sketch/SketchSessionStore";
import { readSketchDocumentId } from "../../hooks/sketch/ensureSketchDocumentForAsset";
import { tabCanRename } from "./tabRename";
import { useUpdateApplication } from "../../hooks/useApplications";
import { TOOLBAR_WIDTH } from "../../config/constants";
import { MOTION, BORDER_RADIUS, SPACING, getSpacingPx } from "../ui_primitives";
import NotificationButton from "../panels/NotificationButton";
import OpenMenu from "./OpenMenu";
import WorkspaceTabItem from "./WorkspaceTabItem";
import MobileDocumentSelector from "./MobileDocumentSelector";
import MobileRailLauncher from "../panels/MobileRailLauncher";
import ProjectScopeChip from "../projects/ProjectScopeChip";
import { PROJECT_COLOR } from "../projects/projectIdentity";
import { TYPE_COLOR, TYPE_GLYPH } from "./tabTypeIdentity";

/** Whether a document type supports both View and Edit (vs view-only). */
const SUPPORTS_BOTH_MODES = {
  workflow: false,
  image: true,
  sketch: false,
  timeline: true,
  storyboard: false,
  script: false,
  jsscript: false,
  skill: true,
  model3d: true,
  text: true,
  audio: true,
  "workspace-file": true,
  chat: false,
  application: false,
  page: false,
  "project-list": false,
  project: false,
  "project-new": false
} satisfies Record<WorkspaceTabType, boolean>;


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
      gap: getSpacingPx(SPACING.md),
      minWidth: "150px",
      maxWidth: "240px",
      flex: "0 0 auto",
      padding: `0 ${getSpacingPx(SPACING.lg)} 0 ${getSpacingPx(SPACING.xl)}`,
      cursor: "pointer",
      color: theme.vars.palette.text.secondary,
      borderRight: `1px solid ${theme.vars.palette.divider}`,
      fontSize: "var(--fontSizeSmall)",
      transition: `color ${MOTION.fast}, background-color ${MOTION.fast}`,
      "&:hover": {
        color: theme.vars.palette.text.primary,
        backgroundColor: theme.vars.palette.c_overlay_subtle
      },
      "&.active": {
        color: theme.vars.palette.text.primary,
        backgroundColor: "var(--c_editor_bg_color)"
      },
      // A tab in the open project's group. The cyan underline is the group's
      // extent; the chip to its left names it.
      "&.in-project": {
        boxShadow: `inset 0 -2px 0 color-mix(in srgb, ${PROJECT_COLOR} 35%, transparent)`
      },
      "&.drop-target-left": {
        boxShadow: `inset 2px 0 0 ${theme.vars.palette.primary.main}`
      },
      "&.drop-target-right": {
        boxShadow: `inset -2px 0 0 ${theme.vars.palette.primary.main}`
      }
    },

    "& .project-scope": {
      WebkitAppRegion: "no-drag",
      display: "flex",
      alignItems: "center",
      gap: getSpacingPx(SPACING.md),
      flex: "0 0 auto",
      maxWidth: "220px",
      padding: `0 ${getSpacingPx(SPACING.lg)}`,
      border: "none",
      borderRight: `1px solid ${theme.vars.palette.divider}`,
      backgroundColor: `color-mix(in srgb, ${PROJECT_COLOR} 6%, transparent)`,
      boxShadow: `inset 0 -2px 0 ${PROJECT_COLOR}`,
      color: theme.vars.palette.text.primary,
      cursor: "pointer",
      fontSize: "var(--fontSizeSmall)",
      "& .glyph": { color: PROJECT_COLOR },
      "& .project-scope-name": {
        fontWeight: 500,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap"
      },
      "& .project-scope-caret": {
        fontSize: "var(--fontSizeSmaller)",
        opacity: 0.6
      },
      "&:hover": { backgroundColor: theme.vars.palette.c_overlay_subtle }
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
      borderRadius: BORDER_RADIUS.circle,
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
        backgroundColor: theme.vars.palette.c_overlay
      },
      "& .MuiSvgIcon-root": {
        width: "14px",
        height: "14px",
        fontSize: "var(--fontSizeNormal)"
      }
    },

    "& .new-tab": {
      WebkitAppRegion: "no-drag",
      flexShrink: 0,
      display: "flex",
      alignItems: "center",
      gap: getSpacingPx(SPACING.sm),
      padding: `0 ${getSpacingPx(SPACING.xl)}`,
      border: "none",
      borderRight: `1px solid ${theme.vars.palette.divider}`,
      background: "transparent",
      color: theme.vars.palette.primary.main,
      cursor: "pointer",
      fontSize: "var(--fontSizeSmall)",
      fontWeight: 500,
      whiteSpace: "nowrap",
      transition: `color ${MOTION.fast}, background-color ${MOTION.fast}`,
      "& .new-tab-plus": {
        fontSize: "var(--fontSizeNormal)",
        lineHeight: 1
      },
      "& .new-tab-caret": {
        fontSize: "var(--fontSizeSmall)",
        marginLeft: getSpacingPx(SPACING.micro),
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
      gap: getSpacingPx(SPACING.micro),
      padding: `${getSpacingPx(SPACING.sm)} ${getSpacingPx(SPACING.lg)}`,
      flexShrink: 0,
      "& button": {
        border: `1px solid ${theme.vars.palette.divider}`,
        background: "transparent",
        color: theme.vars.palette.text.secondary,
        cursor: "pointer",
        fontSize: "var(--fontSizeSmaller)",
        padding: `${getSpacingPx(SPACING.xs)} ${getSpacingPx(SPACING.lg)}`,
        "&:first-of-type": { borderRadius: `${BORDER_RADIUS.sm} 0 0 ${BORDER_RADIUS.sm}`, borderRight: "none" },
        "&:last-of-type": { borderRadius: `0 ${BORDER_RADIUS.sm} ${BORDER_RADIUS.sm} 0` },
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
      paddingRight: getSpacingPx(SPACING.xs),
      "& .MuiIconButton-root, & .MuiButtonBase-root": {
        minWidth: "28px",
        width: "28px",
        height: "28px",
        padding: 0,
        color: theme.vars.palette.text.secondary,
        borderRadius: BORDER_RADIUS.md,
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
    },

    // Mobile: no left rail to clear, and the bar grows to 48px so the global
    // 44px touch-target minimum fits inside it. The tab strip is replaced by a
    // single document selector (see MobileDocumentSelector); text labels drop
    // to icons.
    [theme.breakpoints.down("sm")]: {
      height: "48px",
      paddingLeft: 0,
      "& .new-tab": {
        padding: `0 ${getSpacingPx(SPACING.md)}`
      },
      "& .new-tab .new-tab-label": { display: "none" },
      "& .mode-toggle": {
        padding: `0 ${getSpacingPx(SPACING.sm)}`
      }
    }
  });

const WorkspaceTabBar = React.memo(function WorkspaceTabBar() {
  const theme = useTheme();
  const tabBarStyles = useMemo(() => styles(theme), [theme]);
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const tabs = useWorkspaceTabsStore((state) => state.tabs);
  const activeTabId = useWorkspaceTabsStore((state) => state.activeTabId);
  const setActiveTab = useWorkspaceTabsStore((state) => state.setActiveTab);
  const closeTab = useWorkspaceTabsStore((state) => state.closeTab);
  const closeOthers = useWorkspaceTabsStore((state) => state.closeOthers);
  const setMode = useWorkspaceTabsStore((state) => state.setMode);
  const setTitle = useWorkspaceTabsStore((state) => state.setTitle);
  const moveTab = useWorkspaceTabsStore((state) => state.moveTab);
  const updateApplication = useUpdateApplication();
  const trpcUtils = trpc.useUtils();

  const removeWorkflow = useWorkflowManager((state) => state.removeWorkflow);
  const workflowManagerStore = useWorkflowManagerStore();
  const getWorkflow = useWorkflowManager((state) => state.getWorkflow);
  const updateWorkflow = useWorkflowManager((state) => state.updateWorkflow);
  const saveWorkflow = useWorkflowManager((state) => state.saveWorkflow);

  const activeProjectId = useWorkspaceTabsStore(
    (state) => state.activeProjectId
  );

  const activeTab = useMemo(
    () => tabs.find((tab) => tab.id === activeTabId) ?? null,
    [tabs, activeTabId]
  );

  // The open project's tabs render as one run behind the scope chip; every
  // other tab keeps its place.
  const renderedTabs = useMemo(
    () => orderTabsForRender(tabs, activeProjectId),
    [tabs, activeProjectId]
  );
  const firstGroupedTabId = renderedTabs.find(
    (tab) => tab.projectId === activeProjectId
  )?.id;
  const groupName =
    renderedTabs.find(
      (tab) => tab.type === "project" && tab.ref === activeProjectId
    )?.title ?? "Project";

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
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", tabId);
    },
    []
  );

  const handleDragOver = useCallback(
    (event: DragEvent<HTMLDivElement>, tab: WorkspaceTab) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      const rect = event.currentTarget.getBoundingClientRect();
      const position =
        event.clientX < rect.left + rect.width / 2 ? "left" : "right";
      setDropTarget({ id: tab.id, position });
    },
    []
  );

  const handleDragLeave = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      const related = event.relatedTarget as Node | null;
      if (!related || !event.currentTarget.contains(related)) {
        setDropTarget(null);
      }
    },
    []
  );

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>, targetTab: WorkspaceTab) => {
      event.preventDefault();
      const sourceTabId = event.dataTransfer.getData("text/plain");
      if (!sourceTabId || sourceTabId === targetTab.id) {
        setDropTarget(null);
        return;
      }

      const rect = event.currentTarget.getBoundingClientRect();
      const position =
        event.clientX < rect.left + rect.width / 2 ? "left" : "right";

      const currentTabs = useWorkspaceTabsStore.getState().tabs;
      const sourceIndex = currentTabs.findIndex((tab) => tab.id === sourceTabId);
      const targetIndex = currentTabs.findIndex((tab) => tab.id === targetTab.id);
      if (sourceIndex === -1 || targetIndex === -1) {
        setDropTarget(null);
        return;
      }

      let toIndex = position === "right" ? targetIndex + 1 : targetIndex;
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
    [moveTab, syncWorkflowOrderFromTabs]
  );

  const commitRename = useCallback(
    async (tab: WorkspaceTab, newName: string) => {
      const trimmed = newName.trim();
      setEditingTabId(null);
      if (trimmed.length === 0 || trimmed === tab.title) {
        return;
      }

      // Workflows carry their name in the workflow store; the tab title is
      // synced from there by WorkspaceShell, so update + save the workflow.
      if (tab.type === "workflow") {
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
        return;
      }

      // Other document types own no store→tab sync: update the tab title
      // optimistically, persist the rename to the backing document keyed by
      // ref, and roll the title back if the server write fails.
      const previousTitle = tab.title;
      setTitle(tab.ref, tab.type, trimmed);
      try {
        switch (tab.type) {
          case "sketch":
            await renameSketchDocument(getActiveSketchInstance(), trimmed);
            break;
          case "image": {
            const asset = await useAssetStore.getState().update({
              id: tab.ref,
              name: trimmed
            });
            const sketchId = readSketchDocumentId(asset);
            if (sketchId) {
              const instance = getActiveSketchInstance();
              if (instance.session.getState().documentId === sketchId) {
                await renameSketchDocument(instance, trimmed);
              } else {
                await trpcClient.sketch.update.mutate({
                  id: sketchId,
                  name: trimmed
                });
              }
            }
            break;
          }
          case "timeline":
            await trpcClient.timeline.update.mutate({
              id: tab.ref,
              name: trimmed
            });
            break;
          case "model3d":
          case "text":
            await useAssetStore.getState().update({ id: tab.ref, name: trimmed });
            break;
          case "jsscript": {
            const store = useJsScriptStore.getState();
            if (store.scripts[tab.ref]) {
              store.setName(tab.ref, trimmed);
            } else {
              await trpcClient.jsScripts.update.mutate({
                id: tab.ref,
                name: trimmed
              });
            }
            break;
          }
          case "skill": {
            const currentSkill = trpcUtils.skills.get.getData({ id: tab.ref });
            if (!currentSkill) {
              throw new Error("Skill must finish loading before it can be renamed");
            }
            const updated = await trpcClient.skills.update.mutate({
              id: tab.ref,
              name: trimmed,
              baseUpdatedAt: currentSkill.updatedAt
            });
            trpcUtils.skills.get.setData({ id: tab.ref }, updated);
            void trpcUtils.skills.list.invalidate();
            break;
          }
          case "chat":
            await useGlobalChatStore
              .getState()
              .updateThreadTitle(tab.ref, trimmed);
            break;
          case "application":
            await updateApplication.mutateAsync({
              id: tab.ref,
              name: trimmed
            });
            break;
          case "project":
            await trpcClient.projects.update.mutate({
              id: tab.ref,
              name: trimmed
            });
            void trpcUtils.projects.list.invalidate();
            void trpcUtils.projects.summaries.invalidate();
            break;
          default:
            break;
        }
      } catch {
        setTitle(tab.ref, tab.type, previousTitle);
      }
    },
    [
      getWorkflow,
      updateWorkflow,
      saveWorkflow,
      setTitle,
      updateApplication,
      trpcUtils.skills.get,
      trpcUtils.skills.list,
      trpcUtils.projects.list,
      trpcUtils.projects.summaries
    ]
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

  const handleBeginRename = useCallback(
    (tab: WorkspaceTab) => {
      setActiveTab(tab.id);
      setEditingTabId(tab.id);
    },
    [setActiveTab]
  );

  const handleCancelRename = useCallback(() => setEditingTabId(null), []);

  return (
    <div css={tabBarStyles} className="workspace-tabbar">
      {/* Mobile has no vertical rail, so the panel toggle rides along in the
        top row instead of floating over the content. The sheet it opens is
        mobile's one navigation surface — document categories plus the app
        pages the desktop logo menu holds. */}
      {isMobile && <MobileRailLauncher />}
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
        <span className="new-tab-label">New</span>
        <span className="new-tab-caret" aria-hidden>
          ▾
        </span>
      </button>
      {isMobile ? (
        <MobileDocumentSelector
          tabs={tabs}
          activeTabId={activeTabId}
          typeColor={TYPE_COLOR}
          typeGlyph={TYPE_GLYPH}
          onActivate={setActiveTab}
          onClose={handleClose}
          onCloseAll={handleCloseAll}
        />
      ) : (
        <div className="tabs">
          {renderedTabs.map((tab) => (
            <Fragment key={tab.id}>
              {tab.id === firstGroupedTabId && activeProjectId && (
                <ProjectScopeChip
                  projectId={activeProjectId}
                  fallbackName={groupName}
                />
              )}
              <WorkspaceTabItem
                tab={tab}
                inProject={tab.projectId === activeProjectId}
                isActive={tab.id === activeTabId}
                isEditing={editingTabId === tab.id}
                canRename={tabCanRename(tab.type)}
                dropPosition={
                  dropTarget?.id === tab.id ? dropTarget.position : null
                }
                typeColor={TYPE_COLOR[tab.type]}
                typeGlyph={TYPE_GLYPH[tab.type]}
                onActivate={setActiveTab}
                onBeginRename={handleBeginRename}
                onClose={handleClose}
                onCloseOthers={handleCloseOthers}
                onCloseAll={handleCloseAll}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onCommitRename={commitRename}
                onCancelRename={handleCancelRename}
              />
            </Fragment>
          ))}
        </div>
      )}

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
            aria-pressed={activeTab.mode === "view"}
            onClick={() => setMode(activeTab.id, "view")}
          >
            View
          </button>
          <button
            type="button"
            className={activeTab.mode === "edit" ? "on" : ""}
            aria-pressed={activeTab.mode === "edit"}
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
