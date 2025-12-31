/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { memo, useMemo, useCallback } from "react";
import { Node, NodeProps, Handle, Position } from "@xyflow/react";
import isEqual from "lodash/isEqual";
import { Container, Typography, TextField, Select, MenuItem, FormControl, InputLabel } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import InputIcon from "@mui/icons-material/Input";
import { NodeData } from "../../stores/NodeData";
import { NodeFooter } from "./NodeFooter";
import { WORKFLOW_INPUT_NODE_METADATA } from "../../utils/nodeUtils";
import { colorForType } from "../../config/data_types";
import { useNodes } from "../../contexts/NodeContext";
import debounce from "lodash/debounce";

// Available input types for the workflow input
const INPUT_TYPES = [
  { value: "any", label: "Any" },
  { value: "string", label: "String" },
  { value: "int", label: "Integer" },
  { value: "float", label: "Float" },
  { value: "bool", label: "Boolean" },
  { value: "image", label: "Image" },
  { value: "audio", label: "Audio" },
  { value: "video", label: "Video" },
  { value: "text", label: "Text" },
  { value: "tensor", label: "Tensor" },
  { value: "dataframe", label: "DataFrame" },
];

const styles = (theme: Theme) =>
  css({
    "&.workflow-input-node": {
      minWidth: "200px",
      backgroundColor: theme.vars.palette.c_node_bg,
      borderRadius: "var(--rounded-node)",
      border: `2px solid ${theme.vars.palette.success.main}`,
    },
    ".workflow-input-header": {
      display: "flex",
      alignItems: "center",
      padding: "0.5em",
      backgroundColor: theme.vars.palette.success.main,
      borderRadius: "var(--rounded-node) var(--rounded-node) 0 0",
      gap: "0.5em",
      "& svg": {
        color: theme.vars.palette.success.contrastText,
        fontSize: "1.2em",
      },
      "& .MuiTypography-root": {
        color: theme.vars.palette.success.contrastText,
      },
    },
    ".workflow-input-content": {
      padding: "0.75em",
      display: "flex",
      flexDirection: "column",
      gap: "0.75em",
    },
    ".input-field": {
      "& .MuiInputBase-input": {
        fontSize: theme.fontSizeSmall,
        padding: "8px 12px",
      },
      "& .MuiInputLabel-root": {
        fontSize: theme.fontSizeSmall,
      },
    },
    ".output-port": {
      display: "flex",
      alignItems: "center",
      justifyContent: "flex-end",
      padding: "8px 0",
      position: "relative",
      "& .port-label": {
        marginRight: "8px",
        fontSize: theme.fontSizeSmall,
        color: theme.vars.palette.text.secondary,
      },
    },
    ".react-flow__handle": {
      width: "10px",
      height: "10px",
      borderRadius: "50%",
      border: "2px solid",
    },
  });

const WorkflowInputNode: React.FC<NodeProps<Node<NodeData>>> = (props) => {
  const theme = useTheme();
  const { id, data, selected } = props;
  const { updateNodeData } = useNodes((state) => ({
    updateNodeData: state.updateNodeData,
  }));

  const name = (data.properties?.name as string) || "";
  const inputType = (data.properties?.input_type as string) || "any";
  const description = (data.properties?.description as string) || "";

  // Debounced update for text fields
  const debouncedUpdate = useMemo(
    () =>
      debounce((field: string, value: unknown) => {
        updateNodeData(id, {
          ...data,
          properties: {
            ...data.properties,
            [field]: value,
          },
        });
      }, 300),
    [id, data, updateNodeData]
  );

  const handleNameChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      debouncedUpdate("name", event.target.value);
    },
    [debouncedUpdate]
  );

  const handleTypeChange = useCallback(
    (event: { target: { value: string } }) => {
      updateNodeData(id, {
        ...data,
        properties: {
          ...data.properties,
          input_type: event.target.value,
        },
      });
    },
    [id, data, updateNodeData]
  );

  const handleDescriptionChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      debouncedUpdate("description", event.target.value);
    },
    [debouncedUpdate]
  );

  const handleColor = useMemo(() => colorForType(inputType), [inputType]);

  return (
    <Container
      css={styles(theme)}
      className={`workflow-input-node ${selected ? "selected" : ""}`}
    >
      <div className="workflow-input-header node-drag-handle">
        <InputIcon />
        <Typography variant="subtitle2" component="span">
          Workflow Input
        </Typography>
      </div>

      <div className="workflow-input-content">
        <TextField
          className="input-field nodrag"
          label="Name"
          variant="outlined"
          size="small"
          defaultValue={name}
          onChange={handleNameChange}
          placeholder="input_name"
          fullWidth
        />

        <FormControl fullWidth size="small" className="input-field nodrag">
          <InputLabel>Type</InputLabel>
          <Select
            value={inputType}
            label="Type"
            onChange={handleTypeChange}
          >
            {INPUT_TYPES.map((type) => (
              <MenuItem key={type.value} value={type.value}>
                {type.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <TextField
          className="input-field nodrag"
          label="Description"
          variant="outlined"
          size="small"
          defaultValue={description}
          onChange={handleDescriptionChange}
          placeholder="Description of this input"
          fullWidth
          multiline
          rows={2}
        />

        <div className="output-port">
          <span className="port-label">value</span>
          <Handle
            type="source"
            position={Position.Right}
            id="value"
            style={{
              backgroundColor: handleColor,
              borderColor: handleColor,
            }}
          />
        </div>
      </div>

      <NodeFooter
        id={id}
        data={data}
        nodeNamespace={WORKFLOW_INPUT_NODE_METADATA.namespace}
        metadata={WORKFLOW_INPUT_NODE_METADATA}
        nodeType={WORKFLOW_INPUT_NODE_METADATA.node_type}
        workflowId={data.workflow_id}
      />
    </Container>
  );
};

export default memo(WorkflowInputNode, (prevProps, nextProps) =>
  isEqual(prevProps, nextProps)
);
