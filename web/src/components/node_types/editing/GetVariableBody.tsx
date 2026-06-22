/** @jsxImportSource @emotion/react */
/**
 * GetVariableBody — bespoke body for `nodetool.variable.GetVariable`.
 *
 * Reads a value from the workflow's shared processing context. Variables live
 * on a context shared by the whole run, but execution follows the graph's
 * edges, so a value is only guaranteed to be set by the time this node runs if
 * the Set Variable node is *upstream*. The picker therefore offers exactly the
 * variables set upstream of this node, and the body explains that rule. Connect
 * the `trigger` input downstream of the Set Variable to establish the ordering.
 */

import React, { memo, useCallback, useMemo } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

import { SelectField, BORDER_RADIUS } from "../../ui_primitives";
import type { SelectOption } from "../../ui_primitives";
import HandleColumn from "../../node/HandleColumn";
import { NodeOutputs } from "../../node/NodeOutputs";
import NodeProgress from "../../node/NodeProgress";

import type { NodeMetadata } from "../../../stores/ApiTypes";
import type { NodeData } from "../../../stores/NodeData";
import { useBespokePropertyWriter } from "../../../hooks/nodes/useBespokePropertyWriter";
import { useUpstreamVariableNames } from "./useUpstreamVariables";
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

  const upstreamVariableNames = useUpstreamVariableNames(id);

  const options = useMemo<SelectOption[]>(() => {
    const opts: SelectOption[] = upstreamVariableNames.map((name) => ({
      value: name,
      label: name
    }));
    // Keep a stored-but-no-longer-upstream value visible (and selected) so the
    // user can see it needs reconnecting rather than having it silently vanish.
    if (currentName && !upstreamVariableNames.includes(currentName)) {
      opts.unshift({
        value: currentName,
        label: `${currentName} (not set upstream)`
      });
    }
    return opts;
  }, [upstreamVariableNames, currentName]);

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
        Reads a variable set by a Set Variable node. Only variables set
        upstream of this node are available — connect the trigger input
        downstream of the Set Variable so this node runs after the value is set.
      </div>

      {options.length > 0 ? (
        <div className="picker">
          <SelectField
            label="Variable"
            value={currentName}
            onChange={handleChange}
            options={options}
            size="small"
            variant="standard"
            className="nodrag"
          />
        </div>
      ) : (
        <div className="empty-hint">
          No variables set upstream. Connect this node downstream of a Set
          Variable node to choose one.
        </div>
      )}

      {!isOutputNode && (
        <div className="outputs-row">
          <NodeOutputs id={id} outputs={nodeMetadata.outputs} />
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
