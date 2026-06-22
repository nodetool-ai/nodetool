/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/Add";
import BrushOutlinedIcon from "@mui/icons-material/BrushOutlined";
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

import { usePanelStore } from "../../stores/PanelStore";
import { useWorkspaceTabsStore } from "../../stores/WorkspaceTabsStore";
import { serializeDragData, useDragDropStore } from "../../lib/dragdrop";
import { trpc } from "../../trpc/client";
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
  MOTION
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
    ".sketch-icon": {
      flexShrink: 0,
      color: theme.vars.palette.text.secondary,
      fontSize: 20
    },
    ".date-header-row": {
      width: "100%",
      padding: "0 12px 4px 0",
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

function createSketchDragImage(name: string): HTMLElement {
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
    gap: 12px;
    padding: 8px;
    box-sizing: border-box;
    box-shadow: 0 4px 12px rgba(0,0,0,0.25);
    color: var(--palette-text-primary);
    font-family: Inter, sans-serif;
    pointer-events: none;
    z-index: 9999;
  `;

  const icon = document.createElement("div");
  icon.textContent = "✎";
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
  label.textContent = name || "Untitled sketch";
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
          type: "sketch",
          payload,
          metadata: { sourceId: id, sourceName: name || "Untitled sketch" }
        },
        event.dataTransfer
      );
      event.dataTransfer.effectAllowed = "copyMove";
      const dragImage = createSketchDragImage(name);
      document.body.appendChild(dragImage);
      event.dataTransfer.setDragImage(dragImage, 10, 10);
      window.setTimeout(() => document.body.removeChild(dragImage), 0);
      setActiveDrag({
        type: "sketch",
        payload,
        metadata: { sourceId: id, sourceName: name || "Untitled sketch" }
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
      className={`sketch-item ${active ? "active" : ""}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      aria-current={active ? "page" : undefined}
    >
      <FlexRow align="center" gap={1} fullWidth>
        <BrushOutlinedIcon className="sketch-icon" />
        <FlexColumn gap={0.5} sx={{ minWidth: 0, flex: 1 }}>
          <TruncatedText
            component="span"
            sx={{ fontSize: "var(--fontSizeSmall)", fontWeight: 600 }}
          >
            {name || "Untitled sketch"}
          </TruncatedText>
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
  const searchRef = useRef<HTMLInputElement>(null);

  // Focus the filter on open so users can immediately type to search,
  // matching the workflows list panel.
  useEffect(() => {
    searchRef.current?.focus();
  }, []);
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
          ref={searchRef}
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
          {(() => {
            let currentGroup = "";
            return sketches.map((sketch) => {
              const group = groupByDate(sketch.updatedAt);
              const showHeader = group !== currentGroup;
              currentGroup = group;
              return (
                <Fragment key={sketch.id}>
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
                  <SketchListItem
                    id={sketch.id}
                    name={sketch.name}
                    updatedAt={sketch.updatedAt}
                    active={sketch.id === activeSketchId}
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

export default memo(SketchListPanel);
