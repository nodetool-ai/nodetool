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
import { useCallback, useEffect, useState } from "react";
import ThemeNodetool from "../themes/ThemeNodetool";
import DeleteButton from "../buttons/DeleteButton";
import { useFileDrop } from "../../hooks/handlers/useFileDrop";
import { Workflow, WorkflowAttributes } from "../../stores/ApiTypes";
import { useNotificationStore } from "../../stores/NotificationStore";
import { useSettingsStore } from "../../stores/SettingsStore";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";

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
  const { workflow, updateWorkflowInManager } = useWorkflowManager((state) => ({
    workflow: state.getCurrentWorkflow() || {
      id: "",
      name: "",
      description: "",
      thumbnail: "",
      thumbnail_url: "",
      access: "private",
      tags: [],
      updated_at: "",
      created_at: "",
      graph: {
        nodes: [],
        edges: []
      }
    },
    updateWorkflowInManager: state.updateWorkflow
  }));
  const { update } = useWorkflowManager((state) => ({
    update: state.update
  }));
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );
  const settings = useSettingsStore((state) => state.settings);
  const [localWorkflow, setLocalWorkflow] = useState<Workflow>(workflow);

  useEffect(() => {
    setLocalWorkflow(workflow || ({} as Workflow));
  }, [workflow]);

  const handleSaveWorkflow = useCallback(async () => {
    if (!localWorkflow) return;
    updateWorkflowInManager(localWorkflow);
    await update(localWorkflow);
    addNotification({
      type: "info",
      alert: true,
      content: "Workflow saved!",
      dismissable: true
    });
  }, [localWorkflow, updateWorkflowInManager, update]);

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

  const handleSelectChange = useCallback(
    (event: SelectChangeEvent) => {
      const updatedWorkflow = {
        ...workflow,
        [event.target.name]: event.target.value
      };
      setLocalWorkflow(updatedWorkflow);
    },
    [setLocalWorkflow]
  );

  const deleteThumbnail = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      const updatedWorkflow = { ...workflow, thumbnail: "", thumbnail_url: "" };
      setLocalWorkflow(updatedWorkflow);
    },
    [setLocalWorkflow]
  );

  const { onDrop, onDragOver } = useFileDrop({
    uploadAsset: true,
    onChangeAsset: (asset) => {
      const updatedWorkflow = {
        ...workflow,
        thumbnail: asset.id,
        thumbnail_url: asset.get_url
      };
      setLocalWorkflow(updatedWorkflow);
    },
    type: "image"
  });

  const tooltipAttributes = !workflow.thumbnail_url
    ? {
        role: "tooltip",
        "data-microtip-position": "center",
        "aria-label":
          "Drop an image from the asset browser or from your file explorer (jpg, png)"
      }
    : {};

  const handleTagChange = (_event: React.SyntheticEvent, newTags: string[]) => {
    const updatedWorkflow = {
      ...workflow,
      ...localWorkflow,
      tags: newTags
    };
    setLocalWorkflow(updatedWorkflow);
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
            fullWidth
          >
            <MenuItem value="public">Public</MenuItem>
            <MenuItem value="private">Private</MenuItem>
          </Select>
        </FormControl>
        <Button className="save-button" onClick={() => handleSaveWorkflow()}>
          Save
        </Button>
      </Box>
    </div>
  );
};

export default WorkflowForm;
