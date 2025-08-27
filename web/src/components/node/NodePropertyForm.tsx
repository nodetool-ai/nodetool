/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { Add } from "@mui/icons-material";
import {
  Box,
  TextField,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  MenuItem
} from "@mui/material";
import { IconButton } from "@mui/material";
import { useState, useCallback, memo } from "react";
import { useTheme } from "@mui/material/styles";
import { isEqual } from "lodash";
import { useDynamicOutput } from "../../hooks/nodes/useDynamicOutput";
import { TypeMetadata } from "../../stores/ApiTypes";

interface NodePropertyFormProps {
  id: string;
  isDynamic: boolean;
  supportsDynamicOutputs: boolean;
  dynamicOutputs: Record<string, TypeMetadata>;
  // onAddProperty retained for compatibility but unused; dynamic inputs are created via connections
  onAddProperty: (propertyName: string) => void;
}

const NodePropertyForm: React.FC<NodePropertyFormProps> = ({
  id,
  isDynamic,
  supportsDynamicOutputs,
  dynamicOutputs,
  onAddProperty
}) => {
  const theme = useTheme();
  const { handleAddOutput } = useDynamicOutput(id, dynamicOutputs);
  const [showOutputDialog, setShowOutputDialog] = useState(false);
  const [newOutputName, setNewOutputName] = useState("");
  const [newOutputType, setNewOutputType] = useState("string");
  const [showInputDialog, setShowInputDialog] = useState(false);
  const [newInputName, setNewInputName] = useState("");
  const onSubmitAdd = useCallback(() => {
    const name = newOutputName.trim();
    if (!name) return;
    handleAddOutput(name, {
      type: newOutputType,
      type_args: [],
      optional: false
    });
    setNewOutputName("");
    setNewOutputType("string");
    setShowOutputDialog(false);
  }, [newOutputName, newOutputType, handleAddOutput]);

  // Dynamic property creation is handled by dropping a connection onto the node

  return (
    <Box
      className="node-property-form"
      css={css({
        width: "100%",
        position: "relative"
      })}
    >
      {/* Add dynamic input property (+) when node is dynamic */}
      {isDynamic && (
        <Box
          css={css({
            display: "flex",
            alignItems: "center",
            gap: 8,
            justifyContent: "flex-start",
            width: "100%",
            position: "relative"
          })}
        >
          <Tooltip title="Add input">
            <IconButton size="small" onClick={() => setShowInputDialog(true)}>
              <Add fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      )}

      {supportsDynamicOutputs && (
        <>
          <Box
            css={css({
              display: "flex",
              alignItems: "center",
              gap: 8,
              justifyContent: "flex-end",
              width: "100%",
              position: "relative",
              right: 0,
              top: 0
            })}
          >
            <Tooltip title="Add output">
              <IconButton
                size="small"
                onClick={() => setShowOutputDialog(true)}
              >
                <Add fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>

          <Dialog
            open={showOutputDialog}
            onClose={() => setShowOutputDialog(false)}
            maxWidth="xs"
            fullWidth
          >
            <DialogTitle>Add Output</DialogTitle>
            <DialogContent>
              <Box css={css({ display: "flex", gap: 12, marginTop: 8 })}>
                <TextField
                  autoFocus
                  label="Name"
                  size="small"
                  value={newOutputName}
                  onChange={(e) => setNewOutputName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") onSubmitAdd();
                  }}
                  sx={{ flex: 1 }}
                />
                <TextField
                  select
                  label="Type"
                  size="small"
                  value={newOutputType}
                  onChange={(e) => setNewOutputType(e.target.value)}
                  sx={{ width: 140 }}
                >
                  {[
                    { label: "bool", value: "bool" },
                    { label: "int", value: "int" },
                    { label: "float", value: "float" },
                    { label: "string", value: "str" }
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
                onClick={() => setShowOutputDialog(false)}
                variant="text"
                size="small"
              >
                Cancel
              </Button>
              <Button onClick={onSubmitAdd} variant="contained" size="small">
                Add
              </Button>
            </DialogActions>
          </Dialog>
        </>
      )}

      <Dialog
        open={showInputDialog}
        onClose={() => setShowInputDialog(false)}
        maxWidth="xs"
        fullWidth
        sx={{
          "& .MuiDialog-paper": {
            borderRadius: "12px",
            backgroundColor: theme.vars.palette.grey[1000]
          }
        }}
      >
        <DialogTitle>Add Input</DialogTitle>
        <DialogContent>
          <Box css={css({ display: "flex", gap: 12, marginTop: 8 })}>
            <TextField
              autoFocus
              label="Name"
              size="small"
              value={newInputName}
              onChange={(e) => setNewInputName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const name = newInputName.trim();
                  if (!name) return;
                  onAddProperty(name);
                  setNewInputName("");
                  setShowInputDialog(false);
                }
              }}
              sx={{ flex: 1 }}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setShowInputDialog(false)}
            variant="text"
            size="small"
          >
            Cancel
          </Button>
          <Button
            onClick={() => {
              const name = newInputName.trim();
              if (!name) return;
              onAddProperty(name);
              setNewInputName("");
              setShowInputDialog(false);
            }}
            variant="contained"
            size="small"
          >
            Add
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default memo(NodePropertyForm, isEqual);
