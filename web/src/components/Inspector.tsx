/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React from "react";
import PropertyField from "./node/PropertyField";
import { Button, Tooltip, Typography } from "@mui/material";
import useNodeMenuStore from "../stores/NodeMenuStore";
import useMetadataStore from "../stores/MetadataStore";
import { useNodes } from "../contexts/NodeContext";

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
      gap: "10px",
      width: "100%",
      padding: "0.5em",
      height: "60vh",
      flexShrink: 1,
      flexGrow: 1,
      overflowY: "auto",
      overflowX: "hidden"
    },
    ".bottom": {
      display: "flex",
      flexDirection: "column",
      gap: "1em",
      width: "100%",
      padding: "0.5em 0",
      marginTop: "auto",
      flexShrink: 0
    },
    ".node-property": {
      display: "flex",
      flexShrink: 0,
      flexDirection: "column",
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
      margin: 0,
      padding: "0.25em",
      backgroundColor: theme.palette.c_gray2,
      fontSize: theme.fontSizeSmall,
      minHeight: "1.75em",
      maxHeight: "20em"
    },
    ".node-property label": {
      fontSize: theme.fontSizeNormal,
      fontFamily: theme.fontFamily1,
      userSelect: "none"
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
    ".node-property.enum .MuiFormControl-root": {
      margin: 0
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
      justifyContent: "flex-start",
      overflowY: "auto",
      paddingLeft: "0",
      marginBottom: ".75em",

      wordBreak: "break-all",
      color: theme.palette.c_hl1,
      textTransform: "uppercase",
      fontSize: theme.fontSizeSmaller
    }
  });

const Inspector: React.FC = () => {
  const { getSelectedNodes, findNode } = useNodes((state) => ({
    getSelectedNodes: state.getSelectedNodes,
    findNode: state.findNode
  }));
  const openNodeMenu = useNodeMenuStore((state) => state.openNodeMenu);
  const selectedNode = getSelectedNodes()[0];
  const metadata = useMetadataStore((state) =>
    state.getMetadata(selectedNode?.type ?? "")
  );

  if (!selectedNode || !metadata) {
    return <Typography>Select a node to edit</Typography>;
  }

  const handleOpenNodeMenu = () => {
    openNodeMenu({
      x: 500,
      y: 200,
      dropType: metadata.namespace
    });
  };

  return (
    <div className="inspector" css={styles}>
      <div className="top">
        <div className="inspector-header">
          <div className="title">{metadata.title}</div>
        </div>
        {metadata.properties.map((property, index) => (
          <PropertyField
            key={`inspector-${property.name}-${selectedNode.id}`}
            id={selectedNode.id}
            value={selectedNode.data}
            property={property}
            propertyIndex={index.toString()}
            showHandle={false}
            isInspector={true}
            nodeType="inspector"
            layout=""
          />
        ))}
      </div>
      <div className="bottom">
        <div className="description">{metadata.description}</div>
        <Tooltip title="Show in NodeMenu" placement="top-start">
          <Button className="namespace" onClick={handleOpenNodeMenu}>
            {metadata.namespace}
          </Button>
        </Tooltip>
      </div>
    </div>
  );
};

export default Inspector;
