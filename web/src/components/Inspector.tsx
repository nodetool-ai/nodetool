/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React from "react";
import PropertyField from "./node/PropertyField";
import { Button, Tooltip, Typography } from "@mui/material";
import useNodeMenuStore from "../stores/NodeMenuStore";
import useMetadataStore from "../stores/MetadataStore";
import { useNodes } from "../contexts/NodeContext";
import NodeDescription from "./node/NodeDescription";

const styles = (theme: any) =>
  css({
    "&": {
      display: "flex",
      flexDirection: "column",
      gap: "1em",
      alignItems: "flex-start",
      justifyContent: "flex-start",
      backgroundColor: theme.palette.c_gray1,
      padding: "0",
      width: "100%",
      maxWidth: "500px",
      minHeight: "100%",
      height: "auto",
      overflowY: "auto"
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
      position: "relative",
      display: "flex",
      flexDirection: "column",
      gap: "1em",
      width: "100%",
      padding: "0.5em ",
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
      maxWidth: "300px",
      marginBottom: "1em"
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
      paddingRight: "0.5em",

      maxHeight: "400px",
      marginTop: "auto",
      overflowY: "auto"
    },
    ".namespace": {
      justifyContent: "center",
      overflowY: "auto",
      marginBottom: ".75em",
      width: "100%",
      textAlign: "center",
      overflow: "hidden",
      wordBreak: "break-word",
      lineHeight: "1.25em",
      color: theme.palette.c_hl1,
      textTransform: "uppercase",
      fontSize: theme.fontSizeSmaller
    }
  });

const Inspector: React.FC = () => {
  const { selectedNode, metadata } = useNodes((state) => {
    const selectedNodes = state.getSelectedNodes();
    const node = selectedNodes.length === 1 ? selectedNodes[0] : null;
    const md = node
      ? useMetadataStore.getState().getMetadata(node.type as string)
      : null;
    return { selectedNode: node, metadata: md };
  });
  const openNodeMenu = useNodeMenuStore((state) => state.openNodeMenu);

  if (!selectedNode) {
    return (
      <div className="inspector" css={styles}>
        <div className="top">
          <div className="inspector-header">
            <div className="title" style={{ color: "var(--c_gray4)" }}>
              Select a node to edit
            </div>
          </div>
        </div>
        <div className="bottom"></div>
      </div>
    );
  }

  if (!metadata) {
    return <Typography>No metadata available for this node</Typography>;
  }

  const handleOpenNodeMenu = () => {
    openNodeMenu({
      x: 500,
      y: 200,
      dropType: metadata.namespace
    });
  };

  const handleTagClick = (tag: string) => {
    openNodeMenu({
      x: 500,
      y: 200,
      searchTerm: tag
    });
  };

  return (
    <div className="inspector" css={styles}>
      <div className="top">
        <div className="inspector-header">
          <div className="title">{metadata.title}</div>
        </div>
        {/* Base properties */}
        {metadata.properties.map((property, index) => (
          <PropertyField
            key={`inspector-${property.name}-${selectedNode.id}`}
            id={selectedNode.id}
            value={selectedNode.data.properties[property.name]}
            property={property}
            propertyIndex={index.toString()}
            showHandle={false}
            isInspector={true}
            nodeType="inspector"
            layout=""
          />
        ))}

        {/* Dynamic properties, if any */}
        {Object.entries(selectedNode.data.dynamic_properties || {}).map(
          ([name, value], index) => (
            <PropertyField
              key={`inspector-dynamic-${name}-${selectedNode.id}`}
              id={selectedNode.id}
              value={value}
              property={
                {
                  name,
                  type: {
                    type: "any",
                    optional: false,
                    type_args: []
                  }
                } as any
              }
              propertyIndex={`dynamic-${index}`}
              showHandle={false}
              isInspector={true}
              nodeType="inspector"
              layout=""
              isDynamicProperty={true}
            />
          )
        )}
      </div>
      <div className="bottom">
        <NodeDescription
          className="description"
          description={metadata.description}
          onTagClick={handleTagClick}
        />
        <Tooltip title="Show in NodeMenu" placement="top-start">
          <Button
            variant="outlined"
            size="small"
            sx={{
              padding: ".5em"
            }}
            className="namespace"
            onClick={handleOpenNodeMenu}
          >
            {metadata.namespace}
          </Button>
        </Tooltip>
      </div>
    </div>
  );
};

export default Inspector;
