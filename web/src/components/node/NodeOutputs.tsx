/** @jsxImportSource @emotion/react */
import { memo, useState, useCallback } from "react";
import DynamicOutputItem from "./DynamicOutputItem";
import { Property, OutputSlot } from "../../stores/ApiTypes";
import {
  Box,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button
} from "@mui/material";
import MenuItem from "@mui/material/MenuItem";
import { useNodes } from "../../contexts/NodeContext";
import useMetadataStore from "../../stores/MetadataStore";
import useDynamicOutput from "../../hooks/nodes/useDynamicOutput";

import isEqual from "lodash/isEqual";

export interface NodeOutputsProps {
  id: string;
  outputs: OutputSlot[];
}

export const NodeOutputs: React.FC<NodeOutputsProps> = ({ id, outputs }) => {
  const node = useNodes((state) => state.findNode(id));
  const nodeType = node?.type || "";
  const metadata = useMetadataStore((state) =>
    nodeType ? state.getMetadata(nodeType) : undefined
  );

  const { handleDeleteOutput } = useDynamicOutput(
    id,
    node?.data?.dynamic_outputs || {}
  );
  const updateNodeData = useNodes((state) => state.updateNodeData);

  const [renameTarget, setRenameTarget] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [renameType, setRenameType] = useState("string");

  type OutputItem = Property & { isDynamic?: boolean };

  const staticOutputs: OutputItem[] = outputs.map((o) => ({
    name: o.name,
    type: o.type,
    isDynamic: false,
    required: false
  }));

  const dynamicOutputs: OutputItem[] = Object.entries(
    node?.data?.dynamic_outputs || {}
  ).map(([name, typeMetadata]) => ({
    name,
    type: typeMetadata,
    isDynamic: true,
    required: false
  }));

  const allOutputs: OutputItem[] = [...staticOutputs, ...dynamicOutputs];

  const onStartEdit = useCallback(
    (name: string) => {
      setRenameTarget(name);
      setRenameValue(name);
      // derive current type for this dynamic output
      let currentType = "string";
      const dyn = Object.entries(node?.data?.dynamic_outputs || {}).find(
        ([n]) => n === name
      );
      if (dyn && dyn[1] && (dyn[1] as any).type) {
        currentType = (dyn[1] as any).type as string;
      }
      setRenameType(currentType);
      setShowRenameDialog(true);
    },
    [node?.data?.dynamic_outputs]
  );

  const onSubmitEdit = useCallback(() => {
    const newName = renameValue.trim();
    if (!newName || renameTarget === null) {return;}

    const currentDynamic: Record<string, any> = {
      ...(node?.data?.dynamic_outputs || {})
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
    setShowRenameDialog(false);
  }, [
    renameValue,
    renameTarget,
    renameType,
    node?.data?.dynamic_outputs,
    updateNodeData,
    id
  ]);

  return (
    <>
      {allOutputs.length > 1 || metadata?.supports_dynamic_outputs ? (
        <ul className="multi-outputs">
          {allOutputs.map((output) => (
            <li key={output.name} css={{ position: "relative" }}>
              <DynamicOutputItem
                id={id}
                output={output}
                showLabel={true}
                supportsDynamicOutputs={Boolean(
                  metadata?.supports_dynamic_outputs
                )}
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
            supportsDynamicOutputs={Boolean(metadata?.supports_dynamic_outputs)}
            onStartEdit={onStartEdit}
            onDelete={handleDeleteOutput}
          />
        ))
      )}

      <Dialog
        open={showRenameDialog}
        onClose={() => setShowRenameDialog(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Rename Output</DialogTitle>
        <DialogContent>
          <Box sx={{ display: "flex", gap: 2, mt: 1 }}>
            <TextField
              autoFocus
              label="Name"
              size="small"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {onSubmitEdit();}
              }}
              sx={{ flex: 1 }}
            />
            <TextField
              select
              label="Type"
              size="small"
              value={renameType}
              onChange={(e) => setRenameType(e.target.value)}
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
          </Box>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setShowRenameDialog(false)}
            variant="text"
            size="small"
          >
            Cancel
          </Button>
          <Button onClick={onSubmitEdit} variant="contained" size="small">
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default memo(NodeOutputs, isEqual);
