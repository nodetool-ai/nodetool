// One row of a sidebar document list. Carries no styles of its own — the panel
// root must apply `listPanelStyles`, which owns every class name used here.

import { memo, useCallback } from "react";
import type {
  DragEvent,
  ElementType,
  FocusEvent,
  KeyboardEvent,
  MouseEvent
} from "react";

import { FlexColumn } from "./FlexColumn";
import { FlexRow } from "./FlexRow";
import { Text } from "./Text";
import { TruncatedText } from "./TruncatedText";

export interface ListPanelItemProps {
  id: string;
  name: string;
  /** Shown in place of an empty name, e.g. "Untitled sketch". */
  fallbackName: string;
  /** What the rename input announces, e.g. "Sketch name". */
  renameLabel: string;
  /** Leading icon component, rendered with the `list-panel-icon` class. */
  icon: ElementType<{ className?: string }>;
  active: boolean;
  editing: boolean;
  /** Second line under the name, e.g. "2 operations". */
  secondary?: string;
  draggable?: boolean;
  onDragStart?: (event: DragEvent<HTMLButtonElement>) => void;
  onDragEnd?: (event: DragEvent<HTMLButtonElement>) => void;
  onOpen: (id: string, name: string) => void;
  onContextMenu: (
    event: MouseEvent<HTMLButtonElement>,
    id: string,
    name: string
  ) => void;
  onCommitRename: (id: string, newName: string) => void;
  onCancelRename: () => void;
}

export const ListPanelItem = memo(function ListPanelItem({
  id,
  name,
  fallbackName,
  renameLabel,
  icon: Icon,
  active,
  editing,
  secondary,
  draggable,
  onDragStart,
  onDragEnd,
  onOpen,
  onContextMenu,
  onCommitRename,
  onCancelRename
}: ListPanelItemProps) {
  const handleClick = useCallback(() => onOpen(id, name), [id, name, onOpen]);
  const handleContextMenu = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => onContextMenu(event, id, name),
    [id, name, onContextMenu]
  );
  const handleRenameKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      event.stopPropagation();
      if (event.key === "Enter") {
        onCommitRename(id, event.currentTarget.value);
      } else if (event.key === "Escape") {
        onCancelRename();
      }
    },
    [id, onCommitRename, onCancelRename]
  );
  const handleRenameBlur = useCallback(
    (event: FocusEvent<HTMLInputElement>) => {
      onCommitRename(id, event.currentTarget.value);
    },
    [id, onCommitRename]
  );
  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onOpen(id, name);
      }
    },
    [id, name, onOpen]
  );

  if (editing) {
    return (
      <div className={`list-panel-item ${active ? "active" : ""}`}>
        <FlexRow align="center" gap={1} fullWidth>
          <Icon className="list-panel-icon" />
          <FlexColumn gap={0.5} sx={{ minWidth: 0, flex: 1 }}>
            <input
              className="rename-input"
              type="text"
              defaultValue={name}
              aria-label={renameLabel}
              autoFocus
              onFocus={(event) => event.currentTarget.select()}
              onKeyDown={handleRenameKeyDown}
              onBlur={handleRenameBlur}
            />
          </FlexColumn>
        </FlexRow>
      </div>
    );
  }

  return (
    <button
      type="button"
      className={`list-panel-item ${active ? "active" : ""}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onContextMenu={handleContextMenu}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      aria-current={active ? "page" : undefined}
    >
      <FlexRow align="center" gap={1} fullWidth>
        <Icon className="list-panel-icon" />
        <FlexColumn gap={0.5} sx={{ minWidth: 0, flex: 1 }}>
          <TruncatedText
            component="span"
            sx={{ fontSize: "var(--fontSizeSmall)", fontWeight: 600 }}
          >
            {name || fallbackName}
          </TruncatedText>
          {secondary && (
            <Text size="small" color="secondary">
              {secondary}
            </Text>
          )}
        </FlexColumn>
      </FlexRow>
    </button>
  );
});
