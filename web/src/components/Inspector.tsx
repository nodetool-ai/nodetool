/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useEffect, useState } from "react";
import useSessionStateStore from "../stores/SessionStateStore";
import { useMetadataOrNull } from "../serverState/useMetadata";
import PropertyField from "./node/PropertyField";
import { Node } from "reactflow";
import { Typography } from "@mui/material";
import ThemeNodetool from "./themes/ThemeNodetool";
import { useNodeStore } from "../stores/NodeStore";
import { NodeMetadata } from "../stores/ApiTypes";

const styles = (theme: any) =>
  css({
    "&": {
      display: "flex",
      flexDirection: "column",
      gap: "1em",
      alignItems: "flex-start",
      justifyContent: "flex-start",
      backgroundColor: theme.palette.c_gray1,
      padding: ".25em",
      maxWidth: "500px",
      minHeight: "100%",
      height: "auto",
      overflowY: "auto",
      paddingBottom: "1em"
    },
    ".top": {
      display: "flex",
      flexDirection: "column",
      gap: ".25em",
      width: "100%",
      padding: "0.5em"
    },
    ".bottom": {
      display: "flex",
      flexDirection: "column",
      gap: "1em",
      width: "100%",
      padding: "0.5em",
      marginTop: "auto"
    },
    ".node-property": {
      margin: 0,
      padding: 0,
      width: "100%",
      minWidth: "180px",
      maxWidth: "300px"
    },
    ".node-property .MuiTextField-root textarea": {
      fontSize: theme.fontSizeNormal
    },
    ".node-property textarea": {
      padding: "0.25em",
      backgroundColor: theme.palette.c_gray2,
      fontSize: theme.fontSizeSmall,
      minHeight: "1.75em",
      maxHeight: "20em"
    },
    ".node-property label": {
      fontSize: theme.fontSizeNormal,
      fontFamily: theme.fontFamily1
    },
    ".node-property.enum .mui-select": {
      height: "2em",
      backgroundColor: theme.palette.c_gray2,
      marginTop: "0.25em",
      padding: "0.5em .5em",
      fontSize: theme.fontSizeSmall
    },
    ".node-property.enum .property-label": {
      height: "1em"
    },
    ".node-property.enum label": {
      fontSize: theme.fontSizeNormal,
      fontFamily: theme.fontFamily1,
      transform: "translate(0, 0)"
    },
    ".inspector-header": {
      display: "flex",
      flexDirection: "column",
      gap: "0.5em",
      width: "100%",
      borderBottom: "1px solid " + theme.palette.c_gray4,
      borderTop: "1px solid " + theme.palette.c_gray4,
      padding: "0.5em 0",
      marginBottom: "1em"
    },
    ".title": {
      width: "100%",
      fontFamily: theme.fontFamily1,
      fontSize: theme.fontSizeNormal
    },
    ".description": {
      maxHeight: "12em",
      lineHeight: "1.25em",
      fontWeight: "lighter",
      overflowY: "auto",
      color: theme.palette.c_white,
      fontFamily: theme.fontFamily1,
      fontSize: theme.fontSizeNormal,
      marginTop: "auto"
    },
    ".namespace": {
      maxHeight: "4em",
      overflowY: "auto",
      paddingBottom: ".75em",
      wordBreak: "break-all",
      color: theme.palette.c_hl1,
      textTransform: "uppercase",
      fontSize: theme.fontSizeSmaller
    }
  });

const Inspector: React.FC = () => {
  const [lastSelectedNode, setLastSelectedNode] = useState<Node | null>(null);
  const selectedNodes = useSessionStateStore((state) => state.selectedNodes);
  const getInputEdges = useNodeStore((state) => state.getInputEdges);

  useEffect(() => {
    if (selectedNodes.length) {
      setLastSelectedNode(selectedNodes[0]);
    }
  }, [selectedNodes]);

  const metadata: NodeMetadata | undefined = useMetadataOrNull(
    lastSelectedNode?.type ?? ""
  );

  if (!lastSelectedNode) {
    return (
      <Typography
        variant="h5"
        style={{ color: ThemeNodetool.palette.c_gray4, padding: "1em" }}
      >
        select a node to edit
      </Typography>
    );
  }

  if (lastSelectedNode.type === "nodetool.workflows.base_node.Comment") {
    return (
      <Typography
        variant="h5"
        style={{ color: ThemeNodetool.palette.c_gray4, padding: "1em" }}
      >
        comment
      </Typography>
    );
  }
  if (!metadata) {
    return (
      <div>
        <Typography
          variant="h5"
          style={{ color: ThemeNodetool.palette.c_gray4, padding: "1em" }}
        >
          Unsupported node type
        </Typography>
      </div>
    );
  }

  return (
    <div className="inspector" css={styles}>
      <div className="top">
        <div className="inspector-header">
          <div className="title">{metadata.title}</div>
        </div>
        {metadata.properties.map((property, index) => (
          <PropertyField
            key={"inspector-" + property.name + lastSelectedNode.id}
            id={lastSelectedNode.id}
            data={lastSelectedNode.data}
            property={property}
            propertyIndex={index.toString()}
            skipHandles={true}
            isInspector={true}
            nodeType="inspector"
            layout=""
            edgeConnected={
              getInputEdges(lastSelectedNode.id).find(
                (edge) => edge.targetHandle === property.name
              ) !== undefined
            }
          />
        ))}
      </div>
      <div className="bottom">
        <div className="description">{metadata.description}</div>
        <div className="namespace">{metadata?.namespace}</div>
      </div>
    </div>
  );
};

export default Inspector;
