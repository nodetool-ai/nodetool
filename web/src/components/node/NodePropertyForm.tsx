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
  Typography,
  IconButton
} from "@mui/material";
import { Add } from "@mui/icons-material";
import { useState, useCallback, memo } from "react";
import { useTheme, alpha } from "@mui/material/styles";
import isEqual from "lodash/isEqual";
import { useDynamicOutput } from "../../hooks/nodes/useDynamicOutput";
import { TypeMetadata } from "../../stores/ApiTypes";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";

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
  const onSubmitAdd = useCallback(() => {
    const name = newOutputName.trim();
    if (!name) {return;}
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
            {nodeType === "nodetool.agents.Agent" ? (
              <Tooltip
                title="Connect any node to this handle to use it as a tool. The agent will be able to call the connected node during execution."
                enterDelay={TOOLTIP_ENTER_DELAY}
                placement="top"
              >
                <Box
                  component="button"
                  onClick={() => setShowOutputDialog(true)}
                  css={css({
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "4px 8px",
                    marginRight: "8px",
                    fontSize: theme.vars.fontSizeTiny,
                    fontWeight: 600,
                    lineHeight: 1.2,
                    borderRadius: "4px",
                    background: `linear-gradient(135deg, ${alpha(
                      theme.palette.primary.main,
                      0.15
                    )}, ${alpha(theme.palette.primary.dark, 0.1)})`,
                    color: theme.vars.palette.primary.main,
                    border: `1px solid ${alpha(
                      theme.palette.primary.main,
                      0.4
                    )}`,
                    letterSpacing: "0.02em",
                    textTransform: "uppercase",
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                    outline: "none",
                    "&:hover": {
                      background: `linear-gradient(135deg, ${alpha(
                        theme.palette.primary.main,
                        0.25
                      )}, ${alpha(theme.palette.primary.dark, 0.15)})`,
                      borderColor: theme.vars.palette.primary.main,
                      transform: "translateY(-1px)",
                      boxShadow: `0 2px 4px ${alpha(
                        theme.palette.primary.main,
                        0.2
                      )}`
                    },
                    "&:active": {
                      transform: "translateY(0)"
                    },
                    "& svg": {
                      fontSize: "14px"
                    }
                  })}
                >
                  <Add fontSize="small" />
                  <span>Tools</span>
                </Box>
              </Tooltip>
            ) : (
              <Tooltip title="Add output">
                <IconButton
                  size="small"
                  onClick={() => setShowOutputDialog(true)}
                >
                  <Add fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
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
                    if (e.key === "Enter") {onSubmitAdd();}
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
                  if (!name) {return;}
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
              if (!name) {return;}
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
