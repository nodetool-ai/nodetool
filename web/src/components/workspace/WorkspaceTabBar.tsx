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
import { useTranslation } from "react-i18next";
import { useMediaQuery } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

import {
  dropTargetIndex,
  isTabInScope,
  useWorkspaceTabsStore,
  type WorkspaceTab,
  type WorkspaceTabType
} from "../../stores/WorkspaceTabsStore";
import { useWorkflowManagerStore } from "../../contexts/WorkflowManagerContext";
import { tabCanRename } from "./tabRename";
import { useRenameDocument } from "../../hooks/useRenameDocument";
import { useWorkspaceDocumentClose } from "../../hooks/useWorkspaceDocumentClose";
import { HEADER_HEIGHT, TOOLBAR_WIDTH } from "../../config/constants";
import AddIcon from "@mui/icons-material/Add";

import {
  BORDER_RADIUS,
  CONTROL,
  focusRing,
  MOTION,
  SPACING,
  getSpacingPx,
  ICON_SIZE,
  ToolbarIconButton
} from "../ui_primitives";
import NotificationButton from "../panels/NotificationButton";
import SettingsHeaderButton from "../panels/SettingsHeaderButton";
import OpenMenu from "./OpenMenu";
import WorkspaceTabItem from "./WorkspaceTabItem";
import MobileDocumentSelector from "./MobileDocumentSelector";
import MobileRailLauncher from "../panels/MobileRailLauncher";
import ProjectSelector from "../projects/ProjectSelector";
import { ActivityIndicator } from "../timeline/ActivityIndicator";
import { TYPE_COLOR, TYPE_GLYPH } from "./tabTypeIdentity";
import { useWorkspaceHeaderActions } from "./WorkspaceHeaderActionsContext";

/** Whether a document type supports both View and Edit (vs view-only). */
const SUPPORTS_BOTH_MODES = {
  workflow: false,
  image: true,
  svg: true,
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
  application: true,
  "example-app": false,
  game: true,
  page: false,
  "project-list": false,
  project: false,
  "guided-flow": false,
  "project-new": false
} satisfies Record<WorkspaceTabType, boolean>;

/** One half of a two-way switch in the tab bar, level with the 28px icon buttons. */
const segmentStyles = (theme: Theme) => ({
  display: "flex",
  alignItems: "center",
  height: `${CONTROL.height.sm}px`,
  margin: 0,
  padding: `0 ${getSpacingPx(SPACING.lg)}`,
  border: `1px solid ${theme.vars.palette.divider}`,
  borderRadius: 0,
  background: "transparent",
  color: theme.vars.palette.text.secondary,
  cursor: "pointer",
  fontFamily: "inherit",
  fontSize: "var(--fontSizeSmaller)",
  fontWeight: 500,
  lineHeight: 1,
  whiteSpace: "nowrap" as const,
  "&:hover": {
    color: theme.vars.palette.text.primary,
    backgroundColor: theme.vars.palette.action.hover
  },
  "&:first-of-type": {
    borderRadius: `${BORDER_RADIUS.sm} 0 0 ${BORDER_RADIUS.sm}`,
    borderRight: "none"
  },
  "&:last-of-type": {
    borderRadius: `0 ${BORDER_RADIUS.sm} ${BORDER_RADIUS.sm} 0`
  }
});

const styles = (theme: Theme) =>
  css({
    display: "flex",
    alignItems: "stretch",
    height: `${HEADER_HEIGHT}px`,
    flexShrink: 0,
    // Clear the full-height left rail (PanelLeft) which now runs to top 0.
    paddingLeft: `${TOOLBAR_WIDTH}px`,
    backgroundColor: theme.vars.palette.c_app_header,
    borderBottom: `1px solid ${theme.vars.palette.divider}`,
    WebkitAppRegion: "drag",
    userSelect: "none",

    // The strip takes only the width its tabs need, so the new-tab button
    // follows the last tab. The spacer after it keeps the window draggable.
    "& .tabs": {
      flex: "0 1 auto",
      minWidth: 0,
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
      gap: getSpacingPx(SPACING.sm),
      minWidth: "120px",
      maxWidth: "220px",
      flex: "0 0 auto",
      padding: `0 ${getSpacingPx(SPACING.lg)}`,
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
        backgroundColor: "var(--c_editor_bg_color)",
        boxShadow: `inset 0 -2px 0 ${theme.vars.palette.primary.main}`
      },
      "&.is-home": {
        minWidth: 0,
        padding: `0 ${getSpacingPx(SPACING.lg)}`
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
      outline: "none",
      borderRadius: BORDER_RADIUS.sm,
      "&:focus-visible": focusRing(theme, 2)
    },

    // Every tab-bar control draws the shared inset keyboard ring; the strip
    // scrolls, so a ring outside the box would be clipped.
    "& .tab:focus-visible, & .new-tab:focus-visible, & .mode-toggle button:focus-visible":
      focusRing(theme),

    "& .glyph": { flexShrink: 0, fontSize: "var(--fontSizeSmall)" },
    "& .tab-name": {
      flex: 1,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      minWidth: 0
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
        fontSize: ICON_SIZE.sm
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
      color: theme.vars.palette.text.secondary,
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
        color: theme.vars.palette.text.primary,
        backgroundColor: theme.vars.palette.action.hover
      }
    },

    "& .new-tab-icon": {
      WebkitAppRegion: "no-drag",
      flexShrink: 0,
      alignSelf: "center",
      margin: `0 ${getSpacingPx(SPACING.xs)}`
    },

    "& .tabbar-spacer": {
      flex: 1,
      minWidth: getSpacingPx(SPACING.xl)
    },

    "& .mode-toggle": {
      WebkitAppRegion: "no-drag",
      display: "flex",
      alignItems: "center",
      padding: `0 ${getSpacingPx(SPACING.md)}`,
      flexShrink: 0,
      "& button": {
        ...segmentStyles(theme),
        "&.on": {
          color: theme.vars.palette.primary.contrastText,
          backgroundColor: theme.vars.palette.primary.main,
          borderColor: theme.vars.palette.primary.main
        }
      }
    },

    "& .document-actions": {
      display: "flex",
      alignItems: "stretch",
      flexShrink: 0
    },

    "& .right-actions": {
      WebkitAppRegion: "no-drag",
      display: "flex",
      alignItems: "center",
      flexShrink: 0,
      gap: getSpacingPx(SPACING.xs),
      paddingRight: getSpacingPx(SPACING.xs),
      "& .MuiIconButton-root": {
        minWidth: `${CONTROL.height.sm}px`,
        width: `${CONTROL.height.sm}px`,
        height: `${CONTROL.height.sm}px`,
        padding: 0,
        color: theme.vars.palette.text.secondary,
        borderRadius: BORDER_RADIUS.md,
        "&:hover": {
          color: theme.vars.palette.text.primary,
          backgroundColor: theme.vars.palette.action.hover
        },
        "&.Mui-focusVisible": focusRing(theme)
      },
      // A document's own segmented switch (the timeline's Video / DAW)
      // matches View / Edit, with the quieter selected fill of a sub-mode.
      "& .MuiToggleButtonGroup-root": {
        flexShrink: 0,
        "& .MuiToggleButton-root": {
          ...segmentStyles(theme),
          minHeight: 0,
          "&.Mui-selected, &.Mui-selected:hover": {
            color: theme.vars.palette.text.primary,
            backgroundColor: theme.vars.palette.action.selected
          },
          "&.Mui-focusVisible": focusRing(theme)
        }
      },
      "& svg, & .MuiSvgIcon-root": {
        width: "16px",
        height: "16px",
        fontSize: ICON_SIZE.sm
      }
    },

    // Mobile: no left rail to clear. The bar stacks 48px rows so the global
    // 44px touch-target minimum fits and every control keeps its text label
    // (see the isMobile branch of WorkspaceTabBar).
    "&.is-mobile": {
      height: "auto",
      flexDirection: "column",
      paddingLeft: 0,
      "& .mobile-row": {
        display: "flex",
        alignItems: "stretch",
        minWidth: 0,
        height: "48px",
        "& + .mobile-row": {
          borderTop: `1px solid ${theme.vars.palette.divider}`
        }
      },
      "& .app-row .project-selector": {
        flex: 1,
        minWidth: 0,
        maxWidth: "none"
      },
      "& .app-row .right-actions": {
        gap: 0,
        paddingRight: getSpacingPx(SPACING.xs),
        "& .MuiIconButton-root": {
          minWidth: CONTROL.height.xl,
          width: CONTROL.height.xl,
          height: CONTROL.height.xl
        },
        "& svg, & .MuiSvgIcon-root": {
          width: "20px",
          height: "20px"
        }
      },
      "& .document-row .new-tab": {
        borderRight: "none",
        borderLeft: `1px solid ${theme.vars.palette.divider}`,
        color: theme.vars.palette.primary.main,
        padding: `0 ${getSpacingPx(SPACING.lg)}`,
        "& .new-tab-caret": { display: "none" }
      },
      "& .document-row .mode-toggle": {
        padding: `0 ${getSpacingPx(SPACING.sm)}`
      },
      "& .actions-row .right-actions": {
        flex: 1,
        justifyContent: "flex-end",
        overflowX: "auto"
      }
    }
  });

const WorkspaceTabBar = React.memo(function WorkspaceTabBar() {
  const { t } = useTranslation();
  const theme = useTheme();
  const tabBarStyles = useMemo(() => styles(theme), [theme]);
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const tabs = useWorkspaceTabsStore((state) => state.tabs);
  const activeTabId = useWorkspaceTabsStore((state) => state.activeTabId);
  const setActiveTab = useWorkspaceTabsStore((state) => state.setActiveTab);
  const {
    closeDocument: handleClose,
    closeOtherDocuments: handleCloseOthers,
    closeAllDocuments: handleCloseAll
  } = useWorkspaceDocumentClose();
  const setMode = useWorkspaceTabsStore((state) => state.setMode);
  const moveTab = useWorkspaceTabsStore((state) => state.moveTab);
  const renameDocument = useRenameDocument();
  const headerActions = useWorkspaceHeaderActions()?.actions;

  const workflowManagerStore = useWorkflowManagerStore();

  const activeProjectId = useWorkspaceTabsStore(
    (state) => state.activeProjectId
  );
  const visibleTabs = useMemo(
    () =>
      tabs.filter(
        (tab) =>
          tab.type !== "project-new" && isTabInScope(tab, activeProjectId)
      ),
    [activeProjectId, tabs]
  );

  const activeTab = useMemo(
    () => tabs.find((tab) => tab.id === activeTabId) ?? null,
    [tabs, activeTabId]
  );
  const homeIsActive = !activeTab || activeTab.type === "project-new";

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
      const currentIdx = manager.openWorkflows.findIndex(
        (wf) => wf.id === wantId
      );
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

  const handleDragLeave = useCallback((event: DragEvent<HTMLDivElement>) => {
    const related = event.relatedTarget as Node | null;
    if (!related || !event.currentTarget.contains(related)) {
      setDropTarget(null);
    }
  }, []);

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
      const toIndex = dropTargetIndex(
        currentTabs,
        sourceTabId,
        targetTab.id,
        position
      );
      if (toIndex === null) {
        setDropTarget(null);
        return;
      }

      moveTab(sourceTabId, toIndex);

      const sourceTab = currentTabs.find((tab) => tab.id === sourceTabId);
      if (sourceTab?.type === "workflow") {
        syncWorkflowOrderFromTabs();
      }

      setDropTarget(null);
    },
    [moveTab, syncWorkflowOrderFromTabs]
  );

  const commitRename = useCallback(
    async (tab: WorkspaceTab, newName: string) => {
      setEditingTabId(null);
      await renameDocument(
        { type: tab.type, ref: tab.ref, currentName: tab.title },
        newName
      );
    },
    [renameDocument]
  );

  const handleBeginRename = useCallback(
    (tab: WorkspaceTab) => {
      setActiveTab(tab.id);
      setEditingTabId(tab.id);
    },
    [setActiveTab]
  );

  const handleCancelRename = useCallback(() => setEditingTabId(null), []);

  // Phones keep the labelled "+ New" button in the document row.
  const mobileNewTabButton = (
    <button
      ref={newTabButtonRef}
      type="button"
      className="new-tab"
      aria-label={t("i18n-next51.tabBar.openOrCreateTab")}
      aria-haspopup="menu"
      aria-expanded={menuOpen}
      onClick={() => setMenuOpen((v) => !v)}
    >
      <span className="new-tab-plus" aria-hidden>
        +
      </span>
      <span className="new-tab-label">{t("i18n-next51.tabBar.new")}</span>
      <span className="new-tab-caret" aria-hidden>
        ▾
      </span>
    </button>
  );

  const openMenu = (
    <OpenMenu
      anchorEl={newTabButtonRef.current}
      open={menuOpen}
      onClose={() => setMenuOpen(false)}
    />
  );

  const modeToggle = activeTab && SUPPORTS_BOTH_MODES[activeTab.type] && (
    <div className="mode-toggle">
      <button
        type="button"
        className={activeTab.mode === "view" ? "on" : ""}
        aria-pressed={activeTab.mode === "view"}
        onClick={() => setMode(activeTab.id, "view")}
      >
        {t("i18n-next51.tabBar.view")}
      </button>
      <button
        type="button"
        className={activeTab.mode === "edit" ? "on" : ""}
        aria-pressed={activeTab.mode === "edit"}
        onClick={() => setMode(activeTab.id, "edit")}
      >
        {t("i18n-next51.tabBar.edit")}
      </button>
    </div>
  );

  if (isMobile) {
    // Phones get two labelled rows instead of one strip of glyphs: the top
    // row says where you are (menu, project, app status), the second says
    // what you are looking at (current document, New). Document-specific
    // actions, when a document supplies them, take a third row.
    return (
      <div css={tabBarStyles} className="workspace-tabbar is-mobile">
        <div className="mobile-row app-row">
          {/* The sheet this opens is mobile's one navigation surface:
            document categories plus the app pages the desktop logo menu
            holds. */}
          <MobileRailLauncher />
          <ProjectSelector mobile />
          <div className="right-actions">
            <ActivityIndicator />
            <NotificationButton />
            <SettingsHeaderButton />
          </div>
        </div>
        <div className="mobile-row document-row">
          <MobileDocumentSelector
            tabs={visibleTabs}
            activeTabId={activeTabId}
            typeColor={TYPE_COLOR}
            typeGlyph={TYPE_GLYPH}
            homeIsActive={homeIsActive}
            onActivate={setActiveTab}
            onClose={handleClose}
            onCloseAll={handleCloseAll}
          />
          {modeToggle}
          {mobileNewTabButton}
        </div>
        {headerActions && (
          <div className="mobile-row actions-row">
            <div className="right-actions">{headerActions}</div>
          </div>
        )}
        {openMenu}
      </div>
    );
  }

  return (
    <div
      css={tabBarStyles}
      className={`workspace-tabbar${headerActions || (activeTab && SUPPORTS_BOTH_MODES[activeTab.type]) ? " has-document-actions" : ""}`}
    >
      <ProjectSelector />
      <div className="tabs">
        {visibleTabs.map((tab) => (
          <Fragment key={tab.id}>
            <WorkspaceTabItem
              tab={tab}
              isActive={tab.id === activeTabId}
              isEditing={editingTabId === tab.id}
              canRename={tabCanRename(tab.type)}
              dropPosition={
                dropTarget?.id === tab.id ? dropTarget.position : null
              }
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
      <ToolbarIconButton
        ref={newTabButtonRef}
        className="new-tab-icon"
        icon={<AddIcon />}
        tooltip={t("i18n-next51.tabBar.openOrCreateTab")}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((v) => !v)}
      />
      <div className="tabbar-spacer" />

      {openMenu}

      <div className="document-actions">
        {modeToggle}

        <div className="right-actions">
          {headerActions}
          <ActivityIndicator />
          <NotificationButton />
          <SettingsHeaderButton />
        </div>
      </div>
    </div>
  );
});

export default WorkspaceTabBar;
