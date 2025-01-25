import { memo, useCallback, useMemo, forwardRef } from "react";
import { NodeMetadata } from "../../stores/ApiTypes";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import ThemeNodetool from "../themes/ThemeNodetool";
import { IconForType } from "../../config/data_types";
import { Typography, Tooltip } from "@mui/material";
import { InfoOutlined } from "@mui/icons-material";
import { highlightText as highlightTextUtil } from "../../utils/highlightText";

interface NodeItemProps {
  node: NodeMetadata;
  isHovered: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onInfoClick: () => void;
  onDragStart: (event: React.DragEvent<HTMLDivElement>) => void;
  onClick: () => void;
  isFocused: boolean;
  showInfo?: boolean;
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
        onClick,
        showInfo = true
      },
      ref
    ) => {
      const outputType =
        node.outputs.length > 0 ? node.outputs[0].type.type : "";
      const searchTerm = useNodeMenuStore((state) => state.searchTerm);
      // const selectedPath = useNodeMenuStore((state) => state.selectedPath);

      // const getMatchReason = () => {
      //   if (searchTerm) {
      //     if (!node.searchInfo) {
      //       return "Warning: No search info available";
      //     }

      //     const { score, matches } = node.searchInfo;
      //     const matchDetails =
      //       matches?.map(
      //         (match) =>
      //           `${match.key}: "${match.value.substring(
      //             match.indices[0][0],
      //             match.indices[0][1]
      //           )}"`
      //       ) || [];

      //     return (
      //       <div style={{ fontSize: "1.1em", padding: "4px" }}>
      //         <div>Search: "{searchTerm}"</div>
      //         <div style={{ color: "#aaa", marginTop: "4px" }}>
      //           Score: {score?.toFixed(3)}
      //         </div>
      //         {matchDetails.length > 0 && (
      //           <div style={{ color: "#aaa", marginTop: "4px" }}>
      //             Matches: {matchDetails.join(", ")}
      //           </div>
      //         )}
      //       </div>
      //     );
      //   }
      //   if (selectedPath.length > 0) {
      //     return `In namespace: ${selectedPath.join(".")}`;
      //   }
      //   return "All nodes";
      // };

      const highlightNodeTitle = useCallback(
        (title: string): string => {
          return highlightTextUtil(title, "title", searchTerm, node.searchInfo)
            .html;
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
        // <Tooltip title={getMatchReason()} placement="left">
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
          {showInfo && (
            <span
              style={infoStyle}
              onMouseEnter={onMouseEnter}
              onMouseLeave={onMouseLeave}
              onClick={onInfoClick}
              className="node-info"
            >
              <InfoOutlined />
            </span>
          )}
        </div>
        // </Tooltip>
      );
    }
  )
);

NodeItem.displayName = "NodeItem";

export default NodeItem;
