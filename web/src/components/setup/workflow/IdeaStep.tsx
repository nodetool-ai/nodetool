/**
 * Step 1 of the Workflow flow — the idea (PRD § 11.1).
 *
 * A box for the task, three inspiration chips, and the three other ways in.
 * The brief writes straight to `settings.setup` as it is typed, so `Continue`
 * has only the stage left to write and a reload resumes with the text intact
 * (D1, D19).
 *
 * The alternatives all land in the same place: stage `done` and the canvas. An
 * example is copied, an import is parsed, a blank workflow is already there —
 * none of them has a plan to review, so none of them enters the flow.
 */

import React, { memo, useCallback, useMemo, useRef } from "react";

import {
  AlertBanner,
  Box,
  Caption,
  Chip,
  FlexColumn,
  GAP,
  Text,
  TextInput
} from "../../ui_primitives";
import { WORKFLOW_INSPIRATION_CHIPS } from "@nodetool-ai/protocol";
import { AlternativesColumn } from "../AlternativesColumn";
import type { AlternativeEntry } from "../AlternativesColumn";
import { useWorkflowSetupDocument } from "../../../hooks/workflow/useWorkflowSetup";

export interface WorkflowIdeaStepProps {
  workflowId: string;
  /** Writes the brief as it is typed. */
  onBriefChange: (brief: string) => void;
  /** Opens the examples browser; a copied example lands on the canvas. */
  onStartFromExample: () => void;
  /** Opens the file picker for a workflow JSON or a DSL `.ts`. */
  onImport: (file: File) => void | Promise<void>;
  /** Leaves the flow for an empty canvas. */
  onStartBlank: () => void;
  /** An import that was refused, shown above the alternatives. */
  importError?: string | null;
  onDismissImportError?: () => void;
}

/** What the import path accepts (PRD § 11.1). */
export const WORKFLOW_IMPORT_ACCEPT = ".json,.ts";

const IdeaStepInternal: React.FC<WorkflowIdeaStepProps> = ({
  workflowId,
  onBriefChange,
  onStartFromExample,
  onImport,
  onStartBlank,
  importError = null,
  onDismissImportError
}) => {
  const setup = useWorkflowSetupDocument(workflowId);
  const brief = setup?.brief ?? "";
  const importInput = useRef<HTMLInputElement>(null);

  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      onBriefChange(event.target.value);
    },
    [onBriefChange]
  );

  // The picked file is read once; clearing the value lets the same file be
  // picked again after a refusal.
  const handlePicked = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (file) {
        void onImport(file);
      }
    },
    [onImport]
  );

  const alternatives: AlternativeEntry[] = useMemo(
    () => [
      {
        id: "example",
        title: "Start from an example",
        description: "Copy a shipped workflow and edit it",
        onSelect: onStartFromExample
      },
      {
        id: "import",
        title: "Import a workflow",
        description: "JSON, or a DSL .ts file",
        onSelect: () => importInput.current?.click()
      },
      {
        id: "blank",
        title: "Start with a blank canvas",
        description: "Skip the plan and place nodes yourself",
        onSelect: onStartBlank
      }
    ],
    [onStartBlank, onStartFromExample]
  );

  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: {
          xs: "1fr",
          md: "minmax(0, 2fr) minmax(240px, 1fr)"
        },
        gap: GAP.spacious,
        alignItems: "start"
      }}
    >
      <FlexColumn gap={GAP.comfortable}>
        <FlexColumn gap={GAP.tight}>
          <Text size="big" component="h2">
            What should this workflow do?
          </Text>
          <Text size="normal" color="secondary">
            Describe the task. We&apos;ll plan the steps and check what it needs
            before building.
          </Text>
        </FlexColumn>

        <TextInput
          value={brief}
          autoFocus
          multiline
          rows={4}
          label="The task"
          hideLabel
          placeholder="Summarize a PDF and email it"
          onChange={handleChange}
        />

        {importError ? (
          <AlertBanner severity="error" onClose={onDismissImportError}>
            {importError}
          </AlertBanner>
        ) : null}

        <FlexColumn gap={GAP.normal}>
          <Caption color="secondary" component="p">
            Or start from one of these:
          </Caption>
          <Box
            role="group"
            aria-label="Inspiration"
            sx={{ display: "flex", flexWrap: "wrap", gap: GAP.normal }}
          >
            {WORKFLOW_INSPIRATION_CHIPS.map((chip) => (
              <Chip
                key={chip.id}
                label={chip.brief}
                onClick={() => onBriefChange(chip.brief)}
              />
            ))}
          </Box>
        </FlexColumn>
      </FlexColumn>

      <AlternativesColumn
        label="Other ways to start"
        alternatives={alternatives}
      />

      {/* The card is the control; this input only opens the picker. */}
      <input
        type="file"
        hidden
        ref={importInput}
        accept={WORKFLOW_IMPORT_ACCEPT}
        aria-label="Import a workflow"
        onChange={handlePicked}
      />
    </Box>
  );
};

export const WorkflowIdeaStep = memo(IdeaStepInternal);
WorkflowIdeaStep.displayName = "WorkflowIdeaStep";

export default WorkflowIdeaStep;
