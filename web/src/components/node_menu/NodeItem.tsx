import { memo, useCallback, forwardRef } from "react";
import { useTheme } from "@mui/material/styles";
import { Typography, Checkbox, IconButton, Tooltip } from "@mui/material";
import StarIcon from "@mui/icons-material/Star";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import CheckIcon from "@mui/icons-material/Check";
import { NodeMetadata } from "../../stores/ApiTypes";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import { IconForType } from "../../config/data_types";
import { HighlightText } from "../ui_primitives/HighlightText";
import { useFavoriteNodesStore } from "../../stores/FavoriteNodesStore";
import { useNotificationStore } from "../../stores/NotificationStore";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";

interface NodeItemProps {
  node: NodeMetadata;
  onDragStart: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd?: () => void;
  onClick: () => void;
  showCheckbox?: boolean;
  isSelected?: boolean;
  onToggleSelection?: (nodeType: string) => void;
  showFavoriteButton?: boolean;
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
        onToggleSelection,
        showFavoriteButton = true
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
      const isFavorite = useFavoriteNodesStore((state) =>
        state.isFavorite(node.node_type)
      );
      const toggleFavorite = useFavoriteNodesStore(
        (state) => state.toggleFavorite
      );
      const addNotification = useNotificationStore(
        (state) => state.addNotification
      );

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

      const handleFavoriteClick = useCallback(
        (e: React.MouseEvent) => {
          e.stopPropagation();
          const wasAdded = !isFavorite;
          toggleFavorite(node.node_type);
          addNotification({
            type: "info",
            content: wasAdded
              ? "Node added to favorites"
              : "Node removed from favorites",
            timeout: 2000
          });
        },
        [node.node_type, isFavorite, toggleFavorite, addNotification]
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
              position: "relative",
              paddingLeft: showCheckbox ? "24px" : undefined
            }}
          >
            {showCheckbox && (
              <div
                style={{
                  position: "absolute",
                  left: "4px",
                  width: "20px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center"
                }}
              >
                {isSelected && (
                  <CheckIcon
                    sx={{
                      fontSize: "1.1rem",
                      color: theme.vars.palette.primary.main,
                      padding: "2px"
                    }}
                  />
                )}
              </div>
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
            {showFavoriteButton && (
              <Tooltip
                title={isFavorite ? "Remove from favorites" : "Add to favorites"}
                placement="top"
                enterDelay={TOOLTIP_ENTER_DELAY}
              >
                <IconButton
                  size="small"
                  onClick={handleFavoriteClick}
                  sx={{
                    padding: "2px",
                    marginLeft: "auto",
                    opacity: isFavorite ? 1 : 0.5,
                    color: isFavorite ? "warning.main" : "text.secondary",
                    "&:hover": {
                      backgroundColor: "action.hover",
                      opacity: 1
                    }
                  }}
                  aria-label={
                    isFavorite
                      ? `Remove ${node.title} from favorites`
                      : `Add ${node.title} to favorites`
                  }
                >
                  {isFavorite ? (
                    <StarIcon fontSize="small" />
                  ) : (
                    <StarBorderIcon fontSize="small" />
                  )}
                </IconButton>
              </Tooltip>
            )}
          </div>
        </div>
      );
    }
  )
);

NodeItem.displayName = "NodeItem";

export default NodeItem;
