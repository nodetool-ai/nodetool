/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo, useCallback } from "react";

import { Text } from "../ui_primitives";
import FavoriteButton from "../ui_primitives/FavoriteButton";
import { IconForType } from "../../config/IconForType";
import { colorForType } from "../../config/data_types";
import { useFavoriteNodesStore } from "../../stores/FavoriteNodesStore";
import type { NodeMetadata } from "../../stores/ApiTypes";

const rowStyles = (theme: Theme) =>
  css({
    "&.nl-row": {
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(1),
      width: "100%",
      height: "100%",
      padding: theme.spacing(0.5, 1),
      borderRadius: "var(--rounded-md)",
      cursor: "grab",
      userSelect: "none",
      boxSizing: "border-box",
      transition: "background-color 140ms ease",
      "&:hover": {
        backgroundColor: theme.vars.palette.action.hover
      },
      "&:active": {
        cursor: "grabbing"
      },
      "&:focus-visible": {
        outline: `2px solid ${theme.vars.palette.primary.main}`,
        outlineOffset: "-2px"
      }
    },
    ".nl-row-title": {
      flex: 1,
      minWidth: 0,
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
      fontSize: "var(--fontSizeNormal)",
      color: theme.vars.palette.text.primary
    },
    ".nl-fav": {
      flexShrink: 0,
      display: "inline-flex",
      opacity: 0,
      transition: "opacity 140ms ease"
    },
    "&:hover .nl-fav, &:focus-within .nl-fav, &.is-favorite .nl-fav": {
      opacity: 1
    }
  });

interface NodeLibraryRowProps {
  node: NodeMetadata;
  onDragStart: (
    node: NodeMetadata,
    event: React.DragEvent<HTMLDivElement>
  ) => void;
  onDragEnd?: () => void;
  onClick: (node: NodeMetadata) => void;
  onHover?: (node: NodeMetadata) => void;
}

/**
 * A single node row in the Node Library: a type-tinted icon tile, the node
 * title, and a favorite star that stays hidden until hover (always shown when
 * the node is already favorited).
 */
const NodeLibraryRow = memo<NodeLibraryRowProps>(
  ({ node, onDragStart, onDragEnd, onClick, onHover }) => {
    const theme = useTheme();
    const outputType =
      node.outputs.length > 0 ? node.outputs[0].type.type : "";
    const typeColor = outputType ? colorForType(outputType) : null;

    const isFavorite = useFavoriteNodesStore((s) =>
      s.isFavorite(node.node_type)
    );
    const toggleFavorite = useFavoriteNodesStore((s) => s.toggleFavorite);

    const handleFavoriteToggle = useCallback(() => {
      toggleFavorite(node.node_type);
    }, [toggleFavorite, node.node_type]);

    const handleClick = useCallback(() => onClick(node), [onClick, node]);
    const handleHover = useCallback(() => onHover?.(node), [onHover, node]);
    const handleDragStart = useCallback(
      (event: React.DragEvent<HTMLDivElement>) => onDragStart(node, event),
      [onDragStart, node]
    );

    const tileColor = typeColor ?? theme.vars.palette.text.secondary;
    const tileBg = typeColor
      ? `color-mix(in srgb, ${typeColor} 8%, transparent)`
      : theme.vars.palette.action.hover;
    const tileBorder = typeColor
      ? `1px solid color-mix(in srgb, ${typeColor} 14%, transparent)`
      : `1px solid ${theme.vars.palette.divider}`;

    return (
      <div
        css={rowStyles(theme)}
        className={`nl-row ${isFavorite ? "is-favorite" : ""}`}
        role="button"
        tabIndex={0}
        draggable
        onClick={handleClick}
        onMouseEnter={handleHover}
        onFocus={handleHover}
        onDragStart={handleDragStart}
        onDragEnd={onDragEnd}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleClick();
          }
        }}
        title={node.title}
      >
        <IconForType
          iconName={outputType}
          showTooltip={false}
          containerStyle={{
            color: tileColor,
            flexShrink: 0,
            width: "22px",
            height: "22px",
            margin: "0 2px"
          }}
          bgStyle={{
            background: tileBg,
            border: tileBorder,
            borderRadius: "var(--rounded-md)"
          }}
          svgProps={{ width: 12, height: 12, style: { opacity: 0.4 } }}
        />
        <Text className="nl-row-title" component="div">
          {node.title}
        </Text>
        <span className="nl-fav">
          <FavoriteButton
            isFavorite={isFavorite}
            onToggle={handleFavoriteToggle}
            buttonSize="small"
          />
        </span>
      </div>
    );
  }
);

NodeLibraryRow.displayName = "NodeLibraryRow";

export default NodeLibraryRow;
