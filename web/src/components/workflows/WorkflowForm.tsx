/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import {
  TextArea,
  TextInput,
  SelectField,
  AutocompleteTagInput,
  EditorButton,
  FormSection,
  FlexRow,
  SPACING
} from "../ui_primitives";
import { useCallback, useEffect, useRef, useState, memo, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { Workflow } from "../../stores/ApiTypes";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { useNotificationStore } from "../../stores/NotificationStore";
import { useDebouncedCallback } from "../../hooks/useDebouncedCallback";
import WorkspaceSelect from "../workspaces/WorkspaceSelect";

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
      maxWidth: theme.breakpoints.values.sm,
      boxSizing: "border-box"
    },

    ".settings-section": {
      marginBottom: theme.spacing(SPACING.xl)
    },

    // Close footer, shown only outside a dialog (the side panel).
    ".button-container": {
      marginTop: theme.spacing(SPACING.xl),
      paddingTop: theme.spacing(SPACING.lg),
      borderTop: `1px solid ${theme.vars.palette.divider}`,
      justifyContent: "flex-end"
    }
  });

interface WorkflowFormProps {
  workflow: Workflow;
  /** Renders a Close button under the form. Omit inside a Dialog, whose
   *  title X already closes it. */
  onClose?: () => void;
  availableTags?: string[];
}

const WorkflowForm = ({ workflow, onClose, availableTags = [] }: WorkflowFormProps) => {
  const { t } = useTranslation();
  const [localWorkflow, setLocalWorkflow] = useState<Workflow>(workflow);
  const runModeOptions = [
    { value: "workflow", label: t("pass3_37.workflowForm.runModeWorkflow") },
    { value: "chat", label: t("pass3_37.workflowForm.runModeChat") },
    { value: "app", label: t("pass3_37.workflowForm.runModeApp") },
    { value: "tool", label: t("pass3_37.workflowForm.runModeTool") }
  ];
  const saveWorkflow = useWorkflowManager((state) => state.saveWorkflow);
  const getNodeStore = useWorkflowManager((state) => state.getNodeStore);
  const updateWorkflow = useWorkflowManager((state) => state.updateWorkflow);
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

  // Persist the fields edited in this form onto the workflow. When the workflow
  // is open in the editor we merge onto its live node-store copy, so a canvas
  // edit or a rename from the tab since the form opened is kept; otherwise we
  // save the form's own copy. A settings change is not a version checkpoint.
  const pendingRef = useRef<Workflow | null>(null);
  const editedRef = useRef<Set<keyof Workflow>>(new Set());
  const persist = useCallback(
    (next: Workflow) => {
      pendingRef.current = null;
      const edited = [...editedRef.current];
      editedRef.current = new Set();
      const store = getNodeStore(next.id);
      const base = store ? store.getState().getWorkflow() : next;
      const patch: Partial<Workflow> = Object.fromEntries(
        edited.map((key) => [key, next[key]])
      );
      if (store) {
        // Write the edits into the open editor too. Otherwise a save that
        // overlaps a canvas edit keeps the old values in the editor, and the
        // next Ctrl+S writes them back.
        updateWorkflow({ ...base, ...patch });
      }
      saveWorkflow({ ...base, ...patch }, { snapshot: false }).catch((err) => {
        // Surface autosave failures instead of swallowing them — a silent
        // failure here is exactly what "my setting didn't save" looks like.
        addNotification({
          type: "error",
          alert: true,
          content: t("pass3_37.workflowForm.saveFailed", {
            error: err instanceof Error ? err.message : String(err)
          }),
          dismissable: true
        });
      });
    },
    [getNodeStore, saveWorkflow, updateWorkflow, addNotification, t]
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
      for (const key of Object.keys(patch) as Array<keyof Workflow>) {
        editedRef.current.add(key);
      }
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
        <TextInput
          label={t("pass3_37.workflowForm.name")}
          name="name"
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          value={localWorkflow.name}
          onChange={handleChange}
        />

        <TextArea
          label={t("pass3_37.workflowForm.description")}
          name="description"
          value={localWorkflow.description}
          onChange={(description) => applyChange({ description })}
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          minRows={2}
        />

        <AutocompleteTagInput
          label={t("pass3_37.workflowForm.tags")}
          value={localWorkflow.tags || []}
          onChange={(tags) => {
            const uniqueTags = Array.from(new Set(tags.map(t => t.trim().toLowerCase()).filter(t => t.length > 0)));
            applyChange({ tags: uniqueTags }, true);
          }}
          suggestions={tagOptions}
          placeholder={t("pass3_37.workflowForm.tagsPlaceholder")}
          description={t("pass3_37.workflowForm.tagsDescription")}
        />
      </FormSection>

      <FormSection label={t("pass3_37.workflowForm.execution")} className="settings-section">
        <SelectField
          label={t("pass3_37.workflowForm.runMode")}
          value={localWorkflow.run_mode || "workflow"}
          onChange={(value) => applyChange({ run_mode: value }, true)}
          options={runModeOptions}
          description={t("pass3_37.workflowForm.runModeDescription")}
        />
      </FormSection>

      <FormSection label={t("pass3_37.workflowForm.advanced")} className="settings-section">
        <WorkspaceSelect
          label={t("pass3_37.workflowForm.workspace")}
          value={localWorkflow.workspace_id ?? undefined}
          onChange={handleWorkspaceChange}
          helperText={t("pass3_37.workflowForm.workspaceDescription")}
        />

        <TextInput
          label={t("pass3_37.workflowForm.toolName")}
          helperText={t("pass3_37.workflowForm.toolNameDescription")}
          name="tool_name"
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          value={localWorkflow.tool_name || ""}
          onChange={handleToolNameChange}
          placeholder={t("pass3_37.workflowForm.toolNamePlaceholder")}
        />
      </FormSection>

      {onClose && (
        <FlexRow className="button-container" gap={SPACING.md}>
          <EditorButton variant="text" color="inherit" onClick={onClose}>
            {t("pass3_37.workflowForm.close")}
          </EditorButton>
        </FlexRow>
      )}
    </div>
  );
};

export default memo(WorkflowForm);
