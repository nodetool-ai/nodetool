/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React from "react";
import PropertyField from "./node/PropertyField";
import { Button, Tooltip, Typography } from "@mui/material";
import useNodeMenuStore from "../stores/NodeMenuStore";
import useMetadataStore from "../stores/MetadataStore";
import { useNodes } from "../contexts/NodeContext";
import NodeDescription from "./node/NodeDescription";
import allNodeStyles from "../node_styles/node-styles";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

const styles = (theme: any) =>
  css({
    "&": {
      display: "grid",
      gridTemplateRows: "1fr auto",
      gridTemplateColumns: "100%",
      backgroundColor: theme.palette.grey[800],
      padding: "0",
      width: "100%",
      maxWidth: "500px",
      height: "100%",
      overflow: "hidden"
    },
    ".top": {
      overflow: "hidden",
      position: "relative",
      width: "100%"
    },
    ".top-content": {
      position: "absolute",
      top: 0,
      left: 0,
      display: "flex",
      flexDirection: "column",
      gap: "10px",
      width: "100%",
      height: "100%",
      // width: "calc(100% / 1.4)",
      // height: "calc(100% / 1.4)",
      padding: "0.5em",
      overflowY: "auto",
      overflowX: "hidden",
      // transform: "scale(1.4)",
      transformOrigin: "top left"
    },
    ".bottom": {
      position: "relative",
      display: "flex",
      flexDirection: "column",
      gap: "1em",
      width: "100%",
      maxHeight: "20vh",
      padding: "0.5em "
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
      marginBottom: ".1em"
    },
    ".node-property .MuiTextField-root textarea": {
      fontSize: theme.fontSizeNormal
    },
    ".node-property textarea": {
      margin: 0,
      padding: "0.25em",
      backgroundColor: theme.palette.grey[600],
      fontSize: theme.fontSizeSmall,
      minHeight: "1.75em",
      maxHeight: "20em"
    },
    ".node-property label": {
      fontSize: theme.fontSizeNormal,
      fontFamily: theme.fontFamily1,
      minHeight: "18px",
      userSelect: "none"
    },
    ".node-property.enum .mui-select": {
      height: "2em",
      backgroundColor: theme.palette.grey[600],
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
      borderBottom: "1px solid " + theme.palette.grey[400],
      borderTop: "1px solid " + theme.palette.grey[400],
      padding: "0.5em 0",
      marginBottom: "1em"
    },
    ".title": {
      width: "100%",
      userSelect: "none",
      fontFamily: theme.fontFamily1,
      fontSize: theme.fontSizeNormal
    },
    ".description": {
      color: "var(--palette-grey-100)",
      fontSize: theme.fontSizeSmall,
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
      color: "var(--palette-primary-main)",
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
  const theme = useTheme();

  if (!selectedNode) {
    return (
      <div className="inspector" css={styles}>
        <div className="top">
          <div className="top-content">
            <div className="inspector-header">
              <div
                className="title"
                style={{ color: "var(--palette-grey-400)" }}
              >
                Select a node to edit
              </div>
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
        <div className="top-content" css={allNodeStyles(theme)}>
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
