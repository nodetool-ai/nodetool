/** @jsxImportSource @emotion/react */
/**
 * NodeModelChips
 *
 * The node's model picker, on the node itself rather than only in the
 * Inspector, so the graph shows which model each step runs. Renders every
 * property `resolveModelChipNames` selects through the regular property
 * editor (`ModelProperty` → the type's model select button). A node with one
 * model drops the "Model" label: the button already names the model. A node
 * with several keeps each label so the pickers stay distinguishable.
 */

import React, { memo, useMemo } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

import type { NodeMetadata } from "../../stores/ApiTypes";
import type { NodeData } from "../../stores/NodeData";
import { NodeInputs } from "./NodeInputs";
import { SPACING } from "../ui_primitives";
import { resolveModelChipNames } from "../../utils/exposedInputs";

const styles = (theme: Theme) =>
  css({
    "&.node-model-chips": {
      flex: "0 0 auto",
      width: "100%"
    },
    "& .node-inputs": {
      marginTop: 0,
      marginBottom: 0
    },
    "& .node-property": {
      marginBottom: theme.spacing(SPACING.micro)
    },
    "&.node-model-chips--single .model-property > .property-label": {
      display: "none"
    }
  });

interface NodeModelChipsProps {
  id: string;
  nodeType: string;
  nodeMetadata: NodeMetadata;
  data: NodeData;
  className?: string;
}

const NodeModelChipsImpl: React.FC<NodeModelChipsProps> = ({
  id,
  nodeType,
  nodeMetadata,
  data,
  className
}) => {
  const theme = useTheme();
  const cssStyles = useMemo(() => styles(theme), [theme]);
  const { exposedInputs, exposedInputsLabeled, exposedInputsHidden } = data;
  const chipProperties = useMemo(() => {
    const names = new Set(
      resolveModelChipNames(nodeMetadata, {
        exposedInputs,
        exposedInputsLabeled,
        exposedInputsHidden
      })
    );
    return (nodeMetadata.properties ?? []).filter((p) => names.has(p.name));
  }, [nodeMetadata, exposedInputs, exposedInputsLabeled, exposedInputsHidden]);

  if (chipProperties.length === 0) {
    return null;
  }

  return (
    <div
      css={cssStyles}
      className={`node-model-chips${
        chipProperties.length === 1 ? " node-model-chips--single" : ""
      } nodrag ${className ?? ""}`}
    >
      <NodeInputs
        id={id}
        nodeMetadata={nodeMetadata}
        layout={nodeMetadata.layout}
        properties={chipProperties}
        nodeType={nodeType}
        data={data}
        showHandle={false}
        showDynamicInputs={false}
        editableDynamicInputs={false}
      />
    </div>
  );
};

export const NodeModelChips = memo(NodeModelChipsImpl);
NodeModelChips.displayName = "NodeModelChips";

export default NodeModelChips;
