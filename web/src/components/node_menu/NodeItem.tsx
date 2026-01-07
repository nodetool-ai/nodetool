import { memo, useCallback, forwardRef } from "react";
import { useTheme } from "@mui/material/styles";
import { Typography, Checkbox, IconButton, Tooltip } from "@mui/material";
import { NodeMetadata } from "../../stores/ApiTypes";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import useFavoritesStore from "../../stores/FavoritesStore";
import { IconForType } from "../../config/data_types";
import { HighlightText } from "../ui_primitives/HighlightText";
import StarIcon from "@mui/icons-material/Star";
import StarBorderIcon from "@mui/icons-material/StarBorder";

interface NodeItemProps {
  node: NodeMetadata;
  onDragStart: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd?: () => void;
  onClick: () => void;
  showCheckbox?: boolean;
  isSelected?: boolean;
  onToggleSelection?: (nodeType: string) => void;
}

const NodeItem = memo(
  forwardRef<HTMLDivElement, NodeItemProps>(
    (
      {
        node,
        onDragStart,
        onDragEnd,
        onClick,
        showCheckbox = false,
        isSelected = false,
        onToggleSelection
      },
      ref
    ) => {
      const theme = useTheme();
      const outputType =
        node.outputs.length > 0 ? node.outputs[0].type.type : "";
      const searchTerm = useNodeMenuStore((state) => state.searchTerm);
      const { hoveredNode, setHoveredNode } = useNodeMenuStore((state) => ({
        hoveredNode: state.hoveredNode,
        setHoveredNode: state.setHoveredNode
      }));
      const isHovered = hoveredNode?.node_type === node.node_type;
      const isFavorite = useFavoritesStore((state) =>
        state.favorites.some((f) => f.nodeType === node.node_type)
      );
      const toggleFavorite = useFavoritesStore((state) => state.toggleFavorite);
      const onMouseEnter = useCallback(() => {
        setHoveredNode(node);
      }, [node, setHoveredNode]);

      const handleClick = useCallback(
        (e: React.MouseEvent) => {
          if (showCheckbox && onToggleSelection) {
            e.preventDefault();
            onToggleSelection(node.node_type);
          } else {
            onClick();
          }
        },
        [showCheckbox, onToggleSelection, node.node_type, onClick]
      );

      return (
        <div
          ref={ref}
          className={`node ${isHovered ? "hovered" : ""} ${
            showCheckbox && isSelected ? "selected" : ""
          }`}
          draggable={!showCheckbox}
          onMouseEnter={onMouseEnter}
          onDragStart={(e) => {
            if (!showCheckbox) {
              onDragStart(e);
            }
          }}
          onDragEnd={onDragEnd}
        >
          <div
            className="node-button"
            onClick={handleClick}
            style={{
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              flex: 1,
              gap: "0.5em",
              position: "relative"
            }}
          >
            {showCheckbox && (
              <Checkbox
                checked={isSelected}
                onChange={() => onToggleSelection?.(node.node_type)}
                size="small"
                sx={{
                  color: "var(--palette-grey-200)",
                  "&.Mui-checked": {
                    color: "var(--palette-primary-main)"
                  },
                  padding: "2px"
                }}
              />
            )}
            <IconForType
              iconName={outputType}
              containerStyle={{
                borderRadius: "0 0 3px 0",
                marginLeft: "0",
                marginTop: "0"
              }}
              bgStyle={{
                backgroundColor: theme.vars.palette.grey[900],
                margin: "0",
                padding: "1px",
                borderRadius: "0 0 3px 0",
                boxShadow: `inset 1px 1px 2px ${theme.vars.palette.action.disabledBackground}`,
                width: "20px",
                height: "20px"
              }}
              svgProps={{
                width: "15px",
                height: "15px"
              }}
            />
            <Typography fontSize="small">
              <HighlightText 
                text={node.title} 
                query={searchTerm} 
                matchStyle="primary"
              />
            </Typography>
            <Tooltip title={isFavorite ? "Remove from favorites" : "Add to favorites"}>
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleFavorite(node.node_type);
                }}
                sx={{
                  opacity: isFavorite ? 1 : 0,
                  transition: "opacity 0.15s ease",
                  color: isFavorite ? "#ffc107" : "inherit"
                }}
                className="favorite-button"
              >
                {isFavorite ? (
                  <StarIcon fontSize="small" />
                ) : (
                  <StarBorderIcon fontSize="small" />
                )}
              </IconButton>
            </Tooltip>
          </div>
          <style>{`
            .node:hover .favorite-button {
              opacity: 0.6;
            }
            .node:hover .favorite-button:hover {
              opacity: 1;
            }
          `}</style>
        </div>
        // </Tooltip>
      );
    }
  )
);

NodeItem.displayName = "NodeItem";

export default NodeItem;
