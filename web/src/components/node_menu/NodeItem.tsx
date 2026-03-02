import { memo, useCallback, forwardRef, useMemo } from "react";
import { useTheme } from "@mui/material/styles";
import { Typography, IconButton, Tooltip, Box } from "@mui/material";
import StarIcon from "@mui/icons-material/Star";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import CheckIcon from "@mui/icons-material/Check";
import { NodeMetadata } from "../../stores/ApiTypes";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import { shallow } from "zustand/shallow";
import { IconForType } from "../../config/data_types";
import { HighlightText } from "../ui_primitives/HighlightText";
import { useFavoriteNodesStore } from "../../stores/FavoriteNodesStore";
import { useNotificationStore } from "../../stores/NotificationStore";
import { TOOLTIP_ENTER_DELAY, NOTIFICATION_TIMEOUT_SHORT } from "../../config/constants";
import { formatNodeDocumentation } from "../../stores/formatNodeDocumentation";

interface NodeItemProps {
  node: NodeMetadata;
  onDragStart: (
    node: NodeMetadata,
    event: React.DragEvent<HTMLDivElement>
  ) => void;
  onDragEnd?: () => void;
  onClick: (node: NodeMetadata) => void;
  showCheckbox?: boolean;
  isSelected?: boolean;
  onToggleSelection?: (nodeType: string) => void;
  showFavoriteButton?: boolean;
  showDescriptionTooltip?: boolean;
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
        showFavoriteButton = true,
        showDescriptionTooltip = false
      },
      ref
    ) => {
      const theme = useTheme();
      const outputType =
        node.outputs.length > 0 ? node.outputs[0].type.type : "";
      // Combine multiple store selectors into one with shallow comparison to reduce re-renders
      const { searchTerm, hoveredNode, setHoveredNode } = useNodeMenuStore(
        useMemo(() => (state) => ({
          searchTerm: state.searchTerm,
          hoveredNode: state.hoveredNode,
          setHoveredNode: state.setHoveredNode
        }), []),
        shallow
      );
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

      const parsedDescription = useMemo(() => {
        if (!node.description) {
          return null;
        }
        return formatNodeDocumentation(node.description);
      }, [node.description]);

      const tooltipContent = useMemo(() => {
        if (!parsedDescription) {
          return node.title;
        }
        return (
          <Box sx={{ maxWidth: 300 }}>
            <Typography sx={{ fontSize: "0.85rem", fontWeight: 500, mb: 0.5 }}>
              {parsedDescription.description}
            </Typography>
            {parsedDescription.tags.length > 0 && (
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mt: 1 }}>
                {parsedDescription.tags.map((tag) => (
                  <Box
                    key={tag}
                    component="span"
                    sx={{
                      fontSize: "0.65rem",
                      fontWeight: 500,
                      textTransform: "uppercase",
                      bgcolor: "grey.700",
                      color: "grey.300",
                      px: 0.75,
                      py: 0.25,
                      borderRadius: "3px"
                    }}
                  >
                    {tag}
                  </Box>
                ))}
              </Box>
            )}
            {parsedDescription.useCases.raw && (
              <Box sx={{ mt: 1 }}>
                <Typography sx={{ fontSize: "0.7rem", fontWeight: 600, color: "grey.400", textTransform: "uppercase", mb: 0.5 }}>
                  Use cases
                </Typography>
                <Box component="ul" sx={{ m: 0, pl: 2, fontSize: "0.75rem", color: "grey.300" }}>
                  {parsedDescription.useCases.raw.split("\n").map((useCase, index) => (
                    <li key={`${useCase}-${index}`}>{useCase}</li>
                  ))}
                </Box>
              </Box>
            )}
          </Box>
        );
      }, [parsedDescription, node.title]);

      const onMouseEnter = useCallback(() => {
        setHoveredNode(node);
      }, [node, setHoveredNode]);

      const handleClick = useCallback(
        (e: React.MouseEvent) => {
          if (showCheckbox && onToggleSelection) {
            e.preventDefault();
            onToggleSelection(node.node_type);
          } else {
            onClick(node);
          }
        },
        [showCheckbox, onToggleSelection, node, onClick]
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
            timeout: NOTIFICATION_TIMEOUT_SHORT
          });
        },
        [node.node_type, isFavorite, toggleFavorite, addNotification]
      );

      // Memoize inline styles to prevent recreation on every render
      const nodeButtonStyle = useMemo(
        () => ({
          cursor: "pointer" as const,
          display: "flex",
          alignItems: "center",
          flex: 1,
          gap: "0.5em",
          position: "relative" as const,
          minHeight: "34px",
          paddingLeft: showCheckbox ? "24px" : undefined
        }),
        [showCheckbox]
      );

      const checkboxContainerStyle = useMemo(
        () => ({
          position: "absolute" as const,
          left: "4px",
          width: "20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center"
        }),
        []
      );

      const iconContainerStyle = useMemo(
        () => ({
          display: "flex",
          alignItems: "center",
          gap: "0.5em",
          flex: 1,
          minWidth: 0
        }),
        []
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
              onDragStart(node, e);
            }
          }}
          onDragEnd={onDragEnd}
        >
          <div
            className="node-button"
            onClick={handleClick}
            style={nodeButtonStyle}
          >
            {showCheckbox && (
              <div style={checkboxContainerStyle}>
                {isSelected && (
                  <CheckIcon
                    sx={{
                      fontSize: "1.25rem",
                      color: theme.vars.palette.primary.main,
                      padding: "2px"
                    }}
                  />
                )}
              </div>
            )}
            {showDescriptionTooltip ? (
              <Tooltip
                title={tooltipContent}
                placement="right"
                enterDelay={TOOLTIP_ENTER_DELAY}
                slotProps={{
                  popper: { sx: { zIndex: 9999 } },
                  tooltip: { sx: { bgcolor: "grey.800", color: "grey.100", maxWidth: 350, padding: "16px" } }
                }}
              >
                <div style={iconContainerStyle}>
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
                  <Typography
                    fontSize="small"
                    sx={{
                      lineHeight: 1.3,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis"
                    }}
                  >
                    <HighlightText
                      text={node.title}
                      query={searchTerm}
                      matchStyle="primary"
                    />
                  </Typography>
                </div>
              </Tooltip>
            ) : (
              <div style={iconContainerStyle}>
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
                <Typography
                  fontSize="small"
                  sx={{
                    lineHeight: 1.3,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis"
                  }}
                >
                  <HighlightText
                    text={node.title}
                    query={searchTerm}
                    matchStyle="primary"
                  />
                </Typography>
              </div>
            )}
            {showFavoriteButton && (
              <Tooltip
                title={isFavorite ? "Remove from favorites" : "Add to favorites"}
                placement="top"
                enterDelay={TOOLTIP_ENTER_DELAY}
                slotProps={{
                  popper: { sx: { zIndex: 2000 } },
                  tooltip: { sx: { bgcolor: "grey.800", color: "grey.100" } }
                }}
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

export default memo(NodeItem);
