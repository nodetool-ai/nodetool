/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { Caption, TextInput, SelectField, AutocompleteTagInput, EditorButton, FormField, FormSection, MOTION, BORDER_RADIUS, SPACING, getSpacingPx } from "../ui_primitives";
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
    
    // Section chrome; the field stack and its gaps are FormSection's job.
    ".settings-section": {
      marginBottom: theme.spacing(3),
      padding: theme.spacing(2),
      backgroundColor: theme.vars.palette.action.hover,
      borderRadius: BORDER_RADIUS.lg,
      border: `1px solid ${theme.vars.palette.divider}`
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
    // MUI defaults.
    ".MuiOutlinedInput-input": {
      fontFamily: theme.fontFamily1,
      color: theme.vars.palette.text.primary
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
      padding: `${getSpacingPx(SPACING.md)} ${getSpacingPx(SPACING.xxl)}`, // was 8px 20px
      fontSize: theme.fontSizeSmall,
      fontWeight: 500,
      textTransform: "none",
      borderRadius: BORDER_RADIUS.md,
      "&:hover": {
        backgroundColor: theme.vars.palette.action.hover,
        color: theme.vars.palette.text.primary
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
    setLocalWorkflow(workflow);
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
      <FormSection className="settings-section">
        <FormField label="Name">
          <TextInput
            name="name"
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
            value={localWorkflow.name}
            onChange={handleChange}
          />
        </FormField>

        <FormField label="Description">
          <TextInput
            name="description"
            value={localWorkflow.description}
            onChange={handleChange}
            multiline
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
            minRows={2}
          />
        </FormField>

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
      </FormSection>

      <FormSection label="Execution" className="settings-section">
        <Caption sx={{ display: "block" }}>
          Configure how this workflow runs and can be triggered
        </Caption>

        <FormField label="Run Mode">
          <SelectField
            label="Run Mode"
            value={localWorkflow.run_mode || "workflow"}
            onChange={(value) => applyChange({ run_mode: value }, true)}
            options={RUN_MODE_OPTIONS}
          />
        </FormField>
      </FormSection>

      <FormSection label="Advanced" className="settings-section">
        <Caption sx={{ display: "block" }}>
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

        <FormField
          label="Tool Name"
          helperText="Identifier for API/tool usage. Letters, numbers, underscores only."
        >
          <TextInput
            name="tool_name"
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
            value={localWorkflow.tool_name || ""}
            onChange={handleToolNameChange}
            placeholder="my_workflow_tool"
          />
        </FormField>
      </FormSection>

      <div className="button-container">
        <EditorButton className="cancel-button" onClick={onClose}>
          Close
        </EditorButton>
      </div>
    </div>
  );
};

export default memo(WorkflowForm);
