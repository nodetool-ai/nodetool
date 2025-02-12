import { memo, useCallback, useMemo, forwardRef } from "react";
import { NodeMetadata } from "../../stores/ApiTypes";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import { IconForType } from "../../config/data_types";
import { Typography } from "@mui/material";
import { highlightText as highlightTextUtil } from "../../utils/highlightText";

interface NodeItemProps {
  node: NodeMetadata;
  onDragStart: (event: React.DragEvent<HTMLDivElement>) => void;
  onClick: () => void;
}

const NodeItem = memo(
  forwardRef<HTMLDivElement, NodeItemProps>(
    ({ node, onDragStart, onClick }, ref) => {
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

      return (
        <div
          ref={ref}
          className={`node ${isHovered ? "hovered" : ""}`}
          draggable
          onMouseEnter={onMouseEnter}
          onDragStart={(e) => {
            onDragStart(e);
          }}
        >
          <IconForType
            iconName={outputType}
            containerStyle={{
              borderRadius: "0 0 3px 0",
              marginLeft: "0.1em",
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
          <div
            className="node-button"
            onClick={(e) => {
              onClick();
            }}
            style={{
              cursor: "pointer",
              padding: ".4em ",
              display: "flex",
              alignItems: "center"
            }}
          >
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
