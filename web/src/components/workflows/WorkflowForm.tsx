/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { Text, Caption, TextInput, SelectField, AutocompleteTagInput, EditorButton, MOTION, BORDER_RADIUS } from "../ui_primitives";
import { useCallback, useEffect, useRef, useState, memo, useMemo } from "react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { Workflow } from "../../stores/ApiTypes";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { useNotificationStore } from "../../stores/NotificationStore";
import { useDebouncedCallback } from "../../hooks/useDebouncedCallback";
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
      borderRadius: BORDER_RADIUS.lg,
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
    
    // Form controls — both FormControl and TextField. Spacing only; the input
    // and its floating label are owned by the ui_primitives (TextInput,
    // SelectField, AutocompleteTagInput) — don't restyle the label here or it
    // breaks the resting-label-as-placeholder morph.
    ".MuiFormControl-root, .MuiTextField-root": {
      marginBottom: theme.spacing(2),
      "&:last-child": {
        marginBottom: 0
      }
    },

    ".MuiOutlinedInput-root": {
      backgroundColor: theme.vars.palette.background.paper,
      borderRadius: BORDER_RADIUS.md,
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
    
    // Only the dark-section essentials: brand font + light text for contrast on
    // the grey[900] field. Size and vertical padding stay at the primitive /
    // MUI defaults so the floating label centres correctly.
    ".MuiOutlinedInput-input": {
      fontFamily: theme.fontFamily1,
      color: theme.vars.palette.text.primary
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
          borderRadius: BORDER_RADIUS.md,
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
      borderRadius: BORDER_RADIUS.md,
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
      borderRadius: BORDER_RADIUS.md,
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
  const getNodeStore = useWorkflowManager((state) => state.getNodeStore);
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );
  const theme = useTheme();
  // Re-sync local form state only when a *different* workflow is opened — not on
  // every new `workflow` reference. The parent selector builds this prop via
  // `getWorkflow()`, which returns a fresh object on every store update, so
  // depending on the object identity would reset the form (wiping in-progress
  // edits) before the autosave round-trips.
  const workflowId = workflow?.id;
  useEffect(() => {
    setLocalWorkflow(workflow || ({} as Workflow));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflowId]);

  // Merge default suggestions with available tags from existing workflows
  const tagOptions = useMemo(() => {
    const allTags = new Set([...DEFAULT_TAG_SUGGESTIONS, ...availableTags]);
    return Array.from(allTags).sort();
  }, [availableTags]);

  // Persist the form's metadata onto the workflow. When the workflow is open in
  // the editor we merge onto its live node-store graph so a concurrent canvas
  // edit isn't clobbered by the form's stale graph snapshot; otherwise we save
  // the form's own copy.
  const pendingRef = useRef<Workflow | null>(null);
  const persist = useCallback(
    (next: Workflow) => {
      pendingRef.current = null;
      const store = getNodeStore(next.id);
      const base = store ? store.getState().getWorkflow() : next;
      saveWorkflow({
        ...base,
        name: next.name,
        description: next.description,
        tags: next.tags,
        run_mode: next.run_mode,
        tool_name: next.tool_name,
        workspace_id: next.workspace_id ?? null
      }).catch((err) => {
        // Surface autosave failures instead of swallowing them — a silent
        // failure here is exactly what "my setting didn't save" looks like.
        addNotification({
          type: "error",
          alert: true,
          content: `Failed to save workflow: ${
            err instanceof Error ? err.message : String(err)
          }`,
          dismissable: true
        });
      });
    },
    [getNodeStore, saveWorkflow, addNotification]
  );

  const debouncedPersist = useDebouncedCallback(persist, 600);

  // Track the latest local value (for change-merging and unmount flush) without
  // running side effects inside the state updater.
  const latestRef = useRef(localWorkflow);
  latestRef.current = localWorkflow;

  // Flush a pending debounced save if the form unmounts before it fires (e.g.
  // the user types then immediately closes the panel/modal).
  useEffect(() => {
    return () => {
      if (pendingRef.current) persist(pendingRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Apply a field change to local state and schedule (or immediately run) the
  // autosave. Discrete pickers (run mode, workspace) save immediately; free-text
  // fields debounce so we don't save on every keystroke.
  const applyChange = useCallback(
    (patch: Partial<Workflow>, immediate = false) => {
      const next = { ...latestRef.current, ...patch };
      latestRef.current = next;
      setLocalWorkflow(next);
      if (immediate) {
        debouncedPersist.cancel();
        pendingRef.current = null;
        persist(next);
      } else {
        pendingRef.current = next;
        debouncedPersist(next);
      }
    },
    [persist, debouncedPersist]
  );

  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const { name, value } = event.target;
      applyChange({ [name]: value });
    },
    [applyChange]
  );

  const handleToolNameChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const sanitizedValue = (event.target.value || "").replace(
        /[^A-Za-z0-9_]/g,
        ""
      );
      applyChange({ tool_name: sanitizedValue });
    },
    [applyChange]
  );

  const handleWorkspaceChange = useCallback(
    (workspaceId: string | undefined) => {
      applyChange({ workspace_id: workspaceId || null }, true);
    },
    [applyChange]
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
            applyChange({ tags: uniqueTags }, true);
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
          onChange={(value) => applyChange({ run_mode: value }, true)}
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
          Close
        </EditorButton>
      </div>
    </div>
  );
};

export default memo(WorkflowForm);
