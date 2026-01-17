/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import {
  FormControl,
  OutlinedInput,
  FormLabel,
  Button,
  Typography,
  Autocomplete,
  TextField,
  MenuItem,
  FormHelperText
} from "@mui/material";
import { useCallback, useEffect, useState } from "react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { Workflow } from "../../stores/ApiTypes";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { useNotificationStore } from "../../stores/NotificationStore";
import WorkspaceSelect from "../workspaces/WorkspaceSelect";

const AVAILABLE_TAGS = [
  "image",
  "audio",
  "video",
  "comfy",
  "chat",
  "docs",
  "mail",
  "rag",
  "example"
];

const MODIFIER_KEYS = ["Control", "Alt", "Shift", "Meta"];

const styles = (theme: Theme) =>
  css({
    "&": {
      margin: 0,
      padding: theme.spacing(3),
      minWidth: "420px",
      maxWidth: "500px"
    },
    
    // Header styling
    ".workflow-header": {
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(2),
      marginBottom: theme.spacing(4),
      paddingBottom: theme.spacing(2),
      borderBottom: `1px solid ${theme.vars.palette.grey[700]}`,
      "& h3": {
        margin: 0,
        fontSize: "1.25rem",
        fontWeight: 600,
        color: theme.vars.palette.grey[0],
        letterSpacing: "-0.02em"
      }
    },
    
    // Section grouping
    ".settings-section": {
      marginBottom: theme.spacing(3),
      padding: theme.spacing(2),
      backgroundColor: theme.vars.palette.action.hover,
      borderRadius: "8px",
      border: `1px solid ${theme.vars.palette.grey[800]}`
    },
    
    ".section-title": {
      fontSize: theme.fontSizeSmall,
      fontWeight: 600,
      color: theme.vars.palette.grey[300],
      textTransform: "uppercase",
      letterSpacing: "0.08em",
      marginBottom: theme.spacing(2)
    },
    
    // Form controls
    ".MuiFormControl-root": {
      marginBottom: theme.spacing(2),
      "&:last-child": {
        marginBottom: 0
      }
    },
    
    ".MuiFormLabel-root": {
      fontSize: theme.fontSizeSmall,
      fontWeight: 500,
      color: theme.vars.palette.grey[200],
      marginBottom: theme.spacing(0.75),
      display: "block"
    },
    
    ".MuiOutlinedInput-root": {
      backgroundColor: theme.vars.palette.grey[900],
      borderRadius: "6px",
      transition: "all 0.2s ease",
      "& .MuiOutlinedInput-notchedOutline": {
        borderColor: theme.vars.palette.grey[700],
        transition: "border-color 0.2s ease"
      },
      "&:hover .MuiOutlinedInput-notchedOutline": {
        borderColor: theme.vars.palette.grey[500]
      },
      "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
        borderColor: "var(--palette-primary-main)",
        borderWidth: "1px"
      }
    },
    
    ".MuiOutlinedInput-input": {
      fontFamily: theme.fontFamily1,
      fontSize: theme.fontSizeNormal,
      color: theme.vars.palette.grey[0],
      padding: "10px 12px"
    },
    
    ".MuiFormHelperText-root": {
      fontSize: "0.7rem",
      color: theme.vars.palette.grey[400],
      marginTop: theme.spacing(0.5),
      marginLeft: 0
    },
    
    // Tag input
    ".tag-input": {
      "& .MuiOutlinedInput-root": {
        fontFamily: theme.fontFamily1,
        color: theme.vars.palette.grey[0],
        minHeight: "42px"
      },
      "& .MuiAutocomplete-popper": {
        backgroundColor: theme.vars.palette.grey[800],
        zIndex: theme.zIndex.autocomplete,
        "& .MuiPaper-root": {
          backgroundColor: theme.vars.palette.grey[800],
          color: theme.vars.palette.grey[0],
          borderRadius: "6px",
          border: `1px solid ${theme.vars.palette.grey[700]}`
        },
        "& .MuiAutocomplete-option": {
          fontSize: theme.fontSizeSmall,
          "&:hover": {
            backgroundColor: theme.vars.palette.grey[600]
          },
          "&[aria-selected='true']": {
            backgroundColor: theme.vars.palette.grey[500]
          }
        }
      },
      "& .MuiChip-root": {
        color: theme.vars.palette.grey[0],
        backgroundColor: theme.vars.palette.grey[700],
        borderColor: theme.vars.palette.grey[500],
        fontSize: theme.fontSizeSmall,
        height: "26px"
      }
    },
    
    // Shortcut input
    ".shortcut-input-container": {
      position: "relative",
      display: "flex",
      alignItems: "center"
    },
    
    ".shortcut-input .MuiOutlinedInput-root": {
      cursor: "pointer",
      fontFamily: theme.fontFamily1,
      color: theme.vars.palette.grey[0],
      "&.Mui-focused": {
        backgroundColor: theme.vars.palette.grey[800]
      }
    },
    
    ".clear-button": {
      position: "absolute",
      right: "8px",
      color: theme.vars.palette.grey[300],
      fontSize: theme.fontSizeSmall,
      textTransform: "none",
      minWidth: "auto",
      padding: "4px 10px",
      "&:hover": {
        color: theme.vars.palette.grey[0],
        backgroundColor: theme.vars.palette.action.disabledBackground
      }
    },
    
    // Run mode select
    ".MuiSelect-select": {
      fontFamily: theme.fontFamily1
    },
    
    // Button container
    ".button-container": {
      display: "flex",
      gap: theme.spacing(2),
      marginTop: theme.spacing(4),
      paddingTop: theme.spacing(3),
      borderTop: `1px solid ${theme.vars.palette.grey[800]}`,
      justifyContent: "flex-end"
    },
    
    ".cancel-button": {
      backgroundColor: "transparent",
      color: theme.vars.palette.grey[200],
      padding: "8px 20px",
      fontSize: theme.fontSizeSmall,
      fontWeight: 500,
      textTransform: "none",
      borderRadius: "6px",
      "&:hover": {
        backgroundColor: theme.vars.palette.grey[700]
      }
    },
    
    ".save-button": {
      background: `linear-gradient(135deg, var(--palette-primary-main) 0%, ${theme.vars.palette.primary.dark} 100%)`,
      color: theme.vars.palette.primary.contrastText,
      padding: "8px 28px",
      fontSize: theme.fontSizeSmall,
      fontWeight: 600,
      textTransform: "none",
      borderRadius: "6px",
      border: "none",
      boxShadow: `0 2px 8px ${theme.vars.palette.primary.main}4d`,
      transition: "all 0.2s ease",
      "&:hover": {
        boxShadow: `0 4px 12px ${theme.vars.palette.primary.main}66`,
        transform: "translateY(-1px)"
      }
    },
    
    // Thumbnail (commented out but keeping styles)
    ".thumbnail-img": {
      position: "relative",
      border: `1px solid ${theme.vars.palette.grey[600]}`,
      borderRadius: "6px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      backgroundSize: "contain",
      backgroundRepeat: "no-repeat",
      backgroundPosition: "center",
      width: "100%",
      height: "64px",
      userSelect: "none",
      color: theme.vars.palette.grey[400],
      padding: "0px 10px",
      fontSize: theme.fontSizeSmall
    },
    ".thumbnail button": {
      position: "absolute",
      top: "1px",
      right: "1px",
      backgroundColor: `rgba(${theme.vars.palette.grey[700]} / 0.8)`
    }
  });

interface WorkflowFormProps {
  workflow: Workflow;
  onClose: () => void;
}

const WorkflowForm = ({ workflow, onClose }: WorkflowFormProps) => {
  const [localWorkflow, setLocalWorkflow] = useState<Workflow>(workflow);
  const [isCapturing, setIsCapturing] = useState(false);
  const { saveWorkflow } = useWorkflowManager((state) => ({
    saveWorkflow: state.saveWorkflow
  }));
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );
  const theme = useTheme();
  useEffect(() => {
    setLocalWorkflow(workflow || ({} as Workflow));
  }, [workflow]);

  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const { name, value } = event.target;
      setLocalWorkflow((prev: Workflow) => ({
        ...prev,
        [name]: value
      }));
    },
    [setLocalWorkflow]
  );

  const handleSave = useCallback(async () => {
    await saveWorkflow(localWorkflow);
    addNotification({
      type: "info",
      alert: true,
      content: "Workflow saved!",
      dismissable: true
    });
    onClose();
  }, [saveWorkflow, localWorkflow, addNotification, onClose]);

  // const deleteThumbnail = useCallback(
  //   (event: React.MouseEvent<HTMLButtonElement>) => {
  //     event.stopPropagation();
  //     const updatedWorkflow = { ...workflow, thumbnail: "", thumbnail_url: "" };
  //     setLocalWorkflow(updatedWorkflow);
  //   },
  //   [workflow, setLocalWorkflow]
  // );

  // const { onDrop, onDragOver } = useFileDrop({
  //   uploadAsset: true,
  //   onChangeAsset: (asset) => {
  //     const updatedWorkflow = {
  //       ...workflow,
  //       thumbnail: asset.id,
  //       thumbnail_url: asset.get_url
  //     };
  //     setLocalWorkflow(updatedWorkflow);
  //   },
  //   type: "image"
  // });

  const handleTagChange = (_event: React.SyntheticEvent, newTags: string[]) => {
    const updatedWorkflow = {
      ...workflow,
      ...localWorkflow,
      tags: newTags
    };
    setLocalWorkflow(updatedWorkflow);
  };

  const handleShortcutKeyDown = (event: React.KeyboardEvent) => {
    event.preventDefault();

    if (!isCapturing) {return;}

    const pressedKey = event.key;
    if (pressedKey === "Escape") {
      setIsCapturing(false);
      return;
    }

    // Skip if only modifier keys are pressed
    if (MODIFIER_KEYS.includes(pressedKey)) {return;}

    // Build the shortcut string
    const parts: string[] = [];
    if (event.ctrlKey) {parts.push("CommandOrControl");}
    if (event.altKey) {parts.push("Alt");}
    if (event.shiftKey) {parts.push("Shift");}
    if (event.metaKey) {parts.push("Meta");}

    // Add the main key
    parts.push(pressedKey.length === 1 ? pressedKey.toUpperCase() : pressedKey);

    const shortcut = parts.join("+");
    setLocalWorkflow((prev: Workflow) => ({
      ...prev,
      settings: {
        ...(prev.settings || {}),
        shortcut: shortcut
      }
    }));
    setIsCapturing(false);
  };

  const clearShortcut = useCallback(() => {
    setLocalWorkflow((prev: Workflow) => ({
      ...prev,
      settings: {
        ...(prev.settings || {}),
        shortcut: ""
      }
    }));
  }, []);

  const handleToolNameChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const rawValue = event.target.value || "";
      const sanitizedValue = rawValue.replace(/[^A-Za-z0-9_]/g, "");
      setLocalWorkflow((prev: Workflow) => ({
        ...prev,
        tool_name: sanitizedValue
      }));
    },
    []
  );

  const handleWorkspaceChange = useCallback(
    (workspaceId: string | undefined) => {
      setLocalWorkflow((prev: Workflow) => ({
        ...prev,
        workspace_id: workspaceId || null
      }));
    },
    []
  );

  return (
    <div css={styles(theme)} className="workflow-form">
      <div className="workflow-header">
        <Typography variant="h3">Workflow Settings</Typography>
      </div>

      {/* Basic Information Section */}
      <div className="settings-section">
        <FormControl fullWidth>
          <FormLabel htmlFor="name">Name</FormLabel>
          <OutlinedInput
            fullWidth
            name="name"
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
            value={localWorkflow.name}
            onChange={handleChange}
          />
        </FormControl>

        <FormControl fullWidth>
          <FormLabel htmlFor="description">Description</FormLabel>
          <OutlinedInput
            name="description"
            value={localWorkflow.description}
            onChange={handleChange}
            multiline
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
            minRows={2}
          />
        </FormControl>

        <FormControl fullWidth>
          <FormLabel htmlFor="tags">Tags</FormLabel>
          <Autocomplete
            className="tag-input"
            multiple
            options={AVAILABLE_TAGS}
            value={localWorkflow.tags || []}
            onChange={handleTagChange}
            slotProps={{
              popper: {
                style: {
                  zIndex: theme.zIndex.autocomplete
                }
              }
            }}
            renderInput={(params) => (
              <TextField {...params} placeholder="Select tags..." />
            )}
          />
        </FormControl>
      </div>

      {/* Execution Section */}
      <div className="settings-section">
        <Typography className="section-title">Execution</Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 2 }}>
          Configure how this workflow runs and can be triggered
        </Typography>

        <FormControl fullWidth>
          <FormLabel>Run Mode</FormLabel>
          <TextField
            select
            value={localWorkflow.run_mode || "workflow"}
            onChange={(e) =>
              setLocalWorkflow((prev: Workflow) => ({
                ...prev,
                run_mode: e.target.value
              }))
            }
          >
            <MenuItem value="workflow">Workflow</MenuItem>
            <MenuItem value="chat">Chat</MenuItem>
            <MenuItem value="app">App</MenuItem>
            <MenuItem value="tool">Tool</MenuItem>
          </TextField>
        </FormControl>

        <FormControl fullWidth>
          <FormLabel htmlFor="shortcut">Keyboard Shortcut</FormLabel>
          <div className="shortcut-input-container">
            <OutlinedInput
              className="shortcut-input"
              fullWidth
              name="shortcut"
              value={
                isCapturing
                  ? "Press keys..."
                  : localWorkflow.settings?.shortcut || "Click to set shortcut"
              }
              onKeyDown={handleShortcutKeyDown}
              onFocus={() => setIsCapturing(true)}
              onBlur={() => setIsCapturing(false)}
              readOnly
            />
            {localWorkflow.settings?.shortcut && (
              <Button
                className="clear-button"
                onClick={clearShortcut}
                size="small"
              >
                Clear
              </Button>
            )}
          </div>
          <FormHelperText>
            Global shortcut to run this workflow (Electron only)
          </FormHelperText>
        </FormControl>
      </div>

      {/* Advanced Section */}
      <div className="settings-section">
        <Typography className="section-title">Advanced</Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 2 }}>
          Advanced configuration for workspaces and API/tool usage
        </Typography>

        <WorkspaceSelect
          value={localWorkflow.workspace_id ?? undefined}
          onChange={handleWorkspaceChange}
          helperText="Associate a workspace folder with this workflow for agent access"
        />

        <FormControl fullWidth>
          <FormLabel htmlFor="tool_name">Tool Name</FormLabel>
          <OutlinedInput
            fullWidth
            name="tool_name"
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
            value={localWorkflow.tool_name || ""}
            onChange={handleToolNameChange}
            placeholder="my_workflow_tool"
          />
          <FormHelperText>
            Identifier for API/tool usage. Letters, numbers, underscores only.
          </FormHelperText>
        </FormControl>
      </div>

      <div className="button-container">
        <Button className="cancel-button" onClick={onClose}>
          Cancel
        </Button>
        <Button className="save-button" onClick={handleSave}>
          Save Changes
        </Button>
      </div>
    </div>
  );
};

export default WorkflowForm;
