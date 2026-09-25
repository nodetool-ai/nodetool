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
> = ({ plannerModel, onPlannerModelChange, readOnly = false }) => (
  <SetupFooterField label="Model">
    <LanguageModelSelect
      value={plannerModel?.id ?? ""}
      provider={plannerModel?.provider}
      placeholder="Planner model"
      disabled={readOnly}
      onChange={(value: LanguageModelValue) =>
        onPlannerModelChange({ provider: value.provider, id: value.id })
      }
    />
  </SetupFooterField>
);

const CategoryStepInternal: React.FC<WorkflowCategoryStepProps> = ({
  selectedId,
  onSelect
}) => {
  const chosen = workflowCategory(selectedId ?? undefined);
  return (
    <FlexColumn gap={GAP.comfortable}>
      <FlexColumn gap={GAP.tight}>
        <Text size="big" component="h2">
          What kind of workflow?
        </Text>
        <Text size="normal" color="secondary">
          This decides which nodes the plan reaches for, and how it runs once it
          is built.
        </Text>
      </FlexColumn>
      <OptionCardGrid
        label="Workflow category"
        options={WORKFLOW_CATEGORIES}
        selectedId={selectedId}
        onSelect={onSelect}
      />
      {chosen ? (
        <Caption color="secondary" component="p">
          {`Built to run: ${RUN_MODE_LABEL[chosen.defaultRunMode]}. You can change that in the next step.`}
        </Caption>
      ) : null}
    </FlexColumn>
  );
};

/** How each run mode reads in a sentence. Shared with the setup step's cards. */
export const RUN_MODE_LABEL = {
  manual: "by hand",
  app: "as an app with a form",
  trigger: "on a trigger"
} as const;

export const WorkflowCategoryStep = memo(CategoryStepInternal);
WorkflowCategoryStep.displayName = "WorkflowCategoryStep";

export default WorkflowCategoryStep;
