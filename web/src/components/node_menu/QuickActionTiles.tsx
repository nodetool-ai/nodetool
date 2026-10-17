/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo, useCallback, useMemo } from "react";
import type {
  CSSProperties,
  DragEvent as ReactDragEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent
} from "react";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import { useShallow } from "zustand/react/shallow";
import useMetadataStore from "../../stores/MetadataStore";
import { useNotificationStore } from "../../stores/NotificationStore";
import usePendingNodeCreateStore from "../../stores/PendingNodeCreateStore";
import {
  Tooltip,
  Text,
  BORDER_RADIUS,
  ICON_SIZE,
  MOTION,
  SPACING,
  getSpacingPx
} from "../ui_primitives";
import { NOTIFICATION_TIMEOUT_MEDIUM } from "../../config/constants";
import { serializeDragData } from "../../lib/dragdrop";
import { useDragDropStore } from "../../lib/dragdrop/store";
import {
  AI_TASK_ACTIONS,
  PROVIDER_ACTIONS,
  CONSTANT_NODES,
  type QuickActionDefinition
} from "./QuickActionTiles.constants";

/** Hover delay before a tile shows its description, so sweeping across the grid stays quiet. */
const TILE_TOOLTIP_DELAY_MS = 600;

const tileStyles = (theme: Theme) =>
  css({
    "&": {
      display: "flex",
      flexDirection: "column",
      gap: getSpacingPx(SPACING.lg),
      width: "100%",
      padding: `${getSpacingPx(SPACING.md)} ${getSpacingPx(SPACING.xl)} ${getSpacingPx(SPACING.xl)} ${getSpacingPx(SPACING.md)}`,
      boxSizing: "border-box"
    },
    ".tiles-header": {
      marginBottom: getSpacingPx(SPACING.sm),
      padding: `0 ${getSpacingPx(SPACING.xs)}`
    },
    ".tiles-container": {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(112px, 1fr))",
      gridAutoRows: "1fr",
      gap: getSpacingPx(SPACING.sm),
      alignContent: "start",
      padding: getSpacingPx(SPACING.micro)
    },
    ".quick-tile": {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: getSpacingPx(SPACING.xs),
      minHeight: "68px",
      padding: getSpacingPx(SPACING.sm),
      borderRadius: BORDER_RADIUS.lg,
      cursor: "pointer",
      border: `1px solid ${theme.vars.palette.divider}`,
      background: theme.vars.palette.background.paper,
      transition: `${MOTION.border}, ${MOTION.background}, ${MOTION.transform}`,
      "&:hover": {
        borderColor: theme.vars.palette.primary.main,
        background: theme.vars.palette.action.hover
      },
      "&:focus-visible": {
        outline: `2px solid ${theme.vars.palette.primary.main}`,
        outlineOffset: "1px"
      },
      "&:active": {
        transform: "scale(0.97)"
      }
    },
    ".tile-icon": {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      "& > svg": {
        fontSize: ICON_SIZE.lg
      }
    },
    ".tile-label": {
      fontWeight: 500,
      textAlign: "center",
      lineHeight: 1.3,
      color: theme.vars.palette.text.primary,
      maxWidth: "100%",
      overflow: "hidden",
      display: "-webkit-box",
      WebkitLineClamp: 2,
      WebkitBoxOrient: "vertical"
    }
  });

// Tooltips render in a portal outside the tile styles, so the hint is styled inline.
const TOOLTIP_HINT_STYLE: CSSProperties = {
  fontSize: "var(--fontSizeSmaller)",
  opacity: 0.75,
  marginTop: getSpacingPx(SPACING.xs)
};

/** First line of a node description, which is its one-sentence summary. */
const summaryOf = (description: string | undefined): string =>
  description?.split("\n")[0]?.trim() ?? "";

interface TileSectionProps {
  title: string;
  actions: QuickActionDefinition[];
  getDescription: (nodeType: string) => string;
  onClick: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => void;
  onMouseEnter: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onDragStart: (event: ReactDragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
}

const TileSection = memo(function TileSection({
  title,
  actions,
  getDescription,
  onClick,
  onKeyDown,
  onMouseEnter,
  onDragStart,
  onDragEnd
}: TileSectionProps) {
  return (
    <section>
      <div className="tiles-header">
        <Text size="normal" weight={600}>
          {title}
        </Text>
      </div>
      <div className="tiles-container">
        {actions.map(({ key, label, nodeType, icon, iconColor }) => {
          const description = getDescription(nodeType);
          return (
            <Tooltip
              key={key}
              delay={TILE_TOOLTIP_DELAY_MS}
              title={
                <div>
                  {description && <div>{description}</div>}
                  <div style={description ? TOOLTIP_HINT_STYLE : undefined}>
                    Click to place · Drag to canvas
                  </div>
                </div>
              }
              placement="top"
            >
              <div
                className="quick-tile"
                role="button"
                tabIndex={0}
                aria-label={label}
                draggable
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
                onClick={onClick}
                onKeyDown={onKeyDown}
                onMouseEnter={onMouseEnter}
                data-node-type={nodeType}
                data-label={label}
              >
                <div className="tile-icon" style={{ color: iconColor }}>
                  {icon}
                </div>
                <Text size="small" className="tile-label">
                  {label}
                </Text>
              </div>
            </Tooltip>
          );
        })}
      </div>
    </section>
  );
});

const QuickActionTiles = memo(function QuickActionTiles() {
  const theme = useTheme();
  const memoizedStyles = useMemo(() => tileStyles(theme), [theme]);

  const { setDragToCreate, setHoveredNode } = useNodeMenuStore(
    useShallow((state) => ({
      setDragToCreate: state.setDragToCreate,
      setHoveredNode: state.setHoveredNode
    }))
  );
  const getMetadata = useMetadataStore((state) => state.getMetadata);
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );
  const setActiveDrag = useDragDropStore((s) => s.setActiveDrag);
  const clearDrag = useDragDropStore((s) => s.clearDrag);

  // Route click-to-add via PendingNodeCreateStore so this component is safe
  // to render outside the editor's ReactFlowProvider.
  const requestCreate = usePendingNodeCreateStore((s) => s.requestCreate);

  const getDescription = useCallback(
    (nodeType: string) => summaryOf(getMetadata(nodeType)?.description),
    [getMetadata]
  );

  const handleDragStart = useCallback(
    (event: ReactDragEvent<HTMLDivElement>) => {
      const nodeType = event.currentTarget.dataset.nodeType;
      const metadata = nodeType ? getMetadata(nodeType) : undefined;
      if (!metadata) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      setDragToCreate(true);
      serializeDragData(
        { type: "create-node", payload: metadata },
        event.dataTransfer
      );
      event.dataTransfer.effectAllowed = "copyMove";
      setActiveDrag({ type: "create-node", payload: metadata });
    },
    [getMetadata, setDragToCreate, setActiveDrag]
  );

  const handleDragEnd = useCallback(() => {
    setDragToCreate(false);
    clearDrag();
  }, [setDragToCreate, clearDrag]);

  const createFromTile = useCallback(
    (tile: HTMLDivElement) => {
      const { nodeType, label } = tile.dataset;
      if (!nodeType) {
        return;
      }
      const metadata = getMetadata(nodeType);
      if (!metadata) {
        console.warn(`Metadata not found for node type: ${nodeType}`);
        addNotification({
          type: "warning",
          content: `Unable to find metadata for ${label ?? nodeType}.`,
          timeout: NOTIFICATION_TIMEOUT_MEDIUM
        });
        return;
      }
      requestCreate(metadata);
    },
    [getMetadata, addNotification, requestCreate]
  );

  const handleTileClick = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      createFromTile(event.currentTarget);
    },
    [createFromTile]
  );

  const handleTileKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        createFromTile(event.currentTarget);
      }
    },
    [createFromTile]
  );

  const handleTileMouseEnter = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      const nodeType = event.currentTarget.dataset.nodeType;
      const metadata = nodeType ? getMetadata(nodeType) : undefined;
      if (metadata) {
        setHoveredNode(metadata);
      }
    },
    [getMetadata, setHoveredNode]
  );

  const sectionProps = useMemo(
    () => ({
      getDescription,
      onClick: handleTileClick,
      onKeyDown: handleTileKeyDown,
      onMouseEnter: handleTileMouseEnter,
      onDragStart: handleDragStart,
      onDragEnd: handleDragEnd
    }),
    [
      getDescription,
      handleTileClick,
      handleTileKeyDown,
      handleTileMouseEnter,
      handleDragStart,
      handleDragEnd
    ]
  );

  return (
    <div css={memoizedStyles}>
      <TileSection title="AI nodes" actions={AI_TASK_ACTIONS} {...sectionProps} />
      <TileSection
        title="Provider models"
        actions={PROVIDER_ACTIONS}
        {...sectionProps}
      />
      <TileSection title="Constants" actions={CONSTANT_NODES} {...sectionProps} />
    </div>
  );
});

export default QuickActionTiles;
