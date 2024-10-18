/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { Button, Tooltip, Typography } from "@mui/material";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import { NodeMetadata } from "../../stores/ApiTypes";
import { memo, useCallback } from "react";
import ThemeNodes from "../themes/ThemeNodes";
import { isEqual } from "lodash";

const PrettyNamespace = memo<{ namespace: string }>(({ namespace }) => {
  const parts = namespace.split(".");
  return (
    <div className="pretty-namespace">
      {parts.map((part, index) => (
        <Typography
          key={index}
          component="span"
          style={{
            fontWeight: index === parts.length - 1 ? "500" : "300",
            color:
              index === parts.length - 1
                ? ThemeNodes.palette.c_gray6
                : "inherit"
          }}
        >
          {part.replace("huggingface", "HF").replace("nodetool", "NT")}
          {index < parts.length - 1 && "."}
        </Typography>
      ))}
    </div>
  );
});

PrettyNamespace.displayName = "PrettyNamespace";

export interface NodeFooterProps {
  nodeNamespace: string;
  metadata: NodeMetadata;
  backgroundColor?: string;
}
export const footerStyles = (theme: any) =>
  css({
    display: "flex",
    height: "24px",
    alignItems: "flex-start",
    background: theme.palette.c_node_header_bg,
    borderRadius: "0 0 0.3em 0.3em",
    overflow: "hidden",
    ".namespace-button": {
      display: "block",
      margin: "0 0 0 0",
      padding: "4px 10px",
      borderRadius: 0,
      backgroundColor: "transparent",
      color: theme.palette.c_gray5,
      fontFamily: theme.fontFamily1,
      fontSize: theme.fontSizeSmall,
      textTransform: "uppercase",
      textAlign: "left",
      flexGrow: 1,
      overflow: "hidden"
    },
    ".namespace-button:hover": {
      backgroundColor: "transparent",
      color: theme.palette.c_hl1
    },
    ".namespace-button:hover .pretty-namespace span": {
      color: theme.palette.c_hl1
    }
  });

export const NodeFooter: React.FC<NodeFooterProps> = ({
  nodeNamespace,
  metadata,
  backgroundColor
}) => {
  const {
    openNodeMenu,
    setHighlightedNamespaces,
    setSelectedPath,
    setHoveredNode
  } = useNodeMenuStore((state) => ({
    openNodeMenu: state.openNodeMenu,
    setHighlightedNamespaces: state.setHighlightedNamespaces,
    setSelectedPath: state.setSelectedPath,
    setHoveredNode: state.setHoveredNode
  }));

  const handleOpenNodeMenu = useCallback(() => {
    openNodeMenu(500, 200, false, metadata.namespace);
    requestAnimationFrame(() => {
      setSelectedPath(metadata.namespace.split("."));
      setHoveredNode(metadata);
      setHighlightedNamespaces(metadata.namespace.split("."));
    });
  }, [
    metadata,
    openNodeMenu,
    setSelectedPath,
    setHoveredNode,
    setHighlightedNamespaces
  ]);

  return (
    <div className="node-footer" css={footerStyles} style={{ backgroundColor }}>
      <Tooltip title="Click to show in NodeMenu" placement="bottom-start">
        <Button className="namespace-button" onClick={handleOpenNodeMenu}>
          <PrettyNamespace namespace={nodeNamespace} />
        </Button>
      </Tooltip>
    </div>
  );
};

export default memo(NodeFooter, isEqual);
