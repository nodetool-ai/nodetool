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

const styles = (theme: any) =>
  css({
    "&": {
      backgroundColor: theme.palette.c_gray1,
      padding: "1em",
      maxWidth: "500px"
    },
    ".node-property .MuiTextField-root textarea": {
      fontSize: theme.fontSizeNormal
    },
    ".node-property textarea": {
      padding: "0.25em",
      backgroundColor: theme.palette.c_gray2,
      fontSize: theme.palette.fontSizeNormal
    }
  });

const Inspector: React.FC = () => {
  const [lastSelectedNode, setLastSelectedNode] = useState<Node | null>(null);
  const selectedNodes = useSessionStateStore((state) => state.selectedNodes); // Use selector hook

  const getInputEdges = useNodeStore((state) => state.getInputEdges);

  useEffect(() => {
    console.log("selectedNodes", selectedNodes);
    if (selectedNodes.length) {
      setLastSelectedNode(selectedNodes[0]);
    }
  }, [selectedNodes]);

  const metadata = useMetadataOrNull(lastSelectedNode?.type ?? "");

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
      <div className="inspector-header">
        {lastSelectedNode.type?.replaceAll("_", " ").toUpperCase() ?? ""}
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
  );
};

export default Inspector;
