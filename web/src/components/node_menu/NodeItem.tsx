import { memo, useCallback, useMemo, forwardRef } from "react";
import { NodeMetadata } from "../../stores/ApiTypes";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import ThemeNodetool from "../themes/ThemeNodetool";
import { IconForType } from "../../config/data_types";
import { Typography } from "@mui/material";
import { InfoOutlined } from "@mui/icons-material";
import { isEqual } from "lodash";

interface NodeItemProps {
  node: NodeMetadata;
  isHovered: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onInfoClick: () => void;
  onDragStart: (event: React.DragEvent<HTMLDivElement>) => void;
  onClick: () => void;
  isFocused: boolean;
}
const NodeItem = memo(
  forwardRef<HTMLDivElement, NodeItemProps>(
    (
      {
        node,
        isHovered,
        isFocused,
        onMouseEnter,
        onMouseLeave,
        onDragStart,
        onInfoClick,
        onClick
      },
      ref
    ) => {
      const outputType =
        node.outputs.length > 0 ? node.outputs[0].type.type : "";
      const searchTerm = useNodeMenuStore((state) => state.searchTerm);

      const highlightNodeTitle = useCallback(
        (title: string): string => {
          if (!searchTerm) return title;

          // Split search terms by spaces and clean them
          const terms = searchTerm
            .split(/\s+/) // Split by one or more whitespace characters
            .filter(Boolean) // Remove empty terms
            .map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")); // Escape regex special chars

          // Start with the original title
          let highlightedTitle = title;

          // Apply highlighting for each term
          terms.forEach((term) => {
            const regex = new RegExp(`(${term})`, "gi");
            highlightedTitle = highlightedTitle.replace(
              regex,
              `<span class="highlight" style="border-bottom: 1px solid ${ThemeNodetool.palette.c_hl1}">$1</span>`
            );
          });

          return highlightedTitle;
        },
        [searchTerm]
      );

      const infoStyle = useMemo(
        () => ({
          color: isHovered
            ? ThemeNodetool.palette.c_hl1
            : ThemeNodetool.palette.c_gray3
        }),
        [isHovered]
      );
      const handleInfoMouseEnter = useCallback(() => {
        onMouseEnter();
      }, [onMouseEnter]);

      const handleInfoMouseLeave = useCallback(() => {
        onMouseLeave();
      }, [onMouseLeave]);

      return (
        <div
          className={`node ${isHovered ? "hovered" : ""} ${
            isFocused ? "focused" : ""
          }`}
          draggable
          onDragStart={onDragStart}
          ref={ref}
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
            onClick={onClick}
            style={{
              cursor: "pointer",
              padding: "8px 16px",
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
          <span
            style={infoStyle}
            onMouseEnter={handleInfoMouseEnter}
            onMouseLeave={handleInfoMouseLeave}
            onClick={onInfoClick}
            className="node-info"
          >
            <InfoOutlined />
          </span>
        </div>
      );
    }
  )
);

NodeItem.displayName = "NodeItem";

export default NodeItem;
