/** @jsxImportSource @emotion/react */
import React, {
  memo,
  useCallback,
  useState,
  type DragEvent,
  type MouseEvent
} from "react";
import { useTranslation } from "react-i18next";

import type { WorkspaceTab } from "../../stores/WorkspaceTabsStore";
import { useIsWorkflowRunning } from "../../hooks/useWorkflowRunnerState";
import { useWorkflowDirty } from "../../hooks/useWorkflowDirty";
import { useSettingsStore } from "../../stores/SettingsStore";
import {
  CloseButton,
  ContextMenu,
  InlineEditableText,
  LoadingSpinner,
  MenuItemPrimitive,
  StatusDot,
  Tooltip
} from "../ui_primitives";
import { tabDisplayTitle } from "./tabTypeIdentity";

// Tabs are scanned, not studied — the title has to land while the pointer is
// still moving. Well under the 700ms chrome default, and the native `title`
// attribute this replaced was slower still (~1s, browser-controlled).
const TAB_TITLE_TOOLTIP_DELAY = 150;
const TAB_TITLE_TOOLTIP_NEXT_DELAY = 0;

interface WorkspaceTabItemProps {
  tab: WorkspaceTab;
  isActive: boolean;
  isEditing: boolean;
  canRename: boolean;
  dropPosition: "left" | "right" | null;
  onActivate: (tabId: string) => void;
  onBeginRename: (tab: WorkspaceTab) => void;
  onClose: (tab: WorkspaceTab) => void;
  onCloseOthers: (tab: WorkspaceTab) => void;
  onCloseAll: () => void;
  onDragStart: (event: DragEvent<HTMLDivElement>, tabId: string) => void;
  onDragOver: (event: DragEvent<HTMLDivElement>, tab: WorkspaceTab) => void;
  onDragLeave: (event: DragEvent<HTMLDivElement>) => void;
  onDrop: (event: DragEvent<HTMLDivElement>, tab: WorkspaceTab) => void;
  onCommitRename: (tab: WorkspaceTab, newName: string) => void;
  onCancelRename: () => void;
}

const WorkspaceTabItem = ({
  tab,
  isActive,
  isEditing,
  canRename,
  dropPosition,
  onActivate,
  onBeginRename,
  onClose,
  onCloseOthers,
  onCloseAll,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onCommitRename,
  onCancelRename
}: WorkspaceTabItemProps) => {
  const { t } = useTranslation();
  const workflowId = tab.type === "workflow" ? tab.ref : undefined;
  const isWorkflowDirty = useWorkflowDirty(workflowId);
  const isRunning = useIsWorkflowRunning(workflowId);
  // Instant-update mode re-runs the graph on every keystroke, so the per-run
  // tab spinner would strobe on/off continuously — suppress it (and its
  // animation) while instant update is on.
  const instantUpdate = useSettingsStore(
    (state) => state.settings.instantUpdate
  );

  const [contextMenuPosition, setContextMenuPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);

  const dropClass =
    dropPosition === "left"
      ? " drop-target-left"
      : dropPosition === "right"
        ? " drop-target-right"
        : "";

  const handleCommitRename = useCallback(
    (newName: string) => {
      void onCommitRename(tab, newName);
    },
    [onCommitRename, tab]
  );

  // The primitive leaves edit mode on commit; the parent owns `isEditing`, and
  // its rename state is cleared through the same cancel path.
  const handleEditingChange = useCallback(
    (next: boolean) => {
      if (!next) {
        onCancelRename();
      }
    },
    [onCancelRename]
  );

  const closeContextMenu = useCallback(() => {
    setContextMenuPosition(null);
  }, []);

  const handleContextMenu = useCallback((event: MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    setContextMenuPosition({ x: event.clientX, y: event.clientY });
  }, []);

  const handleAuxClick = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (event.button === 1) {
        event.preventDefault();
        event.stopPropagation();
        onClose(tab);
      }
    },
    [onClose, tab]
  );

  const handleMouseDown = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      // While renaming, the input must receive the mousedown so it can
      // focus and accept the caret. preventDefault here is only for the
      // idle tab, where it stops text-selection during a drag.
      if (event.button === 0 && !isEditing) {
        event.preventDefault();
      }
    },
    [isEditing]
  );

  const displayTitle = tabDisplayTitle(tab);

  const handleTabKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      // Keydown from children bubbles here — the rename input needs Space to
      // type a space, and the close button handles its own Enter/Space.
      if (event.target !== event.currentTarget) {
        return;
      }
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onActivate(tab.id);
      }
    },
    [onActivate, tab.id]
  );

  const [titleTruncated, setTitleTruncated] = useState(false);
  const handleNameMouseOver = useCallback(
    (event: MouseEvent<HTMLSpanElement>) => {
      const name = event.currentTarget;
      setTitleTruncated(name.scrollWidth > name.clientWidth);
    },
    []
  );

  return (
    <>
      <div
        className={`tab${isActive ? " active" : ""}${tab.type === "project" ? " is-home" : ""}${dropClass}`}
        role="tab"
        aria-selected={isActive}
        tabIndex={0}
        draggable={!isEditing}
        onClick={() => onActivate(tab.id)}
        onKeyDown={handleTabKeyDown}
        onContextMenu={handleContextMenu}
        onDoubleClick={() => {
          if (canRename) {
            onBeginRename(tab);
          }
        }}
        onMouseDown={handleMouseDown}
        onAuxClick={handleAuxClick}
        onDragStart={(event) => onDragStart(event, tab.id)}
        onDragOver={(event) => onDragOver(event, tab)}
        onDragLeave={(event) => onDragLeave(event)}
        onDrop={(event) => onDrop(event, tab)}
      >
        {isEditing ? (
          <InlineEditableText
            className="tab-input"
            ariaLabel={t("batch2_0.tabName")}
            value={tab.title}
            editing
            onEditingChange={handleEditingChange}
            onCommit={handleCommitRename}
            onCancel={onCancelRename}
          />
        ) : (
          <>
            {isRunning && !instantUpdate && (
              <LoadingSpinner
                inline
                size={14}
                color="primary"
              />
            )}
            {/* Only a cut-off name needs its full text. The tooltip drops
                below the tab onto the page's own tabs, so it never takes the
                pointer either. */}
            <Tooltip
              title={titleTruncated ? displayTitle : ""}
              placement="bottom"
              delay={TAB_TITLE_TOOLTIP_DELAY}
              nextDelay={TAB_TITLE_TOOLTIP_NEXT_DELAY}
              disableInteractive
            >
              <span className="tab-name" onMouseOver={handleNameMouseOver}>
                {displayTitle}
              </span>
            </Tooltip>
            {isWorkflowDirty && (
              <StatusDot tone="warning" size="medium" label={t("batch2_0.unsavedChanges")} />
            )}
          </>
        )}
        <CloseButton
          className="tab-close close-icon"
          buttonSize="small"
          tooltip={t("batch2_0.closeTabNamed", { name: displayTitle })}
          onClick={(event) => {
            event.stopPropagation();
            onClose(tab);
          }}
        />
      </div>

      <ContextMenu
        open={contextMenuPosition !== null}
        position={contextMenuPosition}
        onClose={closeContextMenu}
      >
        {canRename && (
          <MenuItemPrimitive
            label={t("batch2_0.rename")}
            onClick={() => {
              closeContextMenu();
              onBeginRename(tab);
            }}
          />
        )}
        <MenuItemPrimitive
          label={t("batch2_0.closeTab")}
          onClick={() => {
            closeContextMenu();
            onClose(tab);
          }}
        />
        <MenuItemPrimitive
          label={t("batch2_0.closeOtherTabs")}
          onClick={() => {
            closeContextMenu();
            onCloseOthers(tab);
          }}
        />
        <MenuItemPrimitive
          label={t("batch2_0.closeAllTabs")}
          onClick={() => {
            closeContextMenu();
            onCloseAll();
          }}
        />
      </ContextMenu>
    </>
  );
};

export default memo(WorkspaceTabItem);
