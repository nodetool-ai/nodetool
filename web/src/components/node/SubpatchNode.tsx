/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { memo, useCallback, useMemo } from "react";
import { Node, NodeProps, Handle, Position } from "@xyflow/react";
import isEqual from "lodash/isEqual";
import { Container, Typography, IconButton, Tooltip, CircularProgress } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import EditIcon from "@mui/icons-material/Edit";
import AccountTreeIcon from "@mui/icons-material/AccountTree";
import { NodeData } from "../../stores/NodeData";
import { NodeFooter } from "./NodeFooter";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { client } from "../../stores/ApiClient";
import { SUBPATCH_NODE_METADATA, WORKFLOW_INPUT_NODE_TYPE, WORKFLOW_OUTPUT_NODE_TYPE } from "../../utils/nodeUtils";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import { colorForType } from "../../config/data_types";

// Extract WorkflowInput and WorkflowOutput interfaces from a workflow
interface WorkflowPort {
  name: string;
  type: string;
  description?: string;
  defaultValue?: unknown;
  nodeId: string;
}

interface WorkflowInterface {
  inputs: WorkflowPort[];
  outputs: WorkflowPort[];
}

const styles = (theme: Theme) =>
  css({
    "&.subpatch-node": {
      minWidth: "200px",
      backgroundColor: theme.vars.palette.c_node_bg,
      borderRadius: "var(--rounded-node)",
      border: `2px solid ${theme.vars.palette.primary.main}`,
    },
    ".subpatch-header": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "0.5em",
      backgroundColor: theme.vars.palette.primary.main,
      borderRadius: "var(--rounded-node) var(--rounded-node) 0 0",
      "& .subpatch-title": {
        display: "flex",
        alignItems: "center",
        gap: "0.5em",
        color: theme.vars.palette.primary.contrastText,
        "& svg": {
          fontSize: "1.2em",
        },
      },
      "& .edit-button": {
        color: theme.vars.palette.primary.contrastText,
        padding: "4px",
        "&:hover": {
          backgroundColor: "rgba(255, 255, 255, 0.1)",
        },
      },
    },
    ".subpatch-content": {
      padding: "0.5em",
      display: "flex",
      flexDirection: "column",
      gap: "0.5em",
    },
    ".subpatch-ports": {
      display: "flex",
      justifyContent: "space-between",
      gap: "1em",
      minHeight: "40px",
    },
    ".port-list": {
      display: "flex",
      flexDirection: "column",
      gap: "8px",
      "&.inputs": {
        alignItems: "flex-start",
      },
      "&.outputs": {
        alignItems: "flex-end",
      },
    },
    ".port-item": {
      display: "flex",
      alignItems: "center",
      gap: "6px",
      fontSize: theme.fontSizeSmall,
      color: theme.vars.palette.text.secondary,
      position: "relative",
      padding: "4px 0",
    },
    ".loading-state": {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "1em",
      gap: "0.5em",
      color: theme.vars.palette.text.secondary,
    },
    ".error-state": {
      padding: "0.5em",
      color: theme.vars.palette.error.main,
      fontSize: theme.fontSizeSmall,
      textAlign: "center",
    },
    ".no-workflow-state": {
      padding: "1em",
      textAlign: "center",
      color: theme.vars.palette.text.secondary,
      fontSize: theme.fontSizeSmall,
    },
    // Handle styling
    ".react-flow__handle": {
      width: "10px",
      height: "10px",
      borderRadius: "50%",
      border: "2px solid",
    },
  });

/**
 * Extracts the workflow interface (inputs/outputs) from the workflow graph
 */
const extractWorkflowInterface = (workflow: {
  graph?: { nodes?: Array<{ id: string; type: string; data?: unknown }> };
}): WorkflowInterface => {
  const inputs: WorkflowPort[] = [];
  const outputs: WorkflowPort[] = [];

  if (!workflow?.graph?.nodes) {
    return { inputs, outputs };
  }

  for (const node of workflow.graph.nodes) {
    const nodeData = node.data as Record<string, unknown> | undefined;
    if (node.type === WORKFLOW_INPUT_NODE_TYPE && nodeData) {
      inputs.push({
        name: (nodeData.name as string) || `input_${inputs.length + 1}`,
        type: (nodeData.input_type as string) || "any",
        description: nodeData.description as string | undefined,
        defaultValue: nodeData.default_value,
        nodeId: node.id,
      });
    } else if (node.type === WORKFLOW_OUTPUT_NODE_TYPE && nodeData) {
      outputs.push({
        name: (nodeData.name as string) || `output_${outputs.length + 1}`,
        type: (nodeData.output_type as string) || "any",
        nodeId: node.id,
      });
    }
  }

  return { inputs, outputs };
};

const SubpatchNode: React.FC<NodeProps<Node<NodeData>>> = (props) => {
  const theme = useTheme();
  const navigate = useNavigate();
  const { id, data, selected } = props;
  const workflowRef = data.properties?.workflow_ref as string | undefined;

  // Fetch the referenced workflow to get its interface
  const { data: referencedWorkflow, isLoading, error } = useQuery({
    queryKey: ["workflow", workflowRef],
    queryFn: async () => {
      if (!workflowRef) {
        return null;
      }
      const { data, error } = await client.GET("/api/workflows/{id}", {
        params: { path: { id: workflowRef } },
      });
      if (error) {
        throw new Error("Failed to load referenced workflow");
      }
      return data;
    },
    enabled: !!workflowRef,
    staleTime: 30000, // Cache for 30 seconds
  });

  // Extract the workflow interface from the referenced workflow
  const workflowInterface = useMemo(() => {
    if (!referencedWorkflow) {
      return { inputs: [], outputs: [] };
    }
    return extractWorkflowInterface(referencedWorkflow);
  }, [referencedWorkflow]);

  // Handle double-click to open the referenced workflow
  const handleEditSubpatch = useCallback(() => {
    if (workflowRef) {
      navigate(`/editor/${workflowRef}`);
    }
  }, [workflowRef, navigate]);

  const workflowName = referencedWorkflow?.name || "Subpatch";

  return (
    <Container
      css={styles(theme)}
      className={`subpatch-node ${selected ? "selected" : ""}`}
    >
      <div className="subpatch-header node-drag-handle">
        <div className="subpatch-title">
          <AccountTreeIcon />
          <Typography variant="subtitle2" component="span">
            {workflowName}
          </Typography>
        </div>
        <Tooltip title="Edit Subpatch" enterDelay={TOOLTIP_ENTER_DELAY}>
          <IconButton
            className="edit-button nodrag"
            size="small"
            onClick={handleEditSubpatch}
            disabled={!workflowRef}
          >
            <EditIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </div>

      <div className="subpatch-content">
        {isLoading && (
          <div className="loading-state">
            <CircularProgress size={16} />
            <Typography variant="caption">Loading...</Typography>
          </div>
        )}

        {error && (
          <div className="error-state">
            <Typography variant="caption">
              Failed to load workflow
            </Typography>
          </div>
        )}

        {!workflowRef && (
          <div className="no-workflow-state">
            <Typography variant="caption">
              No workflow selected
            </Typography>
          </div>
        )}

        {referencedWorkflow && !isLoading && !error && (
          <div className="subpatch-ports">
            {/* Input ports */}
            <div className="port-list inputs">
              {workflowInterface.inputs.map((input) => (
                <div key={input.nodeId} className="port-item">
                  <Handle
                    type="target"
                    position={Position.Left}
                    id={input.name}
                    style={{
                      backgroundColor: colorForType(input.type),
                      borderColor: colorForType(input.type),
                    }}
                  />
                  <span>{input.name}</span>
                </div>
              ))}
              {workflowInterface.inputs.length === 0 && (
                <Typography variant="caption" color="textSecondary">
                  No inputs
                </Typography>
              )}
            </div>

            {/* Output ports */}
            <div className="port-list outputs">
              {workflowInterface.outputs.map((output) => (
                <div key={output.nodeId} className="port-item">
                  <span>{output.name}</span>
                  <Handle
                    type="source"
                    position={Position.Right}
                    id={output.name}
                    style={{
                      backgroundColor: colorForType(output.type),
                      borderColor: colorForType(output.type),
                    }}
                  />
                </div>
              ))}
              {workflowInterface.outputs.length === 0 && (
                <Typography variant="caption" color="textSecondary">
                  No outputs
                </Typography>
              )}
            </div>
          </div>
        )}
      </div>

      <NodeFooter
        id={id}
        data={data}
        nodeNamespace={SUBPATCH_NODE_METADATA.namespace}
        metadata={SUBPATCH_NODE_METADATA}
        nodeType={SUBPATCH_NODE_METADATA.node_type}
        workflowId={data.workflow_id}
      />
    </Container>
  );
};

export default memo(SubpatchNode, (prevProps, nextProps) =>
  isEqual(prevProps, nextProps)
);
