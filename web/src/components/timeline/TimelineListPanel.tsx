/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/Add";
import MovieOutlinedIcon from "@mui/icons-material/MovieOutlined";
import { memo, useCallback, useMemo, useState } from "react";
import type { KeyboardEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { useCreateTimeline, useTimelines } from "../../hooks/useTimelineSequence";
import { usePanelStore } from "../../stores/PanelStore";
import { useWorkspaceTabsStore } from "../../stores/WorkspaceTabsStore";
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
    ".timeline-search": {
      paddingBottom: theme.spacing(1)
    },
    ".timeline-list": {
      minHeight: 0,
      overflowY: "auto",
      paddingRight: theme.spacing(0.5)
    },
    ".timeline-item": {
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
    ".timeline-icon": {
      flexShrink: 0,
      color: theme.vars.palette.text.secondary,
      fontSize: 20
    },
    ".timeline-meta": {
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

interface TimelineListItemProps {
  id: string;
  name: string;
  updatedAt: string;
  active: boolean;
  onOpen: (id: string, name: string) => void;
}

const TimelineListItem = memo(function TimelineListItem({
  id,
  name,
  updatedAt,
  active,
  onOpen
}: TimelineListItemProps) {
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
      className={`timeline-item ${active ? "active" : ""}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      aria-current={active ? "page" : undefined}
    >
      <FlexRow align="center" gap={1} fullWidth>
        <MovieOutlinedIcon className="timeline-icon" />
        <FlexColumn gap={0.5} sx={{ minWidth: 0, flex: 1 }}>
          <TruncatedText
            component="span"
            sx={{ fontSize: "var(--fontSizeSmall)", fontWeight: 600 }}
          >
            {name || "Untitled video"}
          </TruncatedText>
          <Caption className="timeline-meta">
            {formatUpdatedAt(updatedAt)}
          </Caption>
        </FlexColumn>
      </FlexRow>
    </button>
  );
});

export const CreateTimelineButton = memo(function CreateTimelineButton() {
  const createTimeline = useCreateTimeline();
  const openTab = useWorkspaceTabsStore((state) => state.openTab);
  const setVisibility = usePanelStore((state) => state.setVisibility);
  const navigate = useNavigate();
  const location = useLocation();

  const handleCreate = useCallback(async () => {
    try {
      const timeline = await createTimeline.mutateAsync({
        name: "Untitled video",
        projectId: "default"
      });
      if (location.pathname.startsWith("/workspace")) {
        openTab({
          type: "timeline",
          ref: timeline.id,
          mode: "edit",
          title: timeline.name || "Untitled video"
        });
      } else {
        navigate(`/timeline/${timeline.id}`);
      }
      setVisibility(false);
    } catch (error) {
      console.error("Failed to create timeline", error);
    }
  }, [createTimeline, location.pathname, navigate, openTab, setVisibility]);

  return (
    <Tooltip title="New timeline" placement="right-start">
      <ToolbarIconButton
        ariaLabel="New timeline"
        onClick={() => void handleCreate()}
        disabled={createTimeline.isPending}
        tabIndex={-1}
        icon={<AddIcon />}
      />
    </Tooltip>
  );
});

const TimelineListPanel = () => {
  const theme = useTheme();
  const [filterValue, setFilterValue] = useState("");
  const { data, isLoading, isError, error } = useTimelines();
  const openTab = useWorkspaceTabsStore((state) => state.openTab);
  const activeTabId = useWorkspaceTabsStore((state) => state.activeTabId);
  const setVisibility = usePanelStore((state) => state.setVisibility);
  const navigate = useNavigate();
  const location = useLocation();

  const activeTimelineId = activeTabId?.startsWith("timeline:")
    ? activeTabId.slice("timeline:".length)
    : location.pathname.startsWith("/timeline/")
      ? location.pathname.split("/")[2]
      : null;

  const timelines = useMemo(() => {
    const all = data ?? [];
    const needle = filterValue.trim().toLowerCase();
    const filtered = needle
      ? all.filter((timeline) => timeline.name.toLowerCase().includes(needle))
      : all;
    return [...filtered].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }, [data, filterValue]);

  const handleOpen = useCallback(
    (id: string, name: string) => {
      if (location.pathname.startsWith("/workspace")) {
        openTab({
          type: "timeline",
          ref: id,
          mode: "edit",
          title: name || "Untitled video"
        });
      } else {
        navigate(`/timeline/${id}`);
      }
      setVisibility(false);
    },
    [location.pathname, navigate, openTab, setVisibility]
  );

  return (
    <FlexColumn fullHeight fullWidth gap={0} css={styles(theme)}>
      <div className="timeline-search">
        <CategorySearchBar
          value={filterValue}
          onChange={setFilterValue}
          placeholder="Search timelines..."
        />
      </div>

      {isLoading ? (
        <FlexColumn gap={2} justify="center" align="center" sx={{ flex: 1 }}>
          <LoadingSpinner size="large" text="Loading timelines" />
        </FlexColumn>
      ) : isError ? (
        <FlexColumn gap={2} justify="center" align="center" sx={{ flex: 1, px: 2 }}>
          <EmptyState
            variant="error"
            title="Could not load timelines"
            description={error?.message ?? "Try again later."}
          />
        </FlexColumn>
      ) : timelines.length === 0 ? (
        <FlexColumn gap={2} justify="center" align="center" sx={{ flex: 1, px: 2 }}>
          <EmptyState
            title={filterValue ? "No matching timelines" : "No timelines yet"}
            description={
              filterValue
                ? "Try a different search term."
                : "Create a new video timeline with the + button above."
            }
          />
        </FlexColumn>
      ) : (
        <FlexColumn className="timeline-list" gap={0.5}>
          {timelines.map((timeline) => (
            <TimelineListItem
              key={timeline.id}
              id={timeline.id}
              name={timeline.name}
              updatedAt={timeline.updatedAt}
              active={timeline.id === activeTimelineId}
              onOpen={handleOpen}
            />
          ))}
        </FlexColumn>
      )}
    </FlexColumn>
  );
};

export default memo(TimelineListPanel);
