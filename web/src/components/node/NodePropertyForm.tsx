/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import {
  FlexRow,
  EditorButton,
  Dialog,
  BORDER_RADIUS,
  TextField,
  DialogTitle,
  DialogContent,
  DialogActions
} from "../ui_primitives";
import { Add } from "@mui/icons-material";
import { useState, useCallback, memo } from "react";
import { useTheme } from "@mui/material/styles";
import isEqual from "fast-deep-equal";
import { useDynamicOutput } from "../../hooks/nodes/useDynamicOutput";
import { TypeMetadata } from "../../stores/ApiTypes";
import { validateIdentifierName } from "../../utils/identifierValidation";
import AddDynamicOutputDialog from "./AddDynamicOutputDialog";

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
  const [showInputDialog, setShowInputDialog] = useState(false);
  const [newInputName, setNewInputName] = useState("");
  const [inputNameError, setInputNameError] = useState<string | undefined>();

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
          <EditorButton
            density="normal"
            startIcon={<Add fontSize="small" />}
            onClick={handleShowInputDialog}
          >
            Add input
          </EditorButton>
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
            <EditorButton
              density="normal"
              startIcon={<Add fontSize="small" />}
              onClick={handleShowOutputDialog}
            >
              Add output
            </EditorButton>
          </FlexRow>

          <AddDynamicOutputDialog
            open={showOutputDialog}
            onClose={handleHideOutputDialog}
            onAdd={handleAddOutput}
          />
        </>
      )}

      <Dialog
        open={showInputDialog}
        onClose={handleHideInputDialog}
        maxWidth="xs"
        fullWidth
        sx={{
          "& .MuiDialog-paper": {
            borderRadius: BORDER_RADIUS.xl,
            backgroundColor: theme.vars.palette.grey[1000]
          }
        }}
      >
        <DialogTitle>Add Input</DialogTitle>
        <DialogContent>
          <FlexRow css={css({ gap: 8, marginTop: 8 })}>
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
