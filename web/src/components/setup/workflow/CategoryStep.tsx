/**
 * Step 2 of the Workflow flow, first half — the category (PRD § 11.2).
 *
 * Six cards. Picking one writes `settings.setup.category` and nothing else: it
 * biases which node types the planner is shown and which run mode step 3 opens
 * on. No node is placed here and no model is called — `Plan the steps` on the
 * shell's primary button is what runs the planner.
 *
 * `PlannerModelFooterField` chooses which model writes the plan. It sits in
 * the shell's footer beside the estimate, at the weight of a setting rather
 * than of the question this step asks — but it is the way past a default model
 * the account cannot use, so it stays on screen rather than behind a
 * disclosure.
 */

import React, { memo } from "react";
import { useTranslation } from "react-i18next";
import type { LanguageModelValue } from "../../../stores/ApiTypes";

import { Caption, FlexColumn, GAP, Text } from "../../ui_primitives";
import LanguageModelSelect from "../../properties/LanguageModelSelect";
import { OptionCardGrid } from "../OptionCardGrid";
import { SetupFooterField } from "../SetupFooterField";
import { WORKFLOW_CATEGORIES, workflowCategory } from "./categories";

export interface WorkflowCategoryStepProps {
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export interface PlannerModelFooterFieldProps {
  /** The model that writes the plan, or null when no provider offers one. */
  plannerModel: { provider: string; id: string } | null;
  onPlannerModelChange: (model: { provider: string; id: string }) => void;
  readOnly?: boolean;
}

/** The planner model, for the shell's footer. */
export const PlannerModelFooterField: React.FC<
  PlannerModelFooterFieldProps
> = ({ plannerModel, onPlannerModelChange, readOnly = false }) => {
  const { t } = useTranslation();
  return (
    <SetupFooterField label={t("pass3_14.workflowSetup.category.modelLabel")}>
      <LanguageModelSelect
        value={plannerModel?.id ?? ""}
        provider={plannerModel?.provider}
        placeholder={t(
          "pass3_14.workflowSetup.category.plannerModelPlaceholder"
        )}
        disabled={readOnly}
        onChange={(value: LanguageModelValue) =>
          onPlannerModelChange({ provider: value.provider, id: value.id })
        }
      />
    </SetupFooterField>
  );
};

const CategoryStepInternal: React.FC<WorkflowCategoryStepProps> = ({
  selectedId,
  onSelect
}) => {
  const { t } = useTranslation();
  const chosen = workflowCategory(selectedId ?? undefined);
  return (
    <FlexColumn gap={GAP.comfortable}>
      <FlexColumn gap={GAP.tight}>
        <Text size="big" component="h2">
          {t("pass3_14.workflowSetup.category.title")}
        </Text>
        <Text size="normal" color="secondary">
          {t("pass3_14.workflowSetup.category.description")}
        </Text>
      </FlexColumn>
      <OptionCardGrid
        label={t("pass3_14.workflowSetup.category.gridLabel")}
        options={WORKFLOW_CATEGORIES}
        selectedId={selectedId}
        onSelect={onSelect}
      />
      {chosen ? (
        <Caption color="secondary" component="p">
          {t("pass3_14.workflowSetup.category.runModeSummary", {
            runMode: t(
              `pass3_14.workflowSetup.category.runModes.${chosen.defaultRunMode}`
            )
          })}
        </Caption>
      ) : null}
    </FlexColumn>
  );
};

export const WorkflowCategoryStep = memo(CategoryStepInternal);
WorkflowCategoryStep.displayName = "WorkflowCategoryStep";

export default WorkflowCategoryStep;
