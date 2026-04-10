/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { Text, Caption, TextInput, SelectField, AutocompleteTagInput, EditorButton } from "../ui_primitives";
import { useCallback, useEffect, useState, memo, useMemo } from "react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { Workflow } from "../../stores/ApiTypes";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { useNotificationStore } from "../../stores/NotificationStore";
import WorkspaceSelect from "../workspaces/WorkspaceSelect";
import PanelHeadline from "../ui/PanelHeadline";

const DEFAULT_TAG_SUGGESTIONS = [
  "image",
  "audio",
  "video",
  "comfy",
  "chat",
  "docs",
  "mail",
  "rag"
];


const styles = (theme: Theme) =>
  css({
    "&": {
      margin: 0,
      padding: theme.spacing(3),
      minWidth: "420px",
      maxWidth: "500px"
    },
    
    // Section grouping
    ".settings-section": {
      display: "flex",
      flexDirection: "column" as const,
      gap: theme.spacing(1),
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
    
    // Form controls — both FormControl and TextField
    ".MuiFormControl-root, .MuiTextField-root": {
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
        minHeight: "auto"
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
    }
  });

interface WorkflowFormProps {
  workflow: Workflow;
  onClose: () => void;
  availableTags?: string[];
}

const WorkflowForm = ({ workflow, onClose, availableTags = [] }: WorkflowFormProps) => {
  const [localWorkflow, setLocalWorkflow] = useState<Workflow>(workflow);
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

  // Merge default suggestions with available tags from existing workflows
  const tagOptions = useMemo(() => {
    const allTags = new Set([...DEFAULT_TAG_SUGGESTIONS, ...availableTags]);
    return Array.from(allTags).sort();
  }, [availableTags]);

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
      <PanelHeadline title="Workflow Settings" />

      {/* Basic Information Section */}
      <div className="settings-section">
        <TextInput
          label="Name"
          name="name"
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          value={localWorkflow.name}
          onChange={handleChange}
        />

        <TextInput
          label="Description"
          name="description"
          value={localWorkflow.description}
          onChange={handleChange}
          multiline
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          minRows={2}
        />

        <AutocompleteTagInput
          label="Tags"
          value={localWorkflow.tags || []}
          onChange={(tags) => {
            const uniqueTags = Array.from(new Set(tags.map(t => t.trim().toLowerCase()).filter(t => t.length > 0)));
            setLocalWorkflow((prev: Workflow) => ({ ...prev, tags: uniqueTags }));
          }}
          suggestions={tagOptions}
          placeholder="Type or select tags..."
          description="Select from suggestions or type custom tags (press Enter to add)"
        />
      </div>

      {/* Execution Section */}
      <div className="settings-section">
        <Text className="section-title">Execution</Text>
        <Caption sx={{ display: "block", mb: 2 }}>
          Configure how this workflow runs and can be triggered
        </Caption>

        <SelectField
          label="Run Mode"
          value={localWorkflow.run_mode || "workflow"}
          onChange={(value) =>
            setLocalWorkflow((prev: Workflow) => ({
              ...prev,
              run_mode: value
            }))
          }
          options={[
            { value: "workflow", label: "Workflow" },
            { value: "chat", label: "Chat" },
            { value: "comfy", label: "Comfy" },
            { value: "app", label: "App" },
            { value: "tool", label: "Tool" }
          ]}
        />

      </div>

      {/* Advanced Section */}
      <div className="settings-section">
        <Text className="section-title">Advanced</Text>
        <Caption sx={{ display: "block", mb: 2 }}>
          Advanced configuration for workspaces and API/tool usage
        </Caption>

        <WorkspaceSelect
          value={localWorkflow.workspace_id ?? undefined}
          onChange={handleWorkspaceChange}
          helperText="Associate a workspace folder with this workflow for agent access"
        />

        <TextInput
          label="Tool Name"
          name="tool_name"
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          value={localWorkflow.tool_name || ""}
          onChange={handleToolNameChange}
          placeholder="my_workflow_tool"
          helperText="Identifier for API/tool usage. Letters, numbers, underscores only."
        />
      </div>

      <div className="button-container">
        <EditorButton className="cancel-button" onClick={onClose}>
          Cancel
        </EditorButton>
        <EditorButton className="save-button" onClick={handleSave}>
          Save Changes
        </EditorButton>
      </div>
    </div>
  );
};

export default memo(WorkflowForm);
