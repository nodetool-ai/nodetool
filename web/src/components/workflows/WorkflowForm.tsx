/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import {
  Box,
  FormControl,
  OutlinedInput,
  FormLabel,
  Button,
  Select,
  MenuItem,
  SelectChangeEvent,
  Typography,
  Autocomplete,
  TextField
} from "@mui/material";
import { useEffect, useState } from "react";
import ThemeNodetool from "../themes/ThemeNodetool";
import DeleteButton from "../buttons/DeleteButton";
import { useFileDrop } from "../../hooks/handlers/useFileDrop";
import { WorkflowAttributes } from "../../stores/ApiTypes";
import { useNotificationStore } from "../../stores/NotificationStore";
import { prettyDate, relativeTime } from "../../utils/formatDateAndTime";
import { useSettingsStore } from "../../stores/SettingsStore";
import { useWorkflowStore } from "../../stores/WorkflowStore";
import { useNodes } from "../../contexts/NodeContext";

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

const styles = (theme: any) =>
  css({
    "&": {
      marginLeft: "16px",
      marginRight: "16px"
    },
    ".thumbnail-img": {
      position: "relative",
      border: `1px solid ${theme.palette.c_gray2}`,
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
      color: theme.palette.c_gray4,
      padding: "0px 10px",
      fontSize: theme.fontSizeSmall
    },
    ".thumbnail button": {
      position: "absolute",
      top: "1px",
      right: "1px",
      backgroundColor: "#333333cc"
    },
    ".save-button": {
      backgroundColor: theme.palette.c_gray1,
      border: "1px solid" + theme.palette.c_gray3,
      color: theme.palette.c_hl1,
      width: "100%",
      "&:hover": {
        border: "1px solid" + theme.palette.c_white
      }
    },
    "input, textarea, .MuiSelect-select": {
      fontFamily: theme.fontFamily1
    },
    ".save-text": {
      color: theme.palette.c_gray6,
      fontSize: theme.fontSizeSmall,
      lineHeight: "1em"
    },
    '[role~="tooltip"][data-microtip-position|="center"]::after': {
      position: "absolute",
      top: "1em",
      left: "1em",
      textAlign: "center",
      transform: "none",
      backgroundColor: theme.palette.c_gray1,
      color: theme.palette.c_white,
      fontFamily: theme.fontFamily1,
      fontSize: "1em",
      lineHeight: "1.25em",
      padding: ".5em",
      display: "block",
      maxWidth: "250px",
      wordWrap: "break-word",
      whiteSpace: "normal",
      transition:
        "all var(--microtip-transition-duration) var(--microtip-transition-easing) .5s"
    },
    ".tag-input": {
      marginBottom: theme.spacing(2),
      "& .MuiOutlinedInput-root": {
        fontFamily: theme.fontFamily1,
        color: theme.palette.c_white
      },
      "& .MuiAutocomplete-popper": {
        backgroundColor: theme.palette.c_gray1,
        "& .MuiPaper-root": {
          backgroundColor: theme.palette.c_gray1,
          color: theme.palette.c_white
        },
        "& .MuiAutocomplete-option": {
          "&:hover": {
            backgroundColor: theme.palette.c_gray2
          },
          "&[aria-selected='true']": {
            backgroundColor: theme.palette.c_gray3
          }
        }
      },
      "& .MuiChip-root": {
        color: theme.palette.c_white,
        borderColor: theme.palette.c_gray3
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
        color: theme.palette.c_white
      }
    }
  });

const WorkflowForm = () => {
  const { workflow, setWorkflowAttributes, saveWorkflow } = useNodes(
    (state) => ({
      workflow: state.workflow,
      setWorkflowAttributes: state.setWorkflowAttributes,
      saveWorkflow: state.saveWorkflow
    })
  );
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );
  const settings = useSettingsStore((state) => state.settings);
  const [localWorkflow, setLocalWorkflow] = useState(workflow);
  const [updatedAt, setUpdatedAt] = useState(workflow.updated_at);

  useEffect(() => {
    console.log("6. WorkflowForm initial workflow:", workflow);
    setLocalWorkflow(workflow);
  }, [workflow]);

  const handleSaveWorkflow = async () => {
    console.log("8. WorkflowForm saving workflow:", localWorkflow);
    setWorkflowAttributes(localWorkflow);
    await saveWorkflow();
    setUpdatedAt(new Date().toISOString());
    addNotification({
      type: "info",
      alert: true,
      content: "Workflow saved!",
      dismissable: true
    });
  };

  const handleChange = (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = event.target;
    setLocalWorkflow((prev: WorkflowAttributes) => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSelectChange = (event: SelectChangeEvent) => {
    const updatedWorkflow = {
      ...workflow,
      [event.target.name]: event.target.value
    };
    setLocalWorkflow(updatedWorkflow);
    handleBlur();
  };

  const handleBlur = async () => {
    if (localWorkflow !== workflow) {
      setWorkflowAttributes(localWorkflow);
      await saveWorkflow();
      setUpdatedAt(new Date().toISOString());
      addNotification({
        type: "info",
        content: "Workflow saved!",
        alert: true,
        dismissable: true
      });
    }
  };

  const deleteThumbnail = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    const updatedWorkflow = { ...workflow, thumbnail: "", thumbnail_url: "" };
    setWorkflowAttributes(updatedWorkflow);
    handleSaveWorkflow();
  };

  const { onDrop, onDragOver } = useFileDrop({
    uploadAsset: true,
    onChangeAsset: (asset) => {
      const updatedWorkflow = {
        ...workflow,
        thumbnail: asset.id,
        thumbnail_url: asset.get_url
      };
      setWorkflowAttributes(updatedWorkflow);
      handleSaveWorkflow();
    },
    type: "image"
  });

  const handleDropAndSave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    onDrop(event);
  };

  const tooltipAttributes = !workflow.thumbnail_url
    ? {
        role: "tooltip",
        "data-microtip-position": "center",
        "aria-label":
          "Drop an image from the asset browser or from your file explorer (jpg, png)"
      }
    : {};

  const handleTagChange = (_event: React.SyntheticEvent, newTags: string[]) => {
    console.log("9. WorkflowForm changing tags to:", newTags);
    const updatedWorkflow = {
      ...workflow,
      ...localWorkflow,
      tags: newTags
    };
    console.log("10. WorkflowForm workflow with new tags:", updatedWorkflow);
    setLocalWorkflow(updatedWorkflow);
    setWorkflowAttributes(updatedWorkflow);
    handleSaveWorkflow();
  };

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
              fontSize: ThemeNodetool.fontSizeNormal
            }}
          />
        </FormControl>
        <FormControl className="thumbnail">
          <FormLabel htmlFor="thumbnail">Thumbnail</FormLabel>
          <Box
            className="thumbnail-img"
            onDragOver={onDragOver}
            onDrop={handleDropAndSave}
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
        </FormControl>
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
        <FormControl>
          <FormLabel htmlFor="access">Access</FormLabel>
          <Select
            name="access"
            value={localWorkflow.access}
            onChange={handleSelectChange}
            onBlur={handleBlur}
            fullWidth
          >
            <MenuItem value="public">Public</MenuItem>
            <MenuItem value="private">Private</MenuItem>
          </Select>
        </FormControl>
        <Button className="save-button" onClick={() => handleSaveWorkflow()}>
          Save
        </Button>
        <Typography variant="caption" className="save-text">
          {prettyDate(updatedAt, "normal", settings)} <br />
          {relativeTime(updatedAt)}
        </Typography>
      </Box>
    </div>
  );
};

export default WorkflowForm;
