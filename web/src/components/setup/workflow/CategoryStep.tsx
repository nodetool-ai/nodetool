/**
 * Step 2 of the Workflow flow, first half — the category (PRD § 11.2).
 *
 * Six cards. Picking one writes `settings.setup.category` and nothing else: it
 * biases which node types the planner is shown and which run mode step 3 opens
 * on. No node is placed here and no model is called — `Plan the steps` on the
 * shell's primary button is what runs the planner.
 */

import React, { memo } from "react";

import { Caption, FlexColumn, GAP, Text } from "../../ui_primitives";
import { OptionCardGrid } from "../OptionCardGrid";
import { WORKFLOW_CATEGORIES, workflowCategory } from "./categories";

export interface WorkflowCategoryStepProps {
  selectedId: string | null;
  onSelect: (id: string) => void;
}

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
          This decides which nodes the plan reaches for, and how it runs once
          it is built.
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
