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
 *
 * The examples browser opens **in this step** (PRD § 11.1), replacing the body
 * until the creator picks one or goes back. It is the step's own escape route;
 * `Change flow` in the footer is the other one, and leaves for a different kind
 * of document entirely.
 */

import React, { memo, useCallback, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";

import {
  AlertBanner,
  Box,
  FlexColumn,
  GAP,
  Text,
  TextArea
} from "../../ui_primitives";
import { WORKFLOW_INSPIRATION_CHIPS } from "@nodetool-ai/protocol";
import { ExampleBriefs } from "../ExampleBriefs";
import { AlternativesColumn } from "../AlternativesColumn";
import type { AlternativeEntry } from "../AlternativesColumn";
import { useWorkflowSetupDocument } from "../../../hooks/workflow/useWorkflowSetup";
import type { Workflow } from "../../../stores/ApiTypes";
import ReportBugButton from "../../support/ReportBugButton";
import { WorkflowExamplePicker } from "./ExamplePicker";

export interface WorkflowIdeaStepProps {
  workflowId: string;
  /** Writes the brief as it is typed. */
  onBriefChange: (brief: string) => void;
  /** True while the inline examples browser is open, in place of the body. */
  browsingExamples: boolean;
  /** Opens and closes that browser. */
  onBrowseExamples: (browsing: boolean) => void;
  /** Copies the picked example. A copy that lands leaves the flow. */
  onStartFromExample: (example: Workflow) => void;
  /** The example being copied right now. */
  pickingExampleId?: string | null;
  /** Why the last copy was refused. */
  exampleError?: string | null;
  /** Reads a picked workflow JSON file onto this workflow. */
  onImport: (file: File) => void | Promise<void>;
  /** True while a picked file is being read onto this workflow. */
  importing?: boolean;
  /** Leaves the flow for an empty canvas. */
  onStartBlank: () => void;
  /** An import that was refused, shown above the alternatives. */
  importError?: string | null;
  onDismissImportError?: () => void;
}

/**
 * What the import path accepts (PRD § 11.1). A DSL `.ts` file is a program the
 * browser cannot run, so the picker does not offer one only to refuse it.
 */
export const WORKFLOW_IMPORT_ACCEPT = ".json,application/json";

const IdeaStepInternal: React.FC<WorkflowIdeaStepProps> = ({
  workflowId,
  onBriefChange,
  browsingExamples,
  onBrowseExamples,
  onStartFromExample,
  pickingExampleId = null,
  exampleError = null,
  onImport,
  importing = false,
  onStartBlank,
  importError = null,
  onDismissImportError
}) => {
  const { t } = useTranslation();
  const setup = useWorkflowSetupDocument(workflowId);
  const brief = setup?.brief ?? "";
  const importInput = useRef<HTMLInputElement>(null);
  const briefField = useRef<HTMLElement | null>(null);

  const handleChange = useCallback(
    (value: string) => {
      onBriefChange(value);
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
        title: t("pass3_14.workflowSetup.idea.alternatives.exampleTitle"),
        description: t(
          "pass3_14.workflowSetup.idea.alternatives.exampleDescription"
        ),
        onSelect: () => onBrowseExamples(true),
        // A file being read lands on this workflow and opens it, so a second
        // way in started meanwhile would be overwritten by it, or overwrite it.
        disabled: importing,
        disabledReason: t("pass3_14.workflowSetup.idea.importing")
      },
      {
        id: "import",
        title: t("pass3_14.workflowSetup.idea.alternatives.importTitle"),
        description: importing
          ? t("pass3_14.workflowSetup.idea.importing")
          : t("pass3_14.workflowSetup.idea.alternatives.importDescription"),
        onSelect: () => importInput.current?.click(),
        disabled: importing,
        disabledReason: t("pass3_14.workflowSetup.idea.importing")
      },
      {
        id: "blank",
        title: t("pass3_14.workflowSetup.idea.alternatives.blankTitle"),
        description: t(
          "pass3_14.workflowSetup.idea.alternatives.blankDescription"
        ),
        onSelect: onStartBlank,
        disabled: importing,
        disabledReason: t("pass3_14.workflowSetup.idea.importing")
      }
    ],
    [importing, onBrowseExamples, onStartBlank, t]
  );

  if (browsingExamples) {
    return (
      <WorkflowExamplePicker
        onPick={onStartFromExample}
        pickingId={pickingExampleId}
        error={exampleError}
        onCancel={() => onBrowseExamples(false)}
      />
    );
  }

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
            {t("pass3_14.workflowSetup.idea.title")}
          </Text>
          <Text size="normal" color="secondary">
            {t("pass3_14.workflowSetup.idea.description")}
          </Text>
        </FlexColumn>

        <TextArea
          value={brief}
          autoFocus
          rows={4}
          label={t("pass3_14.workflowSetup.idea.taskLabel")}
          hideLabel
          placeholder={t("pass3_14.workflowSetup.idea.taskPlaceholder")}
          helperText={t("pass3_14.workflowSetup.idea.taskHelper")}
          onChange={handleChange}
          inputRef={briefField}
        />

        {importError ? (
          <AlertBanner
            severity="error"
            onClose={onDismissImportError}
            action={
              <ReportBugButton
                context={{
                  source: "operation-failure",
                  summary: t("pass3_14.workflowSetup.idea.importFailed"),
                  errorText: importError,
                  workflowId
                }}
              />
            }
          >
            {importError}
          </AlertBanner>
        ) : null}

        <ExampleBriefs
          examples={WORKFLOW_INSPIRATION_CHIPS.map((chip) => chip.brief)}
          brief={brief}
          onSelect={onBriefChange}
          briefRef={briefField}
        />
      </FlexColumn>

      <AlternativesColumn
        label={t("pass3_14.workflowSetup.idea.alternativesLabel")}
        alternatives={alternatives}
      />

      {/* The card is the control; this input only opens the picker. */}
      <input
        type="file"
        hidden
        ref={importInput}
        accept={WORKFLOW_IMPORT_ACCEPT}
        aria-label={t("pass3_14.workflowSetup.idea.importAriaLabel")}
        onChange={handlePicked}
      />
    </Box>
  );
};

export const WorkflowIdeaStep = memo(IdeaStepInternal);
WorkflowIdeaStep.displayName = "WorkflowIdeaStep";

export default WorkflowIdeaStep;
