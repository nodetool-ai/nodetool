/** @jsxImportSource @emotion/react */
/**
 * SubgraphEditorPanel - Panel for editing subgraph properties
 * 
 * Provides controls for:
 * - Renaming subgraph
 * - Adding/removing I/O slots
 * - Widget promotion (future enhancement)
 * - Saving as blueprint
 */

import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import {
  Box,
  Typography,
  TextField,
  Button,
  IconButton,
  Divider,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import SaveIcon from "@mui/icons-material/Save";
import { useState } from "react";
import { useSubgraphStore } from "../../stores/SubgraphStore";
import { addInput, addOutput, removeInput, removeOutput } from "../../core/workflow/subgraph/io";
import { createBlueprintFromDefinition, saveBlueprint } from "../../core/workflow/subgraph/blueprints";
import { useNotificationStore } from "../../stores/NotificationStore";

const styles = (theme: Theme) =>
  css({
    padding: "16px",
    height: "100%",
    overflowY: "auto",
    ".section": {
      marginBottom: "24px"
    },
    ".section-title": {
      fontSize: "14px",
      fontWeight: 600,
      marginBottom: "12px",
      color: theme.vars.palette.text.primary
    },
    ".io-list": {
      marginTop: "8px"
    },
    ".add-button": {
      marginTop: "8px"
    },
    ".save-blueprint-button": {
      marginTop: "16px",
      width: "100%"
    }
  });

interface SubgraphEditorPanelProps {
  subgraphId: string;
}

const SubgraphEditorPanel: React.FC<SubgraphEditorPanelProps> = ({ subgraphId }) => {
  const theme = useTheme();
  const getDefinition = useSubgraphStore((state) => state.getDefinition);
  const updateDefinition = useSubgraphStore((state) => state.updateDefinition);
  const addNotification = useNotificationStore((state) => state.addNotification);
  
  const definition = getDefinition(subgraphId);
  
  const [subgraphName, setSubgraphName] = useState(definition?.name || "");
  const [newInputName, setNewInputName] = useState("");
  const [newOutputName, setNewOutputName] = useState("");
  const [blueprintName, setBlueprintName] = useState("");
  const [blueprintDescription, setBlueprintDescription] = useState("");
  
  const handleNameChange = (newName: string) => {
    setSubgraphName(newName);
    if (newName.trim()) {
      updateDefinition(subgraphId, { name: newName.trim() });
    }
  };
  
  if (!definition) {
    return (
      <Box css={styles(theme)}>
        <Typography>Subgraph not found</Typography>
      </Box>
    );
  }
  
  const handleAddInput = () => {
    if (!newInputName.trim()) {
      return;
    }
    
    try {
      const result = addInput(definition, newInputName.trim(), "any");
      updateDefinition(subgraphId, result.definition);
      setNewInputName("");
      
      addNotification({
        type: "success",
        alert: true,
        content: `Added input: ${newInputName}`
      });
    } catch (error) {
      addNotification({
        type: "error",
        alert: true,
        content: `Failed to add input: ${error instanceof Error ? error.message : "Unknown error"}`
      });
    }
  };
  
  const handleAddOutput = () => {
    if (!newOutputName.trim()) {
      return;
    }
    
    try {
      const result = addOutput(definition, newOutputName.trim(), "any");
      updateDefinition(subgraphId, result.definition);
      setNewOutputName("");
      
      addNotification({
        type: "success",
        alert: true,
        content: `Added output: ${newOutputName}`
      });
    } catch (error) {
      addNotification({
        type: "error",
        alert: true,
        content: `Failed to add output: ${error instanceof Error ? error.message : "Unknown error"}`
      });
    }
  };
  
  const handleRemoveInput = (index: number) => {
    try {
      const inputId = definition.inputs[index].id;
      const result = removeInput(definition, inputId);
      updateDefinition(subgraphId, result);
      
      addNotification({
        type: "success",
        alert: true,
        content: "Removed input"
      });
    } catch (error) {
      addNotification({
        type: "error",
        alert: true,
        content: `Failed to remove input: ${error instanceof Error ? error.message : "Unknown error"}`
      });
    }
  };
  
  const handleRemoveOutput = (index: number) => {
    try {
      const outputId = definition.outputs[index].id;
      const result = removeOutput(definition, outputId);
      updateDefinition(subgraphId, result);
      
      addNotification({
        type: "success",
        alert: true,
        content: "Removed output"
      });
    } catch (error) {
      addNotification({
        type: "error",
        alert: true,
        content: `Failed to remove output: ${error instanceof Error ? error.message : "Unknown error"}`
      });
    }
  };
  
  const handleSaveBlueprint = () => {
    if (!blueprintName.trim()) {
      addNotification({
        type: "warning",
        alert: true,
        content: "Please enter a blueprint name"
      });
      return;
    }
    
    try {
      const blueprint = createBlueprintFromDefinition(definition, {
        name: blueprintName.trim(),
        description: blueprintDescription.trim() || undefined,
        category: "Custom",
        tags: ["user-created"]
      });
      
      saveBlueprint(blueprint);
      
      setBlueprintName("");
      setBlueprintDescription("");
      
      addNotification({
        type: "success",
        alert: true,
        content: `Saved blueprint: ${blueprint.name}`
      });
    } catch (error) {
      addNotification({
        type: "error",
        alert: true,
        content: `Failed to save blueprint: ${error instanceof Error ? error.message : "Unknown error"}`
      });
    }
  };
  
  return (
    <Box css={styles(theme)}>
      {/* Subgraph Info */}
      <div className="section">
        <Typography className="section-title">Subgraph Properties</Typography>
        <TextField
          size="small"
          fullWidth
          label="Name"
          value={subgraphName}
          onChange={(e) => handleNameChange(e.target.value)}
          sx={{ mb: 2 }}
        />
        <Typography variant="body2" color="text.secondary">
          {definition.nodes.length} nodes, {definition.edges.length} edges
        </Typography>
      </div>
      
      <Divider />
      
      {/* Inputs */}
      <div className="section">
        <Typography className="section-title">Inputs ({definition.inputs.length})</Typography>
        <List dense className="io-list">
          {definition.inputs.map((input, index) => (
            <ListItem key={index}>
              <ListItemText
                primary={input.label || input.name}
                secondary={`Type: ${input.type}`}
              />
              <ListItemSecondaryAction>
                <IconButton
                  edge="end"
                  size="small"
                  onClick={() => handleRemoveInput(index)}
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </ListItemSecondaryAction>
            </ListItem>
          ))}
        </List>
        <Box display="flex" gap={1} className="add-button">
          <TextField
            size="small"
            fullWidth
            placeholder="Input name"
            value={newInputName}
            onChange={(e) => setNewInputName(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && handleAddInput()}
          />
          <IconButton color="primary" onClick={handleAddInput}>
            <AddIcon />
          </IconButton>
        </Box>
      </div>
      
      <Divider />
      
      {/* Outputs */}
      <div className="section">
        <Typography className="section-title">Outputs ({definition.outputs.length})</Typography>
        <List dense className="io-list">
          {definition.outputs.map((output, index) => (
            <ListItem key={index}>
              <ListItemText
                primary={output.label || output.name}
                secondary={`Type: ${output.type}`}
              />
              <ListItemSecondaryAction>
                <IconButton
                  edge="end"
                  size="small"
                  onClick={() => handleRemoveOutput(index)}
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </ListItemSecondaryAction>
            </ListItem>
          ))}
        </List>
        <Box display="flex" gap={1} className="add-button">
          <TextField
            size="small"
            fullWidth
            placeholder="Output name"
            value={newOutputName}
            onChange={(e) => setNewOutputName(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && handleAddOutput()}
          />
          <IconButton color="primary" onClick={handleAddOutput}>
            <AddIcon />
          </IconButton>
        </Box>
      </div>
      
      <Divider />
      
      {/* Save as Blueprint */}
      <div className="section">
        <Typography className="section-title">Save as Blueprint</Typography>
        <TextField
          size="small"
          fullWidth
          label="Blueprint Name"
          placeholder="My Subgraph"
          value={blueprintName}
          onChange={(e) => setBlueprintName(e.target.value)}
          sx={{ mb: 1 }}
        />
        <TextField
          size="small"
          fullWidth
          multiline
          rows={2}
          label="Description (optional)"
          placeholder="Describe what this subgraph does..."
          value={blueprintDescription}
          onChange={(e) => setBlueprintDescription(e.target.value)}
          sx={{ mb: 1 }}
        />
        <Button
          variant="contained"
          startIcon={<SaveIcon />}
          onClick={handleSaveBlueprint}
          className="save-blueprint-button"
        >
          Save to Library
        </Button>
      </div>
    </Box>
  );
};

export default SubgraphEditorPanel;
