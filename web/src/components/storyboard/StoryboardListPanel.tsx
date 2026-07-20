/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/Add";
import DashboardOutlinedIcon from "@mui/icons-material/DashboardOutlined";
import {
  Fragment,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import type { FocusEvent, KeyboardEvent, MouseEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import {
  useCreateStoryboard,
  useStoryboards
} from "../../hooks/storyboard/useStoryboards";
import { usePanelStore } from "../../stores/PanelStore";
import { useWorkspaceTabsStore } from "../../stores/WorkspaceTabsStore";
import useContextMenuStore from "../../stores/ContextMenuStore";
import {
  useSidebarDocumentActionsStore,
  type SidebarDocumentItem
} from "../../stores/SidebarDocumentActionsStore";
import { trpc } from "../../trpc/client";
import { groupByDate } from "../../utils/groupByDate";
import ConfirmDialog from "../dialogs/ConfirmDialog";
import CategorySearchBar from "../node_menu/CategorySearchBar";
import {
  EmptyState,
  FlexColumn,
  FlexRow,
  LoadingSpinner,
  Text,
  ToolbarIconButton,
  TruncatedText,
  Tooltip,
  MOTION,
  SPACING,
  getSpacingPx
} from "../ui_primitives";

const styles = (theme: Theme) =>
  css({
    height: "100%",
    minHeight: 0,
    ".storyboard-search": {
      paddingBottom: theme.spacing(1)
    },
    ".storyboard-list": {
      minHeight: 0,
      overflowY: "auto",
      paddingRight: theme.spacing(0.5)
    },
    ".storyboard-item": {
      width: "100%",
      border: 0,
      borderRadius: theme.rounded.md,
      backgroundColor: "transparent",
      color: theme.vars.palette.text.primary,
      cursor: "pointer",
      padding: theme.spacing(1),
      textAlign: "left",
      transition: `background-color ${MOTION.fast}, color ${MOTION.fast}`,
      "&:hover": {
        backgroundColor: theme.vars.palette.action.hover
      },
      "&:focus-visible": {
        outline: `2px solid ${theme.vars.palette.primary.main}`,
        outlineOffset: -2
      },
      "&.active": {
        backgroundColor: theme.vars.palette.action.selected
      }
    },
    ".storyboard-icon": {
      flexShrink: 0,
      color: theme.vars.palette.text.secondary,
      fontSize: 20
    },
    ".rename-input": {
      width: "100%",
      background: "transparent",
      border: `1px solid ${theme.vars.palette.primary.main}`,
      borderRadius: theme.rounded.sm,
      color: "inherit",
      padding: `${getSpacingPx(SPACING.xs)} ${getSpacingPx(SPACING.md)}`,
      fontSize: "var(--fontSizeSmall)",
      fontWeight: 600,
      outline: "none"
    },
    ".date-header-row": {
      width: "100%",
      padding: `0 ${getSpacingPx(SPACING.lg)} ${getSpacingPx(SPACING.xs)} 0`,
      display: "flex",
      alignItems: "flex-end",
      borderBottom: "1px solid var(--palette-divider)"
    },
    ".date-header": {
      fontSize: theme.fontSizeSmaller,
      flexShrink: 0,
      padding: 0,
      lineHeight: 1.1,
      width: "100%",
      textAlign: "right",
      letterSpacing: "0.02em",
      textTransform: "uppercase",
      whiteSpace: "nowrap"
    }
  });

interface StoryboardListItemProps {
  id: string;
  name: string;
  active: boolean;
  editing: boolean;
  onOpen: (id: string, name: string) => void;
  onContextMenu: (
    event: MouseEvent<HTMLButtonElement>,
    id: string,
    name: string
  ) => void;
  onCommitRename: (id: string, newName: string) => void;
  onCancelRename: () => void;
}

const StoryboardListItem = memo(function StoryboardListItem({
  id,
  name,
  active,
  editing,
  onOpen,
  onContextMenu,
  onCommitRename,
  onCancelRename
}: StoryboardListItemProps) {
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
      <div className={`storyboard-item ${active ? "active" : ""}`}>
        <FlexRow align="center" gap={1} fullWidth>
          <DashboardOutlinedIcon className="storyboard-icon" />
          <FlexColumn gap={0.5} sx={{ minWidth: 0, flex: 1 }}>
            <input
              className="rename-input"
              type="text"
              defaultValue={name}
              aria-label="Storyboard name"
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
      className={`storyboard-item ${active ? "active" : ""}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onContextMenu={handleContextMenu}
      aria-current={active ? "page" : undefined}
    >
      <FlexRow align="center" gap={1} fullWidth>
        <DashboardOutlinedIcon className="storyboard-icon" />
        <FlexColumn gap={0.5} sx={{ minWidth: 0, flex: 1 }}>
          <TruncatedText
            component="span"
            sx={{ fontSize: "var(--fontSizeSmall)", fontWeight: 600 }}
          >
            {name || "Untitled storyboard"}
          </TruncatedText>
        </FlexColumn>
      </FlexRow>
    </button>
  );
});

export const CreateStoryboardButton = memo(function CreateStoryboardButton() {
  const createStoryboard = useCreateStoryboard();
  const openTab = useWorkspaceTabsStore((state) => state.openTab);
  const setVisibility = usePanelStore((state) => state.setVisibility);
  const navigate = useNavigate();
  const location = useLocation();

  const handleCreate = useCallback(async () => {
    try {
      const created = await createStoryboard.mutateAsync({
        name: "Untitled storyboard",
        projectId: "default"
      });
      openTab({
        type: "storyboard",
        ref: created.id,
        mode: "edit",
        title: created.name || "Untitled storyboard"
      });
      if (!location.pathname.startsWith("/workspace")) {
        navigate("/workspace");
      }
      setVisibility(false);
    } catch (error) {
      console.error("Failed to create storyboard", error);
    }
  }, [createStoryboard, location.pathname, navigate, openTab, setVisibility]);

  return (
    <Tooltip title="New storyboard" placement="right-start">
      <ToolbarIconButton
        ariaLabel="New storyboard"
        onClick={() => void handleCreate()}
        disabled={createStoryboard.isPending}
        tabIndex={-1}
        icon={<AddIcon />}
      />
    </Tooltip>
  );
});

const StoryboardListPanel = () => {
  const theme = useTheme();
  const [filterValue, setFilterValue] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  // Focus the filter on open so users can immediately type to search,
  // matching the workflows list panel.
  useEffect(() => {
    searchRef.current?.focus();
  }, []);
  const { data, isLoading, isError, error } = useStoryboards();
  const openTab = useWorkspaceTabsStore((state) => state.openTab);
  const activeTabId = useWorkspaceTabsStore((state) => state.activeTabId);
  const setVisibility = usePanelStore((state) => state.setVisibility);
  const navigate = useNavigate();
  const location = useLocation();

  const activeStoryboardId = activeTabId?.startsWith("storyboard:")
    ? activeTabId.slice("storyboard:".length)
    : null;

  const storyboards = useMemo(() => {
    const all = data ?? [];
    const needle = filterValue.trim().toLowerCase();
    const filtered = needle
      ? all.filter((board) => board.name.toLowerCase().includes(needle))
      : all;
    return [...filtered].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }, [data, filterValue]);

  const handleOpen = useCallback(
    (id: string, name: string) => {
      openTab({
        type: "storyboard",
        ref: id,
        mode: "edit",
        title: name || "Untitled storyboard"
      });
      if (!location.pathname.startsWith("/workspace")) {
        navigate("/workspace");
      }
      setVisibility(false);
    },
    [location.pathname, navigate, openTab, setVisibility]
  );

  const [editingId, setEditingId] = useState<string | null>(null);
  const [itemToDelete, setItemToDelete] = useState<SidebarDocumentItem | null>(
    null
  );
  const utils = trpc.useUtils();
  const createStoryboard = useCreateStoryboard();
  const updateStoryboard = trpc.storyboards.update.useMutation({
    onSuccess: (updated) => {
      utils.storyboards.get.setData({ id: updated.id }, updated);
      void utils.storyboards.list.invalidate();
    }
  });
  const deleteStoryboard = trpc.storyboards.delete.useMutation({
    onSuccess: () => {
      void utils.storyboards.list.invalidate();
    }
  });
  const openContextMenu = useContextMenuStore((state) => state.openContextMenu);
  const setActions = useSidebarDocumentActionsStore((state) => state.setActions);
  const clearActions = useSidebarDocumentActionsStore(
    (state) => state.clearActions
  );

  const handleContextMenu = useCallback(
    (event: MouseEvent<HTMLButtonElement>, id: string, name: string) => {
      event.preventDefault();
      event.stopPropagation();
      openContextMenu(
        "sidebar-document-context-menu",
        id,
        event.clientX,
        event.clientY,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        { id, name }
      );
    },
    [openContextMenu]
  );

  const handleCommitRename = useCallback(
    (id: string, newName: string) => {
      const trimmed = newName.trim();
      const current = (data ?? []).find((b) => b.id === id);
      setEditingId(null);
      if (trimmed && current && trimmed !== current.name) {
        updateStoryboard.mutate({ id, name: trimmed });
      }
    },
    [data, updateStoryboard]
  );

  const handleDuplicate = useCallback(
    async (item: SidebarDocumentItem) => {
      try {
        const source = await utils.storyboards.get.fetch({ id: item.id });
        const copy = await createStoryboard.mutateAsync({
          name: `${source.name} (copy)`.substring(0, 200),
          projectId: source.projectId
        });
        await updateStoryboard.mutateAsync({
          id: copy.id,
          document: source.document
        });
      } catch (error) {
        console.error("Failed to duplicate storyboard", error);
      }
    },
    [utils, createStoryboard, updateStoryboard]
  );

  const handleRequestDelete = useCallback((item: SidebarDocumentItem) => {
    setItemToDelete(item);
  }, []);

  const handleConfirmDelete = useCallback(() => {
    if (itemToDelete) {
      deleteStoryboard.mutate({ id: itemToDelete.id });
    }
  }, [itemToDelete, deleteStoryboard]);

  useEffect(() => {
    setActions({
      onRename: (item) => setEditingId(item.id),
      onDuplicate: (item) => void handleDuplicate(item),
      onDelete: handleRequestDelete
    });
    return () => clearActions();
  }, [setActions, clearActions, handleDuplicate, handleRequestDelete]);

  return (
    <FlexColumn fullHeight fullWidth gap={0} css={styles(theme)}>
      <ConfirmDialog
        open={itemToDelete !== null}
        onClose={() => setItemToDelete(null)}
        onConfirm={handleConfirmDelete}
        title="Delete storyboard"
        content={`Delete "${itemToDelete?.name ?? ""}"? This cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
      />
      <div className="storyboard-search">
        <CategorySearchBar
          ref={searchRef}
          value={filterValue}
          onChange={setFilterValue}
          placeholder="Search storyboards..."
        />
      </div>

      {isLoading ? (
        <FlexColumn gap={2} justify="center" align="center" sx={{ flex: 1 }}>
          <LoadingSpinner size="large" text="Loading storyboards" />
        </FlexColumn>
      ) : isError ? (
        <FlexColumn
          gap={2}
          justify="center"
          align="center"
          sx={{ flex: 1, px: 2 }}
        >
          <EmptyState
            variant="error"
            title="Could not load storyboards"
            description={error?.message ?? "Try again later."}
          />
        </FlexColumn>
      ) : storyboards.length === 0 ? (
        <FlexColumn
          gap={2}
          justify="center"
          align="center"
          sx={{ flex: 1, px: 2 }}
        >
          <EmptyState
            title={
              filterValue ? "No matching storyboards" : "No storyboards yet"
            }
            description={
              filterValue
                ? "Try a different search term."
                : "Create a new storyboard with the + button above."
            }
          />
        </FlexColumn>
      ) : (
        <FlexColumn className="storyboard-list" gap={0.5}>
          {(() => {
            let currentGroup = "";
            return storyboards.map((board) => {
              const group = groupByDate(board.updatedAt);
              const showHeader = group !== currentGroup;
              currentGroup = group;
              return (
                <Fragment key={board.id}>
                  {showHeader && (
                    <div className="date-header-row">
                      <Text
                        className="date-header"
                        size="small"
                        color="secondary"
                        weight={400}
                      >
                        {group}
                      </Text>
                    </div>
                  )}
                  <StoryboardListItem
                    id={board.id}
                    name={board.name}
                    active={board.id === activeStoryboardId}
                    editing={board.id === editingId}
                    onOpen={handleOpen}
                    onContextMenu={handleContextMenu}
                    onCommitRename={handleCommitRename}
                    onCancelRename={() => setEditingId(null)}
                  />
                </Fragment>
              );
            });
          })()}
        </FlexColumn>
      )}
    </FlexColumn>
  );
};

export default memo(StoryboardListPanel);
