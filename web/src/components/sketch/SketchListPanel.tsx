/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/Add";
import BrushOutlinedIcon from "@mui/icons-material/BrushOutlined";
import { memo, useCallback, useMemo, useState } from "react";
import type { KeyboardEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { usePanelStore } from "../../stores/PanelStore";
import { useWorkspaceTabsStore } from "../../stores/WorkspaceTabsStore";
import { trpc } from "../../trpc/client";
import CategorySearchBar from "../node_menu/CategorySearchBar";
import {
  Caption,
  EmptyState,
  FlexColumn,
  FlexRow,
  LoadingSpinner,
  ToolbarIconButton,
  TruncatedText,
  Tooltip
} from "../ui_primitives";

const styles = (theme: Theme) =>
  css({
    height: "100%",
    minHeight: 0,
    ".sketch-search": {
      paddingBottom: theme.spacing(1)
    },
    ".sketch-list": {
      minHeight: 0,
      overflowY: "auto",
      paddingRight: theme.spacing(0.5)
    },
    ".sketch-item": {
      width: "100%",
      border: 0,
      borderRadius: theme.rounded.md,
      backgroundColor: "transparent",
      color: theme.vars.palette.text.primary,
      cursor: "pointer",
      padding: theme.spacing(1),
      textAlign: "left",
      transition: "background-color 120ms ease, color 120ms ease",
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
    ".sketch-icon": {
      flexShrink: 0,
      color: theme.vars.palette.text.secondary,
      fontSize: 20
    },
    ".sketch-meta": {
      color: theme.vars.palette.text.secondary
    }
  });

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit"
});

function formatUpdatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Updated recently";
  }
  return `Updated ${dateFormatter.format(date)}`;
}

interface SketchListItemProps {
  id: string;
  name: string;
  updatedAt: string;
  active: boolean;
  onOpen: (id: string, name: string) => void;
}

const SketchListItem = memo(function SketchListItem({
  id,
  name,
  updatedAt,
  active,
  onOpen
}: SketchListItemProps) {
  const handleClick = useCallback(() => onOpen(id, name), [id, name, onOpen]);
  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onOpen(id, name);
      }
    },
    [id, name, onOpen]
  );

  return (
    <button
      type="button"
      className={`sketch-item ${active ? "active" : ""}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      aria-current={active ? "page" : undefined}
    >
      <FlexRow align="center" gap={1} fullWidth>
        <BrushOutlinedIcon className="sketch-icon" />
        <FlexColumn gap={0.25} sx={{ minWidth: 0, flex: 1 }}>
          <TruncatedText
            component="span"
            sx={{ fontSize: "var(--fontSizeSmall)", fontWeight: 600 }}
          >
            {name || "Untitled sketch"}
          </TruncatedText>
          <Caption className="sketch-meta">
            {formatUpdatedAt(updatedAt)}
          </Caption>
        </FlexColumn>
      </FlexRow>
    </button>
  );
});

export const CreateSketchButton = memo(function CreateSketchButton() {
  const utils = trpc.useUtils();
  const createSketch = trpc.sketch.create.useMutation({
    onSuccess: () => {
      void utils.sketch.list.invalidate();
    }
  });
  const openTab = useWorkspaceTabsStore((state) => state.openTab);
  const setVisibility = usePanelStore((state) => state.setVisibility);
  const navigate = useNavigate();
  const location = useLocation();

  const handleCreate = useCallback(async () => {
    try {
      const sketch = await createSketch.mutateAsync({
        name: "Untitled sketch",
        projectId: "default"
      });
      if (location.pathname.startsWith("/workspace")) {
        openTab({
          type: "sketch",
          ref: sketch.id,
          mode: "edit",
          title: sketch.name || "Untitled sketch"
        });
      } else {
        navigate(`/sketch/${sketch.id}`);
      }
      setVisibility(false);
    } catch (error) {
      console.error("Failed to create sketch", error);
    }
  }, [createSketch, location.pathname, navigate, openTab, setVisibility]);

  return (
    <Tooltip title="New sketch" placement="right-start">
      <ToolbarIconButton
        ariaLabel="New sketch"
        onClick={() => void handleCreate()}
        disabled={createSketch.isPending}
        tabIndex={-1}
        icon={<AddIcon />}
      />
    </Tooltip>
  );
});

const SketchListPanel = () => {
  const theme = useTheme();
  const [filterValue, setFilterValue] = useState("");
  const { data, isLoading, isError, error } = trpc.sketch.list.useQuery(
    {},
    { staleTime: 30_000 }
  );
  const openTab = useWorkspaceTabsStore((state) => state.openTab);
  const activeTabId = useWorkspaceTabsStore((state) => state.activeTabId);
  const setVisibility = usePanelStore((state) => state.setVisibility);
  const navigate = useNavigate();
  const location = useLocation();

  const activeSketchId = activeTabId?.startsWith("sketch:")
    ? activeTabId.slice("sketch:".length)
    : location.pathname.startsWith("/sketch/")
      ? location.pathname.split("/")[2]
      : null;

  const sketches = useMemo(() => {
    const all = data ?? [];
    const needle = filterValue.trim().toLowerCase();
    const filtered = needle
      ? all.filter((sketch) => sketch.name.toLowerCase().includes(needle))
      : all;
    return [...filtered].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }, [data, filterValue]);

  const handleOpen = useCallback(
    (id: string, name: string) => {
      if (location.pathname.startsWith("/workspace")) {
        openTab({
          type: "sketch",
          ref: id,
          mode: "edit",
          title: name || "Untitled sketch"
        });
      } else {
        navigate(`/sketch/${id}`);
      }
      setVisibility(false);
    },
    [location.pathname, navigate, openTab, setVisibility]
  );

  return (
    <FlexColumn fullHeight fullWidth gap={0} css={styles(theme)}>
      <div className="sketch-search">
        <CategorySearchBar
          value={filterValue}
          onChange={setFilterValue}
          placeholder="Search sketches..."
        />
      </div>

      {isLoading ? (
        <FlexColumn gap={2} justify="center" align="center" sx={{ flex: 1 }}>
          <LoadingSpinner size="large" text="Loading sketches" />
        </FlexColumn>
      ) : isError ? (
        <FlexColumn gap={2} justify="center" align="center" sx={{ flex: 1, px: 2 }}>
          <EmptyState
            variant="error"
            title="Could not load sketches"
            description={error?.message ?? "Try again later."}
          />
        </FlexColumn>
      ) : sketches.length === 0 ? (
        <FlexColumn gap={2} justify="center" align="center" sx={{ flex: 1, px: 2 }}>
          <EmptyState
            title={filterValue ? "No matching sketches" : "No sketches yet"}
            description={
              filterValue
                ? "Try a different search term."
                : "Create a new sketch with the + button above."
            }
          />
        </FlexColumn>
      ) : (
        <FlexColumn className="sketch-list" gap={0.5}>
          {sketches.map((sketch) => (
            <SketchListItem
              key={sketch.id}
              id={sketch.id}
              name={sketch.name}
              updatedAt={sketch.updatedAt}
              active={sketch.id === activeSketchId}
              onOpen={handleOpen}
            />
          ))}
        </FlexColumn>
      )}
    </FlexColumn>
  );
};

export default memo(SketchListPanel);
