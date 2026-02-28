/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import {
  Box,
  TextField,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  MenuItem,
  IconButton
} from "@mui/material";
import { Add } from "@mui/icons-material";
import { useState, useCallback, memo } from "react";
import { useTheme, alpha } from "@mui/material/styles";
import isEqual from "lodash/isEqual";
import { useDynamicOutput } from "../../hooks/nodes/useDynamicOutput";
import { TypeMetadata } from "../../stores/ApiTypes";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import { validateIdentifierName } from "../../utils/identifierValidation";

interface NodePropertyFormProps {
  id: string;
  isDynamic: boolean;
  supportsDynamicOutputs: boolean;
  dynamicOutputs: Record<string, TypeMetadata>;
  // onAddProperty retained for compatibility but unused; dynamic inputs are created via connections
  onAddProperty: (propertyName: string) => void;
  nodeType?: string;
}

const NodePropertyForm: React.FC<NodePropertyFormProps> = ({
  id,
  isDynamic,
  supportsDynamicOutputs,
  dynamicOutputs,
  onAddProperty,
  nodeType
}) => {
  const theme = useTheme();
  const { handleAddOutput } = useDynamicOutput(id, dynamicOutputs);
  const [showOutputDialog, setShowOutputDialog] = useState(false);
  const [newOutputName, setNewOutputName] = useState("");
  const [newOutputType, setNewOutputType] = useState("string");
  const [showInputDialog, setShowInputDialog] = useState(false);
  const [newInputName, setNewInputName] = useState("");
  const [inputNameError, setInputNameError] = useState<string | undefined>();
  const [outputNameError, setOutputNameError] = useState<string | undefined>();

  const onSubmitAdd = useCallback(() => {
    const name = newOutputName.trim();
    const validation = validateIdentifierName(name);

    if (!validation.isValid) {
      setOutputNameError(validation.error);
      return;
    }

    handleAddOutput(name, {
      type: newOutputType,
      type_args: [],
      optional: false
    });
    setNewOutputName("");
    setNewOutputType("string");
    setOutputNameError(undefined);
    setShowOutputDialog(false);
  }, [newOutputName, newOutputType, handleAddOutput]);

  const handleShowInputDialog = useCallback(() => {
    setShowInputDialog(true);
  }, []);

  const handleHideInputDialog = useCallback(() => {
    setShowInputDialog(false);
  }, []);

  const handleShowOutputDialog = useCallback(() => {
    setShowOutputDialog(true);
  }, []);

  const handleHideOutputDialog = useCallback(() => {
    setShowOutputDialog(false);
  }, []);

  const handleAddInputProperty = useCallback(() => {
    const name = newInputName.trim();
    const validation = validateIdentifierName(name);

    if (!validation.isValid) {
      setInputNameError(validation.error);
      return;
    }

    onAddProperty(name);
    setNewInputName("");
    setInputNameError(undefined);
    setShowInputDialog(false);
  }, [newInputName, onAddProperty]);

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
            <IconButton size="small" onClick={handleShowInputDialog}>
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
                onClick={handleShowOutputDialog}
              >
                <Add fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>

          <Dialog
            open={showOutputDialog}
            onClose={handleHideOutputDialog}
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
                  onChange={(e) => {
                    setNewOutputName(e.target.value);
                    if (outputNameError) {
                      setOutputNameError(undefined);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { onSubmitAdd(); }
                  }}
                  error={!!outputNameError}
                  helperText={
                    outputNameError || "Cannot start with a number"
                  }
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
                onClick={handleHideOutputDialog}
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
        onClose={handleHideInputDialog}
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
              onChange={(e) => {
                setNewInputName(e.target.value);
                if (inputNameError) {
                  setInputNameError(undefined);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const name = newInputName.trim();
                  const validation = validateIdentifierName(name);

                  if (!validation.isValid) {
                    setInputNameError(validation.error);
                    return;
                  }

                  onAddProperty(name);
                  setNewInputName("");
                  setInputNameError(undefined);
                  setShowInputDialog(false);
                }
              }}
              error={!!inputNameError}
              helperText={inputNameError || "Cannot start with a number"}
              sx={{ flex: 1 }}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={handleHideInputDialog}
            variant="text"
            size="small"
          >
            Cancel
          </Button>
          <Button
            onClick={handleAddInputProperty}
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
