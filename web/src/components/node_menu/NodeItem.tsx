import { memo, useCallback, useMemo, forwardRef } from "react";
import { NodeMetadata } from "../../stores/ApiTypes";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import { IconForType } from "../../config/data_types";
import { Typography, Checkbox, Chip } from "@mui/material";
import { highlightText as highlightTextUtil } from "../../utils/highlightText";

interface NodeItemProps {
  node: NodeMetadata;
  onDragStart: (event: React.DragEvent<HTMLDivElement>) => void;
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
        onClick,
        showCheckbox = false,
        isSelected = false,
        onToggleSelection
      },
      ref
    ) => {
      const outputType =
        node.outputs.length > 0 ? node.outputs[0].type.type : "";
      const searchTerm = useNodeMenuStore((state) => state.searchTerm);
      const { hoveredNode, setHoveredNode } = useNodeMenuStore((state) => ({
        hoveredNode: state.hoveredNode,
        setHoveredNode: state.setHoveredNode
      }));
      const isHovered = hoveredNode?.node_type === node.node_type;
      const onMouseEnter = useCallback(() => {
        setHoveredNode(node);
      }, [node, setHoveredNode]);

      const highlightNodeTitle = useCallback(
        (title: string): string => {
          return highlightTextUtil(title, "title", searchTerm, node.searchInfo)
            .html;
        },
        [searchTerm, node.searchInfo]
      );

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
        >
          <div
            className="node-button"
            onClick={handleClick}
            style={{
              cursor: "pointer",
              padding: ".4em ",
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
                backgroundColor: "#333",
                margin: "0",
                padding: "1px",
                borderRadius: "0 0 3px 0",
                boxShadow: "inset 1px 1px 2px #00000044",
                width: "20px",
                height: "20px"
              }}
              svgProps={{
                width: "15px",
                height: "15px"
              }}
            />
            <Typography fontSize="small">
              {searchTerm ? (
                <span
                  dangerouslySetInnerHTML={{
                    __html: highlightNodeTitle(node.title)
                  }}
                />
              ) : (
                node.title
              )}
            </Typography>
          </div>
        </div>
        // </Tooltip>
      );
    }
  )
);

NodeItem.displayName = "NodeItem";

export default NodeItem;
