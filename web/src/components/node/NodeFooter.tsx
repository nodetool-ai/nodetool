/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { iconForType, datatypeByName } from "../../config/data_types";
import { Button, Tooltip, Typography } from "@mui/material";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import { NodeMetadata } from "../../stores/ApiTypes";
import { memo } from "react";
import ThemeNodes from "../themes/ThemeNodes";

export interface NodeFooterProps {
  nodeNamespace: string;
  type: string;
  metadata: NodeMetadata;
}
export const footerStyles = (theme: any) =>
  css({
    display: "flex",
    justifyContent: "center",
    alignItems: "left",
    margin: "0.6em 0 0 0",
    padding: 0,
    background: theme.palette.c_node_header_bg,
    borderRadius: "0 0 0.3em 0.3em",
    overflow: "hidden",
    ".pretty-namespace": {
      marginTop: "-0.4em",
      fontSize: theme.fontSizeSmall,
    },
    ".namespace-button": {
      display: "block",
      margin: 0,
      padding: "0.2em 0.5em 0.2em 0.5em",
      borderRadius: 0,
      backgroundColor: "transparent",
      color: theme.palette.c_gray5,
      fontFamily: theme.fontFamily1,
      fontSize: theme.fontSizeSmall,
      textTransform: "uppercase",
      textAlign: "left",
      flexGrow: 1,
      overflow: "hidden",
    },
    ".namespace-button:hover": {
      backgroundColor: "transparent",
      color: theme.palette.c_hl1,
    },
    ".icon": {
      paddingLeft: "auto",
    },
  });

export const NodeFooter = memo<NodeFooterProps>(
  ({ nodeNamespace, type, metadata }) => {
    const datatype = datatypeByName(type);
    const {
      openNodeMenu,
      setHighlightedNamespaces,
      setSelectedPath,
      setHoveredNode,
    } = useNodeMenuStore((state) => ({
      openNodeMenu: state.openNodeMenu,
      setHighlightedNamespaces: state.setHighlightedNamespaces,
      setSelectedPath: state.setSelectedPath,
      setHoveredNode: state.setHoveredNode,
    }));

    const handleOpenNodeMenu = () => {
      openNodeMenu(500, 200, false, metadata.namespace);
      requestAnimationFrame(() => {
        setSelectedPath(metadata.namespace.split("."));
        setHoveredNode(metadata);
        setHighlightedNamespaces(metadata.namespace.split("."));
      });
    };

    const prettyNamespace = (namespace: string) => {
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
                    : "inherit",
              }}
            >
              {part}
              {index < parts.length - 1 && "."}
            </Typography>
          ))}
        </div>
      );
    };

    return (
      <div className="node-footer" css={footerStyles}>
        <Tooltip
          title="Select node then click to show in NodeMenu "
          placement="bottom-start"
        >
          <Button
            className="namespace-button"
            size="small"
            onClick={handleOpenNodeMenu}
          >
            {prettyNamespace(nodeNamespace)}
          </Button>
        </Tooltip>
        <div className="icon">
          {datatype &&
            iconForType(datatype.value, {
              fill: datatype.textColor,
              containerStyle: {
                borderRadius: "0 0 3px 0",
                marginLeft: "0.1em",
                marginTop: "0",
              },
              bgStyle: {
                backgroundColor: datatype.color,
                margin: "0",
                padding: "1px",
                borderRadius: "0 0 3px 0",
                boxShadow: "inset 1px 1px 2px #00000044",
                width: "15px",
                height: "15px",
              },
              width: "10px",
              height: "10px",
            })}
        </div>
      </div>
    );
  }
);

NodeFooter.displayName = "NodeFooter";
