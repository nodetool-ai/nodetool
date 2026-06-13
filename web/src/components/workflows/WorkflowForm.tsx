/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { Text, Caption, TextInput, SelectField, AutocompleteTagInput, EditorButton, MOTION } from "../ui_primitives";
import { useCallback, useEffect, useState, memo, useMemo } from "react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { Workflow } from "../../stores/ApiTypes";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { useNotificationStore } from "../../stores/NotificationStore";
import WorkspaceSelect from "../workspaces/WorkspaceSelect";
import { isProduction } from "../../lib/env";

const workspacesEnabled = !isProduction;

const RUN_MODE_OPTIONS = [
  { value: "workflow", label: "Workflow" },
  { value: "chat", label: "Chat" },
  { value: "app", label: "App" },
  { value: "tool", label: "Tool" }
];

const DEFAULT_TAG_SUGGESTIONS = [
  "image",
  "audio",
  "video",
  "chat",
  "docs",
  "mail",
  "rag"
];


const styles = (theme: Theme) =>
  css({
    "&": {
      margin: 0,
      padding: 0,
      width: "100%",
      maxWidth: "500px",
      boxSizing: "border-box"
    },
    
    // Section grouping
    ".settings-section": {
      display: "flex",
      flexDirection: "column" as const,
      gap: theme.spacing(1),
      marginBottom: theme.spacing(3),
      padding: theme.spacing(2),
      backgroundColor: theme.vars.palette.action.hover,
      borderRadius: "var(--rounded-lg)",
      border: `1px solid ${theme.vars.palette.divider}`
    },

    ".section-title": {
      fontSize: theme.fontSizeSmall,
      fontWeight: 600,
      color: theme.vars.palette.text.secondary,
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
      color: theme.vars.palette.text.secondary,
      marginBottom: theme.spacing(1),
      display: "block"
    },
    
    ".MuiOutlinedInput-root": {
      backgroundColor: theme.vars.palette.background.paper,
      borderRadius: "var(--rounded-md)",
      transition: MOTION.all,
      "& .MuiOutlinedInput-notchedOutline": {
        borderColor: theme.vars.palette.divider,
        transition: MOTION.border
      },
      "&:hover .MuiOutlinedInput-notchedOutline": {
        borderColor: theme.vars.palette.text.secondary
      },
      "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
        borderColor: "var(--palette-primary-main)",
        borderWidth: "1px"
      }
    },
    
    ".MuiOutlinedInput-input": {
      fontFamily: theme.fontFamily1,
      fontSize: theme.fontSizeNormal,
      color: theme.vars.palette.text.primary,
      padding: "10px 12px"
    },

    ".MuiFormHelperText-root": {
      fontSize: "var(--fontSizeSmaller)",
      color: theme.vars.palette.text.secondary,
      marginTop: theme.spacing(0.5),
      marginLeft: 0
    },
    
    // Tag input
    ".tag-input": {
      "& .MuiOutlinedInput-root": {
        fontFamily: theme.fontFamily1,
        color: theme.vars.palette.text.primary,
        minHeight: "auto"
      },
      "& .MuiAutocomplete-popper": {
        backgroundColor: theme.vars.palette.background.paper,
        zIndex: theme.zIndex.autocomplete,
        "& .MuiPaper-root": {
          backgroundColor: theme.vars.palette.background.paper,
          color: theme.vars.palette.text.primary,
          borderRadius: "var(--rounded-md)",
          border: `1px solid ${theme.vars.palette.divider}`
        },
        "& .MuiAutocomplete-option": {
          fontSize: theme.fontSizeSmall,
          "&:hover": {
            backgroundColor: theme.vars.palette.action.hover
          },
          "&[aria-selected='true']": {
            backgroundColor: theme.vars.palette.action.selected
          }
        }
      },
      "& .MuiChip-root": {
        color: theme.vars.palette.text.primary,
        backgroundColor: theme.vars.palette.action.selected,
        borderColor: theme.vars.palette.divider,
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
      borderTop: `1px solid ${theme.vars.palette.divider}`,
      justifyContent: "flex-end"
    },

    ".cancel-button": {
      backgroundColor: "transparent",
      color: theme.vars.palette.text.secondary,
      padding: "8px 20px",
      fontSize: theme.fontSizeSmall,
      fontWeight: 500,
      textTransform: "none",
      borderRadius: "var(--rounded-md)",
      "&:hover": {
        backgroundColor: theme.vars.palette.action.hover,
        color: theme.vars.palette.text.primary
      }
    },

    ".save-button": {
      backgroundColor: theme.vars.palette.primary.main,
      color: theme.vars.palette.primary.contrastText,
      padding: "8px 28px",
      fontSize: theme.fontSizeSmall,
      fontWeight: 600,
      textTransform: "none",
      borderRadius: "var(--rounded-md)",
      border: "none",
      boxShadow: "none",
      transition: MOTION.background,
      "&:hover": {
        backgroundColor: theme.vars.palette.primary.dark,
        boxShadow: "none"
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
  const saveWorkflow = useWorkflowManager((state) => state.saveWorkflow);
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
          options={RUN_MODE_OPTIONS}
        />

      </div>

      {/* Advanced Section */}
      <div className="settings-section">
        <Text className="section-title">Advanced</Text>
        <Caption sx={{ display: "block", mb: 2 }}>
          {workspacesEnabled
            ? "Advanced configuration for workspaces and API/tool usage"
            : "Advanced configuration for API/tool usage"}
        </Caption>

        {workspacesEnabled && (
          <WorkspaceSelect
            value={localWorkflow.workspace_id ?? undefined}
            onChange={handleWorkspaceChange}
            helperText="Associate a workspace folder with this workflow for agent access"
          />
        )}

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
