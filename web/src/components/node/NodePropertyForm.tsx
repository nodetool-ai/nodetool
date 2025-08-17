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
  const [showPropertyDialog, setShowPropertyDialog] = useState(false);
  const [newPropertyName, setNewPropertyName] = useState("");
  const { handleAddOutput } = useDynamicOutput(id, dynamicOutputs);
  const [showOutputDialog, setShowOutputDialog] = useState(false);
  const [newOutputName, setNewOutputName] = useState("");
  const [newOutputType, setNewOutputType] = useState("string");
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

  const onSubmitProperty = useCallback(() => {
    const name = newPropertyName.trim();
    if (!name) return;
    onAddProperty(name);
    setNewPropertyName("");
    setShowPropertyDialog(false);
  }, [newPropertyName, onAddProperty]);

  return (
    <Box
      className="node-property-form"
      css={css({
        width: "100%",
        position: "relative"
      })}
    >
      {isDynamic && (
        <>
          <Box
            css={css({
              display: "flex",
              alignItems: "center",
              gap: 8
            })}
          >
            <Tooltip title="Add property">
              <IconButton
                size="small"
                onClick={() => setShowPropertyDialog(true)}
              >
                <Add fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>

          <Dialog
            open={showPropertyDialog}
            onClose={() => setShowPropertyDialog(false)}
            maxWidth="xs"
            fullWidth
          >
            <DialogTitle>Add Property</DialogTitle>
            <DialogContent>
              <TextField
                autoFocus
                label="Name"
                size="small"
                value={newPropertyName}
                onChange={(e) => setNewPropertyName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onSubmitProperty();
                }}
                sx={{ mt: 1, width: "100%" }}
              />
            </DialogContent>
            <DialogActions>
              <Button
                onClick={() => setShowPropertyDialog(false)}
                variant="text"
                size="small"
              >
                Cancel
              </Button>
              <Button
                onClick={onSubmitProperty}
                variant="contained"
                size="small"
              >
                Add
              </Button>
            </DialogActions>
          </Dialog>
        </>
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
    </Box>
  );
};

export default memo(NodePropertyForm, isEqual);
