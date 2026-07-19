/** @jsxImportSource @emotion/react */
/**
 * GetVariableBody — bespoke body for `nodetool.variable.GetVariable`.
 *
 * Reads a variable channel by name. The picker offers every variable published
 * by a Set Variable node anywhere in the workflow; the node waits for the first
 * value then streams the rest, so no ordering wire is needed.
 */

import React, { memo, useCallback, useEffect, useMemo } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { shallow } from "zustand/shallow";

import { SelectField, BORDER_RADIUS } from "../../ui_primitives";
import type { SelectOption } from "../../ui_primitives";
import HandleColumn from "../../node/HandleColumn";
import { NodeOutputs } from "../../node/NodeOutputs";
import NodeProgress from "../../node/NodeProgress";

import type { NodeMetadata } from "../../../stores/ApiTypes";
import type { NodeData } from "../../../stores/NodeData";
import { useBespokePropertyWriter } from "../../../hooks/nodes/useBespokePropertyWriter";
import { useNodes } from "../../../contexts/NodeContext";
import {
  useGraphVariableNames,
  useGraphVariableTypes
} from "./useGraphVariables";
import { ANY_TYPE } from "./variableGraph";
import { GET_VARIABLE_NODE_TYPE } from "../../../constants/nodeTypes";

const styles = (theme: Theme) =>
  css({
    "&.get-variable-body": {
      position: "relative",
      width: "100%",
      height: "100%",
      display: "flex",
      flexDirection: "column",
      gap: theme.spacing(1),
      padding: theme.spacing(0.5),
      minHeight: 0
    },
    "& > .handle-column": {
      top: theme.spacing(1),
      bottom: theme.spacing(1),
      left: theme.spacing(0)
    },
    ".explanation": {
      flex: "0 0 auto",
      fontSize: theme.fontSizeSmaller,
      lineHeight: 1.4,
      color: theme.vars.palette.text.secondary,
      padding: `${theme.spacing(0.5)} ${theme.spacing(0.5)}`,
      borderRadius: BORDER_RADIUS.sm,
      background: theme.vars.palette.background.default
    },
    ".picker": { flex: "0 0 auto" },
    ".empty-hint": {
      flex: "0 0 auto",
      fontSize: theme.fontSizeSmaller,
      lineHeight: 1.4,
      color: theme.vars.palette.warning.main,
      padding: theme.spacing(0.5)
    },
    ".outputs-row": { flex: "0 0 auto" }
  });

export interface GetVariableBodyProps {
  id: string;
  nodeType: string;
  nodeMetadata: NodeMetadata;
  data: NodeData;
  workflowId: string;
  status?: string;
  isOutputNode: boolean;
}

const GetVariableBodyInner: React.FC<GetVariableBodyProps> = ({
  id,
  nodeType,
  nodeMetadata,
  data,
  workflowId,
  status,
  isOutputNode
}) => {
  const theme = useTheme();
  const cssStyles = useMemo(() => styles(theme), [theme]);

  const triggerProperty = useMemo(
    () => (nodeMetadata.properties ?? []).filter((p) => p.name === "trigger"),
    [nodeMetadata.properties]
  );

  const currentName =
    typeof data.properties?.name === "string"
      ? (data.properties.name as string)
      : "";

  const graphVariableNames = useGraphVariableNames();

  // Adopt the variable's inferred type on the output handle so downstream
  // connections are type-checked. The type is persisted to `dynamic_outputs`
  // (read back by findOutputHandle's Get Variable case).
  const variableTypes = useGraphVariableTypes();
  const outputType = useMemo(
    () => (currentName ? variableTypes.get(currentName) : undefined) ?? ANY_TYPE,
    [variableTypes, currentName]
  );
  const updateNodeData = useNodes((state) => state.updateNodeData, shallow);
  useEffect(() => {
    const stored = data.dynamic_outputs?.output;
    if (stored?.type === outputType.type) {
      return;
    }
    updateNodeData(id, {
      dynamic_outputs: { ...(data.dynamic_outputs ?? {}), output: outputType }
    });
  }, [id, outputType, data.dynamic_outputs, updateNodeData]);

  const options = useMemo<SelectOption[]>(() => {
    const opts: SelectOption[] = graphVariableNames.map((name) => ({
      value: name,
      label: name
    }));
    // Keep a stored value whose Set Variable node no longer exists visible (and
    // selected) so it doesn't silently vanish from the picker.
    if (currentName && !graphVariableNames.includes(currentName)) {
      opts.unshift({
        value: currentName,
        label: `${currentName} (no Set Variable node)`
      });
    }
    return opts;
  }, [graphVariableNames, currentName]);

  const { setProperty, setPropertyComplete } = useBespokePropertyWriter({
    nodeId: id,
    nodeType
  });

  const handleChange = useCallback(
    (value: string) => {
      setProperty("name", value);
      setPropertyComplete();
    },
    [setProperty, setPropertyComplete]
  );

  return (
    <div css={cssStyles} className="get-variable-body" data-bespoke-body="GetVariable">
      <HandleColumn id={id} properties={triggerProperty} />

      <div className="explanation">
        Reads a variable published by any Set Variable node in this workflow. It
        waits for the first value, then streams every value the setter
        publishes — no ordering wire needed.
      </div>

      {options.length > 0 ? (
        <div className="picker">
          <SelectField
            label="Variable"
            value={currentName}
            onChange={handleChange}
            options={options}
            size="small"
            className="nodrag"
          />
        </div>
      ) : (
        <div className="empty-hint">
          No variables defined yet. Add a Set Variable node to this workflow to
          choose one.
        </div>
      )}

      {!isOutputNode && (
        <div className="outputs-row">
          {/* The single `output` handle is rendered from dynamic_outputs (set
              above to the inferred variable type); passing the static output
              too would duplicate the handle. */}
          <NodeOutputs id={id} outputs={[]} />
        </div>
      )}

      {status === "running" && <NodeProgress id={id} workflowId={workflowId} />}
    </div>
  );
};

export const GetVariableBody = memo(GetVariableBodyInner);
GetVariableBody.displayName = "GetVariableBody";

export { GET_VARIABLE_NODE_TYPE };
export default GetVariableBody;
