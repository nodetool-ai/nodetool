/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import {
  Box,
  FormControl,
  OutlinedInput,
  FormLabel,
  Button,
  Typography,
  Autocomplete,
  TextField,
  MenuItem
} from "@mui/material";
import { useCallback, useEffect, useState } from "react";
import { useTheme } from "@mui/material/styles";
import { Workflow } from "../../stores/ApiTypes";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { useNotificationStore } from "../../stores/NotificationStore";

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

const styles = (theme: any) =>
  css({
    "&": {
      margin: theme.spacing(2)
    },
    ".thumbnail-img": {
      position: "relative",
      border: `1px solid ${theme.palette.grey[600]}`,
      borderRadius: "4px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      backgroundSize: "contain",
      backgroundRepeat: "no-repeat",
      backgroundPosition: "center",
      width: "100%",
      height: "64px",
      userSelect: "none",
      color: theme.palette.grey[400],
      padding: "0px 10px",
      fontSize: theme.fontSizeSmall
    },
    ".thumbnail button": {
      position: "absolute",
      top: "1px",
      right: "1px",
      backgroundColor: "#333333cc"
    },
    "input, textarea, .MuiSelect-select": {
      fontFamily: theme.fontFamily1
    },
    ".tag-input": {
      marginBottom: theme.spacing(2),
      "& .MuiOutlinedInput-root": {
        fontFamily: theme.fontFamily1,
        color: theme.palette.grey[0]
      },
      "& .MuiAutocomplete-popper": {
        backgroundColor: theme.palette.grey[800],
        "& .MuiPaper-root": {
          backgroundColor: theme.palette.grey[800],
          color: theme.palette.grey[0]
        },
        "& .MuiAutocomplete-option": {
          "&:hover": {
            backgroundColor: theme.palette.grey[600]
          },
          "&[aria-selected='true']": {
            backgroundColor: theme.palette.grey[500]
          }
        }
      },
      "& .MuiChip-root": {
        color: theme.palette.grey[0],
        borderColor: theme.palette.grey[500]
      }
    },
    ".workflow-header": {
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(2),
      marginBottom: theme.spacing(3),
      padding: theme.spacing(2, 0),
      "& h3": {
        margin: 0,
        fontSize: "1.5rem",
        fontWeight: 500,
        color: theme.palette.grey[0]
      }
    },
    ".button-container": {
      display: "flex",
      gap: theme.spacing(10),
      marginTop: theme.spacing(5),
      justifyContent: "space-between"
    },
    ".save-button": {
      backgroundColor: theme.palette.grey[800],
      border: "1px solid" + theme.palette.grey[500],
      color: "var(--palette-primary-main)",
      width: "120px",
      height: "40px",
      "&.MuiButton-root": {
        fontSize: theme.fontSizeNormal
      },
      "&:hover": {
        border: "1px solid" + theme.palette.grey[0]
      }
    },
    ".cancel-button": {
      backgroundColor: "transparent",
      color: theme.palette.grey[100],
      width: "120px",
      height: "40px",
      "&:hover": {
        backgroundColor: theme.palette.grey[600]
      }
    },
    ".shortcut-input": {
      "& .MuiOutlinedInput-root": {
        cursor: "pointer",
        fontFamily: theme.fontFamily1,
        color: theme.palette.grey[0],
        "&.Mui-focused": {
          backgroundColor: theme.palette.grey[600]
        }
      }
    },
    ".shortcut-input-container": {
      position: "relative",
      display: "flex",
      alignItems: "center",
      "& .clear-button": {
        position: "absolute",
        right: "8px",
        color: theme.palette.grey[100],
        "&:hover": {
          color: theme.palette.grey[0]
        }
      }
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

    if (!isCapturing) return;

    const pressedKey = event.key;
    if (pressedKey === "Escape") {
      setIsCapturing(false);
      return;
    }

    // Skip if only modifier keys are pressed
    if (MODIFIER_KEYS.includes(pressedKey)) return;

    // Build the shortcut string
    const parts = [];
    if (event.ctrlKey) parts.push("CommandOrControl");
    if (event.altKey) parts.push("Alt");
    if (event.shiftKey) parts.push("Shift");
    if (event.metaKey) parts.push("Meta");

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

  return (
    <div css={styles} className="workflow-form">
      <Box sx={{ pl: 2, pr: 2 }}>
        <div className="workflow-header">
          <Typography variant="h3">Workflow Settings</Typography>
        </div>
        <FormControl>
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
        <FormControl>
          <FormLabel htmlFor="description">Description</FormLabel>
          <OutlinedInput
            name="description"
            value={localWorkflow.description}
            onChange={handleChange}
            multiline
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
            minRows={1}
            style={{
              width: "100%",
              backgroundColor: "transparent",
              color: "white",
              fontSize: theme.fontSizeNormal
            }}
          />
        </FormControl>
        {/* <FormControl className="thumbnail">
          <FormLabel htmlFor="thumbnail">Thumbnail</FormLabel>
          <Box
            className="thumbnail-img"
            onDragOver={onDragOver}
            onDrop={onDrop}
            {...tooltipAttributes}
            sx={{
              backgroundImage: `url(${workflow.thumbnail_url})`
            }}
          >
            {!workflow.thumbnail_url && "Drop image"}
            {workflow.thumbnail_url && (
              <DeleteButton
                item={workflow}
                onClick={(e) => deleteThumbnail(e)}
              />
            )}
          </Box>
        </FormControl> */}
        <FormControl fullWidth>
          <FormLabel htmlFor="tags">Tags</FormLabel>
          <Autocomplete
            className="tag-input"
            multiple
            options={AVAILABLE_TAGS}
            value={localWorkflow.tags || []}
            onChange={handleTagChange}
            renderInput={(params) => (
              <TextField {...params} placeholder="Select tags..." />
            )}
          />
        </FormControl>
        <FormControl fullWidth>
          <FormLabel htmlFor="shortcut">
            Keyboard Shortcut for Running Workflow
          </FormLabel>
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
        </FormControl>
        <FormControl fullWidth sx={{ mt: 2 }}>
          <FormLabel>Run Mode</FormLabel>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1, mt: 1 }}>
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
              <MenuItem value="tool">Tool</MenuItem>
            </TextField>
          </Box>
        </FormControl>
        <div className="button-container">
          <Button className="cancel-button" onClick={onClose}>
            Cancel
          </Button>
          <Button className="save-button" onClick={handleSave}>
            Save
          </Button>
        </div>
      </Box>
    </div>
  );
};

export default WorkflowForm;
