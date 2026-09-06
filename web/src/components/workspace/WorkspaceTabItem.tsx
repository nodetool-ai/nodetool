/** @jsxImportSource @emotion/react */
import React, {
  memo,
  useCallback,
  useRef,
  useState,
  type DragEvent,
  type MouseEvent
} from "react";

import type { WorkspaceTab } from "../../stores/WorkspaceTabsStore";
import { useIsWorkflowRunning } from "../../hooks/useWorkflowRunnerState";
import { useWorkflowDirty } from "../../hooks/useWorkflowDirty";
import { useSettingsStore } from "../../stores/SettingsStore";
import {
  CloseButton,
  ContextMenu,
  LoadingSpinner,
  MenuItemPrimitive,
  Tooltip
} from "../ui_primitives";

// Tabs are scanned, not studied — the title has to land while the pointer is
// still moving. Well under the 700ms chrome default, and the native `title`
// attribute this replaced was slower still (~1s, browser-controlled).
const TAB_TITLE_TOOLTIP_DELAY = 150;
const TAB_TITLE_TOOLTIP_NEXT_DELAY = 0;

interface WorkspaceTabItemProps {
  tab: WorkspaceTab;
  isActive: boolean;
  /** Part of the open project's tab group — carries the group's underline. */
  inProject?: boolean;
  isEditing: boolean;
  canRename: boolean;
  dropPosition: "left" | "right" | null;
  typeColor: string;
  typeGlyph: string;
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
  inProject = false,
  isEditing,
  canRename,
  dropPosition,
  typeColor,
  typeGlyph,
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
  const cancelRenameRef = useRef(false);

  const dropClass =
    dropPosition === "left"
      ? " drop-target-left"
      : dropPosition === "right"
        ? " drop-target-right"
        : "";

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

  return (
    <>
      <div
        className={`tab${isActive ? " active" : ""}${
          inProject ? " in-project" : ""
        }${dropClass}`}
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
        <span className="glyph" style={{ color: typeColor }}>
          {typeGlyph}
        </span>
        {isEditing ? (
          <input
            type="text"
            className="tab-input"
            aria-label="Tab name"
            defaultValue={tab.title}
            autoFocus
            onClick={(event) => event.stopPropagation()}
            onFocus={(event) => event.currentTarget.select()}
            onBlur={(event) => {
              if (!cancelRenameRef.current) {
                void onCommitRename(tab, event.currentTarget.value);
              }
              cancelRenameRef.current = false;
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                event.stopPropagation();
                event.currentTarget.blur();
              } else if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                cancelRenameRef.current = true;
                onCancelRename();
              }
            }}
          />
        ) : (
          <>
            {isRunning && !instantUpdate && (
              <LoadingSpinner
                inline
                variant="circular"
                size={12}
                thickness={4}
                color="primary"
              />
            )}
            <Tooltip
              title={tab.title}
              placement="bottom"
              delay={TAB_TITLE_TOOLTIP_DELAY}
              nextDelay={TAB_TITLE_TOOLTIP_NEXT_DELAY}
            >
              <span className="tab-name">{tab.title}</span>
            </Tooltip>
            {isWorkflowDirty && (
              <span
                className="dirty-dot"
                role="img"
                aria-label="unsaved changes"
              />
            )}
          </>
        )}
        <CloseButton
          className="tab-close close-icon"
          buttonSize="small"
          tooltip={`Close ${tab.title}`}
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
        compact
      >
        {canRename && (
          <MenuItemPrimitive
            label="Rename"
            compact
            onClick={() => {
              closeContextMenu();
              onBeginRename(tab);
            }}
          />
        )}
        <MenuItemPrimitive
          label="Close Tab"
          compact
          onClick={() => {
            closeContextMenu();
            onClose(tab);
          }}
        />
        <MenuItemPrimitive
          label="Close Other Tabs"
          compact
          onClick={() => {
            closeContextMenu();
            onCloseOthers(tab);
          }}
        />
        <MenuItemPrimitive
          label="Close All Tabs"
          compact
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
