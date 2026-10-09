/** @jsxImportSource @emotion/react */
import { memo, useMemo } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import isEqual from "../../utils/isEqual";

import NodeOutput from "./NodeOutput";
import { OutputSlot } from "../../stores/ApiTypes";
import { SPACING, Z_INDEX } from "../ui_primitives";
import { useNodeOutputSlots } from "../../hooks/nodes/useNodeOutputSlots";
import { HANDLE_ROW_HEIGHT } from "./HandleColumn";

const styles = (theme: Theme) =>
  css({
    "&.output-handle-column": {
      position: "absolute",
      // Same offset as the input column, so the first output faces the
      // first input row.
      top: theme.spacing(SPACING.xs),
      right: 0,
      width: 0,
      pointerEvents: "none",
      zIndex: Z_INDEX.raised,
      display: "flex",
      flexDirection: "column",
      justifyContent: "flex-start",
      gap: theme.spacing(SPACING.micro)
    },
    "& .output-handle-container": {
      position: "relative",
      top: "auto",
      right: "auto",
      bottom: "auto",
      left: "auto",
      width: "auto",
      height: HANDLE_ROW_HEIGHT,
      flex: "0 0 auto",
      marginBottom: theme.spacing(SPACING.md),
      pointerEvents: "auto"
    },
    "& .output-handle-container:last-child": {
      marginBottom: 0
    }
  });

interface NodeOutputsProps {
  id: string;
  outputs: OutputSlot[];
}

const NodeOutputsImpl: React.FC<NodeOutputsProps> = ({
  id,
  outputs
}) => {
  const theme = useTheme();
  const cssStyles = useMemo(() => styles(theme), [theme]);

  const allOutputs = useNodeOutputSlots(id, outputs);

  if (allOutputs.length === 0) {
    return null;
  }

  return (
    <div css={cssStyles} className="output-handle-column">
      {allOutputs.map((output) => (
        <NodeOutput
          key={output.name}
          id={id}
          output={output}
        />
      ))}
    </div>
  );
};

const arePropsEqual = (
  prevProps: NodeOutputsProps,
  nextProps: NodeOutputsProps
) => {
  return (
    prevProps.id === nextProps.id &&
    isEqual(prevProps.outputs, nextProps.outputs)
  );
};

export const NodeOutputs = memo(NodeOutputsImpl, arePropsEqual);
NodeOutputs.displayName = "NodeOutputs";
export default NodeOutputs;
