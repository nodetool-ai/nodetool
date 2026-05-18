/** @jsxImportSource @emotion/react */
import { memo, useMemo } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import isEqual from "fast-deep-equal";

import NodeOutput from "./NodeOutput";
import { OutputSlot } from "../../stores/ApiTypes";
import { useNodes } from "../../contexts/NodeContext";
import { shallow } from "zustand/shallow";

const HANDLE_ROW_HEIGHT = 18;

const styles = (theme: Theme) =>
  css({
    "&.output-handle-column": {
      position: "absolute",
      top: theme.spacing(4),
      right: 0,
      width: 0,
      pointerEvents: "none",
      zIndex: 3,
      display: "flex",
      flexDirection: "column",
      justifyContent: "flex-start",
      gap: theme.spacing(0.25)
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
      pointerEvents: "auto"
    }
  });

export interface NodeOutputsProps {
  id: string;
  outputs: OutputSlot[];
}

const NodeOutputs: React.FC<NodeOutputsProps> = ({
  id,
  outputs
}) => {
  const theme = useTheme();
  const cssStyles = useMemo(() => styles(theme), [theme]);

  const dynamicOutputs = useNodes(
    (state) => state.findNode(id)?.data?.dynamic_outputs,
    shallow
  );

  const allOutputs: OutputSlot[] = useMemo(() => {
    const dyn = Object.entries(dynamicOutputs || {}).map(
      ([name, type]) => ({ name, type, stream: false } as OutputSlot)
    );
    return [...outputs, ...dyn];
  }, [outputs, dynamicOutputs]);

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

export { NodeOutputs };
export default memo(NodeOutputs, arePropsEqual);
