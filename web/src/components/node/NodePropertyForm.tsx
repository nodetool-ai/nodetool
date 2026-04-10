/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import {
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  MenuItem
} from "@mui/material";
import { Tooltip, FlexRow, ToolbarIconButton, EditorButton } from "../ui_primitives";
import { Add } from "@mui/icons-material";
import { useState, useCallback, memo } from "react";
import { useTheme } from "@mui/material/styles";
import isEqual from "lodash/isEqual";
import { useDynamicOutput } from "../../hooks/nodes/useDynamicOutput";
import { TypeMetadata } from "../../stores/ApiTypes";
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
  nodeType: _nodeType
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
    <div
      className="node-property-form"
      css={css({
        width: "100%",
        position: "relative"
      })}
    >
      {/* Add dynamic input property (+) when node is dynamic */}
      {isDynamic && (
        <FlexRow
          align="center"
          gap={1}
          justify="flex-start"
          fullWidth
          css={css({
            position: "relative"
          })}
        >
          <ToolbarIconButton title="Add input" size="small" onClick={handleShowInputDialog}>
            <Add fontSize="small" />
          </ToolbarIconButton>
        </FlexRow>
      )}

      {supportsDynamicOutputs && (
        <>
          <FlexRow
            align="center"
            gap={1}
            justify="flex-end"
            fullWidth
            css={css({
              position: "relative",
              right: 0,
              top: 0
            })}
          >
            <ToolbarIconButton title="Add output" size="small" onClick={handleShowOutputDialog}>
              <Add fontSize="small" />
            </ToolbarIconButton>
          </FlexRow>

          <Dialog
            open={showOutputDialog}
            onClose={handleHideOutputDialog}
            maxWidth="xs"
            fullWidth
          >
            <DialogTitle>Add Output</DialogTitle>
            <DialogContent>
              <FlexRow css={css({ gap: 12, marginTop: 8 })}>
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
              </FlexRow>
            </DialogContent>
            <DialogActions>
              <EditorButton
                onClick={handleHideOutputDialog}
                variant="text"
                size="small"
              >
                Cancel
              </EditorButton>
              <EditorButton onClick={onSubmitAdd} variant="contained" size="small">
                Add
              </EditorButton>
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
          <FlexRow css={css({ gap: 12, marginTop: 8 })}>
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
          </FlexRow>
        </DialogContent>
        <DialogActions>
          <EditorButton
            onClick={handleHideInputDialog}
            variant="text"
            size="small"
          >
            Cancel
          </EditorButton>
          <EditorButton
            onClick={handleAddInputProperty}
            variant="contained"
            size="small"
          >
            Add
          </EditorButton>
        </DialogActions>
      </Dialog>
    </div>
  );
};

export default memo(NodePropertyForm, isEqual);
