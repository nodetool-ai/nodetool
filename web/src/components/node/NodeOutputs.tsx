/** @jsxImportSource @emotion/react */
import { memo, useMemo } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import isEqual from "../../utils/isEqual";

import NodeOutput from "./NodeOutput";
import { OutputSlot } from "../../stores/ApiTypes";
import { useNodes } from "../../contexts/NodeContext";
import { shallow } from "zustand/shallow";
import { Z_INDEX } from "../ui_primitives";
import { inferredCodeOutputNames } from "../../utils/codeNodeHandles";
import { ANY_TYPE } from "../../utils/dynamicSlots";

const HANDLE_ROW_HEIGHT = 18;

const styles = (theme: Theme) =>
  css({
    "&.output-handle-column": {
      position: "absolute",
      top: theme.spacing(4),
      right: 0,
      width: 0,
      pointerEvents: "none",
      zIndex: Z_INDEX.raised,
      display: "flex",
      flexDirection: "column",
      justifyContent: "flex-start",
      gap: theme.spacing(0.5)
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
      marginBottom: theme.spacing(2),
      pointerEvents: "auto"
    },
    "& .output-handle-container:last-child": {
      marginBottom: 0
    }
  });

export interface NodeOutputsProps {
  id: string;
  outputs: OutputSlot[];
}

const NodeOutputsImpl: React.FC<NodeOutputsProps> = ({
  id,
  outputs
}) => {
  const theme = useTheme();
  const cssStyles = useMemo(() => styles(theme), [theme]);

  const nodeSlice = useNodes(
    (state) => {
      const node = state.findNode(id);
      return {
        dynamicOutputs: node?.data?.dynamic_outputs,
        code: node?.data?.properties?.code,
        nodeType: node?.type
      };
    },
    shallow
  );

  const allOutputs: OutputSlot[] = useMemo(() => {
    const dyn = Object.entries(nodeSlice.dynamicOutputs || {}).map(
      ([name, type]) => ({ name, type, stream: false } as OutputSlot)
    );
    // A dynamic output supersedes a static one of the same name (e.g. a node
    // that re-types its `output` handle via `dynamic_outputs`), so the handle
    // isn't rendered twice.
    const dynNames = new Set(dyn.map((d) => d.name));
    const inferred = inferredCodeOutputNames(
      typeof nodeSlice.code === "string" ? nodeSlice.code : "",
      nodeSlice.nodeType
    )
      .filter((name) => !dynNames.has(name))
      .map(
        (name) =>
          ({ name, type: { ...ANY_TYPE }, stream: false }) as OutputSlot
      );
    return [
      ...outputs.filter((o) => !dynNames.has(o.name)),
      ...dyn,
      ...inferred
    ];
  }, [outputs, nodeSlice]);

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
