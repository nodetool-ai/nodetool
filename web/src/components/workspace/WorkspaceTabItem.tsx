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
import {
  CloseButton,
  ContextMenu,
  LoadingSpinner,
  MenuItemPrimitive
} from "../ui_primitives";

export interface WorkspaceTabItemProps {
  tab: WorkspaceTab;
  isActive: boolean;
  isEditing: boolean;
  dropTarget: { id: string; position: "left" | "right" } | null;
  typeColor: string;
  typeGlyph: string;
  onActivate: (tabId: string) => void;
  onBeginRename: (tab: WorkspaceTab) => void;
  onClose: (tab: WorkspaceTab) => void;
  onCloseOthers: (tab: WorkspaceTab) => void;
  onCloseAll: () => void;
  onDragStart: (event: DragEvent<HTMLDivElement>, tabId: string) => void;
  onDragOver: (event: DragEvent<HTMLDivElement>, tab: WorkspaceTab) => void;
  onDragLeave: () => void;
  onDrop: (event: DragEvent<HTMLDivElement>, tab: WorkspaceTab) => void;
  onCommitRename: (tab: WorkspaceTab, newName: string) => void;
  onCancelRename: () => void;
}

const WorkspaceTabItem = ({
  tab,
  isActive,
  isEditing,
  dropTarget,
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

  const [contextMenuPosition, setContextMenuPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const skipBlurCommitRef = useRef(false);

  const dropClass =
    dropTarget?.id === tab.id
      ? dropTarget.position === "left"
        ? " drop-target-left"
        : " drop-target-right"
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

  const handleTabKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
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
        className={`tab${isActive ? " active" : ""}${dropClass}`}
        role="tab"
        aria-selected={isActive}
        tabIndex={0}
        draggable={!isEditing}
        onClick={() => onActivate(tab.id)}
        onKeyDown={handleTabKeyDown}
        onContextMenu={handleContextMenu}
        onDoubleClick={() => {
          if (tab.type === "workflow") {
            onBeginRename(tab);
          }
        }}
        onAuxClick={handleAuxClick}
        onDragStart={(event) => onDragStart(event, tab.id)}
        onDragOver={(event) => onDragOver(event, tab)}
        onDragLeave={onDragLeave}
        onDrop={(event) => onDrop(event, tab)}
      >
        <span className="glyph" style={{ color: typeColor }}>
          {typeGlyph}
        </span>
        {isEditing ? (
          <input
            type="text"
            className="tab-input"
            aria-label="Workflow name"
            defaultValue={tab.title}
            autoFocus
            onClick={(event) => event.stopPropagation()}
            onFocus={(event) => event.currentTarget.select()}
            onBlur={(event) => {
              if (skipBlurCommitRef.current) {
                skipBlurCommitRef.current = false;
                return;
              }
              void onCommitRename(tab, event.currentTarget.value);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                event.stopPropagation();
                skipBlurCommitRef.current = true;
                void onCommitRename(tab, event.currentTarget.value);
              } else if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                skipBlurCommitRef.current = true;
                onCancelRename();
              }
            }}
          />
        ) : (
          <>
            {isRunning && (
              <LoadingSpinner
                inline
                variant="circular"
                size={12}
                thickness={4}
                color="primary"
              />
            )}
            <span className="tab-name">{tab.title}</span>
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
