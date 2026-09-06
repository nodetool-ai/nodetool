/**
 * Step 3 of the Workflow flow — models and how it runs (PRD § 11.3).
 *
 * One model tile row per role the plan needs, drawn only from the providers
 * this install has configured; three run-mode cards; and the plan's inputs with
 * the samples the planner prefilled, editable, which is what the test run
 * sends.
 *
 * The shell's primary button is `Build your workflow` — the first thing in the
 * whole flow that places a node or spends anything (D4).
 */

import React, { memo, useMemo } from "react";
import type { WorkflowSetupPlan } from "@nodetool-ai/protocol/api-schemas/workflows.js";
import type { WorkflowSetupRunMode } from "@nodetool-ai/protocol/api-schemas/workflows.js";

import {
  AlertBanner,
  Caption,
  EditorButton,
  FlexColumn,
  GAP,
  Text,
  TextInput
} from "../../ui_primitives";
import { openProviderOnboarding } from "../../../stores/ProviderOnboardingStore";
import { OptionCardGrid } from "../OptionCardGrid";
import type { OptionCardItem } from "../OptionCardGrid";
import { MODEL_ROLE_LABEL, MODEL_ROLE_ONBOARDING } from "./modelRoles";

/** The three run modes, as cards (PRD § 11.3). */
export const RUN_MODE_CARDS = [
  {
    id: "manual",
    title: "Run by hand",
    description: "Open it and press run."
  },
  {
    id: "app",
    title: "App with a form",
    description: "A form over the inputs, shareable."
  },
  {
    id: "trigger",
    title: "On a trigger",
    description: "A schedule or a webhook starts it."
  }
] as const;

/** One role's tiles, as the host resolved them from configured providers. */
export interface ModelRoleChoices {
  role: string;
  /** One card per model the configured providers offer for this role. */
  tiles: readonly OptionCardItem[];
  /** The tile id currently chosen, or null. */
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export interface WorkflowSetupStepProps {
  plan: WorkflowSetupPlan;
  roles: readonly ModelRoleChoices[];
  runMode: WorkflowSetupRunMode;
  onRunModeChange: (mode: WorkflowSetupRunMode) => void;
  /** Writes a sample value back onto the plan input the test run uses. */
  onSampleChange: (inputName: string, value: string) => void;
}

const SetupStepInternal: React.FC<WorkflowSetupStepProps> = ({
  plan,
  roles,
  runMode,
  onRunModeChange,
  onSampleChange
}) => {
  const runModeOptions = useMemo(() => [...RUN_MODE_CARDS], []);

  return (
    <FlexColumn gap={GAP.spacious}>
      <FlexColumn gap={GAP.tight}>
        <Text size="big" component="h2">
          Models and how it runs
        </Text>
        <Text size="normal" color="secondary">
          Pick what each step runs on, and how you want to start it.
        </Text>
      </FlexColumn>

      {roles.map((role) => (
        <FlexColumn key={role.role} gap={GAP.normal}>
          <Text size="normal" component="h3">
            {MODEL_ROLE_LABEL[role.role] ?? role.role}
          </Text>
          {role.tiles.length === 0 ? (
            <AlertBanner
              severity="warning"
              action={
                <EditorButton
                  variant="text"
                  onClick={() =>
                    openProviderOnboarding({
                      capability: MODEL_ROLE_ONBOARDING[role.role],
                      reason: `This workflow needs a ${role.role} model.`
                    })
                  }
                >
                  Connect
                </EditorButton>
              }
            >
              <Caption component="span">
                {`No connected provider offers a ${role.role} model.`}
              </Caption>
            </AlertBanner>
          ) : (
            <OptionCardGrid
              label={MODEL_ROLE_LABEL[role.role] ?? role.role}
              options={role.tiles}
              selectedId={role.selectedId}
              onSelect={role.onSelect}
              minColumnWidth={220}
            />
          )}
        </FlexColumn>
      ))}

      <FlexColumn gap={GAP.normal}>
        <Text size="normal" component="h3">
          How it runs
        </Text>
        <OptionCardGrid
          label="Run mode"
          options={runModeOptions}
          selectedId={runMode}
          onSelect={(id) => onRunModeChange(id as WorkflowSetupRunMode)}
        />
      </FlexColumn>

      {plan.inputs.length > 0 ? (
        <FlexColumn gap={GAP.normal}>
          <Text size="normal" component="h3">
            Sample inputs
          </Text>
          <Caption color="secondary" component="p">
            The values the first run uses. Change them to something of yours.
          </Caption>
          {plan.inputs.map((input) => (
            <TextInput
              key={input.name}
              label={`${input.name} (${input.type})`}
              value={String(input.sample ?? "")}
              onChange={(event) =>
                onSampleChange(input.name, event.target.value)
              }
            />
          ))}
        </FlexColumn>
      ) : null}
    </FlexColumn>
  );
};

export const WorkflowSetupStep = memo(SetupStepInternal);
WorkflowSetupStep.displayName = "WorkflowSetupStep";

export default WorkflowSetupStep;
