/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/Add";
import MovieOutlinedIcon from "@mui/icons-material/MovieOutlined";
import {
  Fragment,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import type { DragEvent, KeyboardEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { useCreateTimeline, useTimelines } from "../../hooks/useTimelineSequence";
import { usePanelStore } from "../../stores/PanelStore";
import { useWorkspaceTabsStore } from "../../stores/WorkspaceTabsStore";
import { serializeDragData, useDragDropStore } from "../../lib/dragdrop";
import { groupByDate } from "../../utils/groupByDate";
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
    ".timeline-icon": {
      flexShrink: 0,
      color: theme.vars.palette.text.secondary,
      fontSize: 20
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

function createTimelineDragImage(name: string): HTMLElement {
  const container = document.createElement("div");
  container.style.cssText = `
    position: absolute;
    top: -9999px;
    left: -9999px;
    width: 240px;
    height: 64px;
    background: var(--palette-background-paper);
    border: 1px solid var(--palette-divider);
    border-radius: 8px;
    display: flex;
    align-items: center;
    gap: ${getSpacingPx(SPACING.lg)};
    padding: ${getSpacingPx(SPACING.md)};
    box-sizing: border-box;
    box-shadow: 0 4px 12px rgba(0,0,0,0.25);
    color: var(--palette-text-primary);
    font-family: Inter, sans-serif;
    pointer-events: none;
    z-index: 9999;
  `;

  const icon = document.createElement("div");
  icon.textContent = "▶";
  icon.style.cssText = `
    width: 48px;
    height: 48px;
    border-radius: 4px;
    flex-shrink: 0;
    background-color: var(--palette-grey-800);
    color: var(--palette-text-secondary);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: var(--fontSizeBig);
    font-weight: 600;
  `;
  container.appendChild(icon);

  const label = document.createElement("div");
  label.textContent = name || "Untitled video";
  label.style.cssText = `
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--fontSizeSmall);
    font-weight: 500;
  `;
  container.appendChild(label);

  return container;
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
  const setActiveDrag = useDragDropStore((state) => state.setActiveDrag);
  const clearDrag = useDragDropStore((state) => state.clearDrag);
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
  const handleDragStart = useCallback(
    (event: DragEvent<HTMLButtonElement>) => {
      const payload = { id, name, updatedAt };
      serializeDragData(
        {
          type: "timeline",
          payload,
          metadata: { sourceId: id, sourceName: name || "Untitled video" }
        },
        event.dataTransfer
      );
      event.dataTransfer.effectAllowed = "copyMove";
      const dragImage = createTimelineDragImage(name);
      document.body.appendChild(dragImage);
      event.dataTransfer.setDragImage(dragImage, 10, 10);
      window.setTimeout(() => document.body.removeChild(dragImage), 0);
      setActiveDrag({
        type: "timeline",
        payload,
        metadata: { sourceId: id, sourceName: name || "Untitled video" }
      });
    },
    [id, name, updatedAt, setActiveDrag]
  );
  const handleDragEnd = useCallback(() => {
    clearDrag();
  }, [clearDrag]);

  return (
    <button
      type="button"
      className={`timeline-item ${active ? "active" : ""}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
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
  const searchRef = useRef<HTMLInputElement>(null);
  const { data, isLoading, isError, error } = useTimelines();

  // Focus the filter on open so users can immediately type to search,
  // matching the workflows list panel.
  useEffect(() => {
    searchRef.current?.focus();
  }, []);
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
          ref={searchRef}
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
          {(() => {
            let currentGroup = "";
            return timelines.map((timeline) => {
              const group = groupByDate(timeline.updatedAt);
              const showHeader = group !== currentGroup;
              currentGroup = group;
              return (
                <Fragment key={timeline.id}>
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
                  <TimelineListItem
                    id={timeline.id}
                    name={timeline.name}
                    updatedAt={timeline.updatedAt}
                    active={timeline.id === activeTimelineId}
                    onOpen={handleOpen}
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

export default memo(TimelineListPanel);
