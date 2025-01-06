import { memo, useCallback, useMemo, forwardRef } from "react";
import { NodeMetadata } from "../../stores/ApiTypes";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import ThemeNodetool from "../themes/ThemeNodetool";
import { IconForType } from "../../config/data_types";
import { Typography, Tooltip } from "@mui/material";
import { InfoOutlined } from "@mui/icons-material";

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
      const selectedPath = useNodeMenuStore((state) => state.selectedPath);

      const getMatchReason = () => {
        if (searchTerm) {
          if (!node.searchInfo) {
            return "Warning: No search info available";
          }

          const { score, matches } = node.searchInfo;
          const matchDetails =
            matches?.map(
              (match) =>
                `${match.key}: "${match.value.substring(
                  match.indices[0][0],
                  match.indices[0][1]
                )}"`
            ) || [];

          return (
            <div style={{ fontSize: "1.1em", padding: "4px" }}>
              <div>Search: "{searchTerm}"</div>
              <div style={{ color: "#aaa", marginTop: "4px" }}>
                Score: {score?.toFixed(3)}
              </div>
              {matchDetails.length > 0 && (
                <div style={{ color: "#aaa", marginTop: "4px" }}>
                  Matches: {matchDetails.join(", ")}
                </div>
              )}
            </div>
          );
        }
        if (selectedPath.length > 0) {
          return `In namespace: ${selectedPath.join(".")}`;
        }
        return "All nodes";
      };

      const highlightNodeTitle = useCallback(
        (title: string): string => {
          if (!searchTerm || !node.searchInfo?.matches) return title;

          // Get all matches for the title field
          const titleMatches = node.searchInfo.matches.filter(
            (match) => match.key === "title"
          );

          if (titleMatches.length === 0) return title;

          // Sort indices in reverse order to maintain string positions when inserting spans
          const indices = titleMatches
            .flatMap((match) => match.indices)
            .sort((a, b) => b[0] - a[0]);

          // Apply highlights from end to start
          let result = title;
          indices.forEach(([start, end]) => {
            result =
              result.slice(0, start) +
              `<span class="highlight" style="border-bottom: 1px solid ${ThemeNodetool.palette.c_hl1}">` +
              result.slice(start, end + 1) + // +1 because Fuse.js indices are inclusive
              "</span>" +
              result.slice(end + 1);
          });

          return result;
        },
        [searchTerm, node.searchInfo]
      );

      const infoStyle = useMemo(
        () => ({
          color: isHovered
            ? ThemeNodetool.palette.c_hl1
            : ThemeNodetool.palette.c_gray3
        }),
        [isHovered]
      );

      return (
        <Tooltip title={getMatchReason()} placement="left">
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
              onMouseEnter={onMouseEnter}
              onMouseLeave={onMouseLeave}
              onClick={onInfoClick}
              className="node-info"
            >
              <InfoOutlined />
            </span>
          </div>
        </Tooltip>
      );
    }
  )
);

NodeItem.displayName = "NodeItem";

export default NodeItem;
