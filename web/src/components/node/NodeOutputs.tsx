/** @jsxImportSource @emotion/react */
import { memo, useState, useCallback, useMemo } from "react";
import DynamicOutputItem from "./DynamicOutputItem";
import { Property, OutputSlot, TypeMetadata } from "../../stores/ApiTypes";
import {
  TextField,
  DialogTitle,
  DialogContent,
  DialogActions
} from "@mui/material";
import { FlexRow, Dialog } from "../ui_primitives";
import MenuItem from "@mui/material/MenuItem";
import { EditorButton } from "../ui_primitives";
import { useNodes } from "../../contexts/NodeContext";
import { shallow } from "zustand/shallow";
import useMetadataStore from "../../stores/MetadataStore";
import useDynamicOutput from "../../hooks/nodes/useDynamicOutput";
import { validateIdentifierName } from "../../utils/identifierValidation";

// Module-level constant — avoids creating a new style object on every render.
const OUTPUT_WRAPPER_STYLE = { marginBottom: "1em" };

export interface NodeOutputsProps {
  id: string;
  outputs: OutputSlot[];
  isStreamingOutput?: boolean;
}

export const NodeOutputs: React.FC<NodeOutputsProps> = ({ id, outputs, isStreamingOutput }) => {
  const { nodeType, dynamicOutputs } = useNodes((state) => {
    const node = state.findNode(id);
    return {
      nodeType: node?.type || "",
      dynamicOutputs: node?.data?.dynamic_outputs
    };
  }, shallow);

  const metadata = useMetadataStore((state) =>
    nodeType ? state.getMetadata(nodeType) : undefined
  );

  const { handleDeleteOutput } = useDynamicOutput(
    id,
    dynamicOutputs || {}
  );
  const updateNodeData = useNodes((state) => state.updateNodeData);

  const [renameTarget, setRenameTarget] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [renameType, setRenameType] = useState("string");
  const [renameError, setRenameError] = useState<string | undefined>();

  type OutputItem = Property & { isDynamic?: boolean };

  // Memoize static outputs to prevent unnecessary re-renders
  const staticOutputs: OutputItem[] = useMemo(
    () =>
      outputs.map((o) => ({
        name: o.name,
        type: o.type,
        isDynamic: false,
        required: false
      })),
    [outputs]
  );

  const dynamicOutputsList: OutputItem[] = useMemo(
    () =>
      Object.entries(dynamicOutputs || {}).map(
        ([name, typeMetadata]) => ({
          name,
          type: typeMetadata,
          isDynamic: true,
          required: false
        })
      ),
    [dynamicOutputs]
  );

  const allOutputs: OutputItem[] = useMemo(
    () => [...staticOutputs, ...dynamicOutputsList],
    [staticOutputs, dynamicOutputsList]
  );

  const supportsDynamicOutputs = Boolean(metadata?.supports_dynamic_outputs);

  const onStartEdit = useCallback(
    (name: string) => {
      setRenameTarget(name);
      setRenameValue(name);
      // derive current type for this dynamic output
      let currentType = "string";
      const dyn = Object.entries(dynamicOutputs || {}).find(
        ([n]) => n === name
      );
      if (dyn && dyn[1] && dyn[1].type) {
        currentType = dyn[1].type;
      }
      setRenameType(currentType);
      setShowRenameDialog(true);
    },
    [dynamicOutputs]
  );

  const onSubmitEdit = useCallback(() => {
    const newName = renameValue.trim();
    if (!newName || renameTarget === null) {return;}
    
    const validation = validateIdentifierName(newName);
    if (!validation.isValid) {
      setRenameError(validation.error);
      return;
    }

    const currentDynamic: Record<string, TypeMetadata> = {
      ...(dynamicOutputs || {})
    };
    if (newName !== renameTarget) {
      currentDynamic[newName] = currentDynamic[renameTarget];
      delete currentDynamic[renameTarget];
    }
    currentDynamic[newName] = {
      type: renameType,
      type_args: [],
      optional: false
    };
    updateNodeData(id, { dynamic_outputs: currentDynamic });

    setRenameTarget(null);
    setRenameValue("");
    setRenameError(undefined);
    setShowRenameDialog(false);
  }, [
    renameValue,
    renameTarget,
    renameType,
    dynamicOutputs,
    updateNodeData,
    id
  ]);

  const handleCloseDialog = useCallback(() => {
    setShowRenameDialog(false);
  }, []);

  const handleValueChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setRenameValue(e.target.value);
    if (renameError) {
      setRenameError(undefined);
    }
  }, [renameError]);

  const handleTypeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setRenameType(e.target.value);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") {onSubmitEdit();}
  }, [onSubmitEdit]);

  return (
    <>
      <div style={OUTPUT_WRAPPER_STYLE}>
        {allOutputs.length > 1 || metadata?.supports_dynamic_outputs ? (
          <ul className="multi-outputs">
            {allOutputs.map((output) => (
              <li key={output.name} css={{ position: "relative" }}>
                <DynamicOutputItem
                  id={id}
                  output={output}
                  showLabel={true}
                  supportsDynamicOutputs={supportsDynamicOutputs}
                  isStreamingOutput={isStreamingOutput}
                  onStartEdit={onStartEdit}
                  onDelete={handleDeleteOutput}
                />
              </li>
            ))}
          </ul>
        ) : (
          allOutputs.map((output) => (
            <DynamicOutputItem
              key={output.name}
              id={id}
              output={output}
              showLabel={false}
              supportsDynamicOutputs={supportsDynamicOutputs}
              isStreamingOutput={isStreamingOutput}
              onStartEdit={onStartEdit}
              onDelete={handleDeleteOutput}
            />
          ))
        )}
      </div>

      <Dialog
        open={showRenameDialog}
        onClose={handleCloseDialog}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Rename Output</DialogTitle>
        <DialogContent>
          <FlexRow gap={2} sx={{ mt: 1 }}>
            <TextField
              autoFocus
              label="Name"
              size="small"
              value={renameValue}
              onChange={handleValueChange}
              onKeyDown={handleKeyDown}
              error={!!renameError}
              helperText={renameError || "Cannot start with a number"}
              sx={{ flex: 1 }}
            />
            <TextField
              select
              label="Type"
              size="small"
              value={renameType}
              onChange={handleTypeChange}
              sx={{ width: 160 }}
            >
              {[
                { label: "bool", value: "bool" },
                { label: "int", value: "int" },
                { label: "float", value: "float" },
                { label: "string", value: "string" }
              ].map((opt) => (
                <MenuItem key={opt.value} value={opt.value}>
                  {opt.label}
                </MenuItem>
              ))}
            </TextField>
          </FlexRow>
        </DialogContent>
        <DialogActions>
          <EditorButton
            onClick={handleCloseDialog}
            variant="text"
            size="small"
          >
            Cancel
          </EditorButton>
          <EditorButton onClick={onSubmitEdit} variant="contained" size="small">
            Save
          </EditorButton>
        </DialogActions>
      </Dialog>
    </>
  );
};

// Optimize memo comparison - only compare props that affect rendering
// Using shallow comparison instead of deep isEqual for better performance
const arePropsEqual = (prevProps: NodeOutputsProps, nextProps: NodeOutputsProps) => {
  return (
    prevProps.id === nextProps.id &&
    prevProps.isStreamingOutput === nextProps.isStreamingOutput &&
    prevProps.outputs.length === nextProps.outputs.length &&
    prevProps.outputs.every((output, i) => {
      const nextOutput = nextProps.outputs[i];
      return (
        output.name === nextOutput.name &&
        output.type === nextOutput.type
      );
    })
  );
};

export default memo(NodeOutputs, arePropsEqual);
