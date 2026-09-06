/**
 * Step 3 of the Workflow flow — models and how it runs (PRD § 11.3).
 *
 * One model tile row per role the plan needs, drawn only from the providers
 * this install has configured; three run-mode cards; and the plan's inputs with
 * the samples the planner prefilled, editable, which is what the test run
 * sends.
 *
 * The shell's primary button is `Build your workflow` — the first thing in the
 * whole flow that places a node or spends anything (D4). It also runs the
 * workflow once with those sample inputs, which PRD § 11.3 makes part of the
 * action, so this step says so before the click rather than leaving it to the
 * landing checklist afterwards (F1): the disclosure at the foot names the run,
 * the models it will use, and the inputs it will send.
 */

import React, { memo, useMemo } from "react";
import type { WorkflowSetupPlan } from "@nodetool-ai/protocol/api-schemas/workflows.js";
import type { WorkflowSetupRunMode } from "@nodetool-ai/protocol/api-schemas/workflows.js";

import {
  AlertBanner,
  Caption,
  EditorButton,
  FlexColumn,
  FlexRow,
  GAP,
  Label,
  LoadingSpinner,
  SPACING,
  Text,
  TextInput
} from "../../ui_primitives";
import { openProviderOnboarding } from "../../../stores/ProviderOnboardingStore";
import { OptionCardGrid } from "../OptionCardGrid";
import type { OptionCardItem } from "../OptionCardGrid";
import { MODEL_ROLE_LABEL, MODEL_ROLE_ONBOARDING } from "./modelRoles";

/**
 * The three run modes, as cards (PRD § 11.3).
 *
 * Each description says what happens *after* this build, because the build
 * itself always ends the same way: nodes placed, graph checked, one run with
 * the sample inputs. "Open it and press run" read as "nothing runs until you
 * do", which is the one thing the button does not promise (F1).
 */
export const RUN_MODE_CARDS = [
  {
    id: "manual",
    title: "Run by hand",
    description: "After the test run, you open it and press run."
  },
  {
    id: "app",
    title: "App with a form",
    description: "After the test run, put a shareable form over the inputs."
  },
  {
    id: "trigger",
    title: "On a trigger",
    description: "After the test run, a schedule or a webhook starts it."
  }
] as const;

/** Whether a role's tiles are there yet, and why not when they are not. */
export type ModelRoleStatus = "loading" | "error" | "empty" | "ready";

/**
 * What one role's models are, as the host reads them off the configured
 * providers. The host answers availability; which one is picked belongs to the
 * document, so the flow adds that (F17).
 */
export interface ModelRoleAvailability {
  role: string;
  /** One card per model the configured providers offer for this role. */
  tiles: readonly OptionCardItem[];
  /** Loading, failed, no provider, or usable (F14). */
  status: ModelRoleStatus;
  /** What the model query said when `status` is "error". */
  errorMessage?: string | null;
  /** Re-runs the model query behind this row. */
  onRetry: () => void;
}

/** One role's tile row: what is on offer, plus what the workflow remembers. */
export interface ModelRoleChoices extends ModelRoleAvailability {
  /** The tile id currently chosen, or null. */
  selectedId: string | null;
  onSelect: (id: string) => void;
  /**
   * A remembered pick this install no longer offers — a provider that was
   * disconnected, a model that was retired. The row falls back to the first
   * tile and says so, rather than building on a model nobody chose.
   */
  unavailableSelection?: string | null;
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
        <ModelRoleRow key={role.role} role={role} />
      ))}

      <FlexColumn gap={GAP.normal}>
        <Text size="normal" component="h3">
          How it runs
        </Text>
        <Caption color="secondary" component="p">
          Building runs it once with the sample inputs. This is how you start it
          after that.
        </Caption>
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
            The values the test run uses. Change them to something of yours.
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

      <BuildDisclosure plan={plan} roles={roles} />
    </FlexColumn>
  );
};

/**
 * What `Build your workflow` does, said before the click (F1).
 *
 * The button builds *and* runs: PRD § 11.3 makes the test run part of the
 * action, and § 11.4 puts `Test run` on the landing checklist. The defect was
 * that the run was only ever disclosed afterwards, on that checklist. This
 * block sits with the run-mode cards and the sample inputs it will send, and
 * names the models it will spend on.
 */
const BuildDisclosure: React.FC<{
  plan: WorkflowSetupPlan;
  roles: readonly ModelRoleChoices[];
}> = ({ plan, roles }) => {
  const chosen = roles
    .map((role) => {
      const tile = role.tiles.find((option) => option.id === role.selectedId);
      return tile ? `${MODEL_ROLE_LABEL[role.role] ?? role.role}: ${tile.title}` : null;
    })
    .filter((entry): entry is string => entry !== null);

  return (
    <FlexColumn
      gap={GAP.tight}
      role="region"
      aria-label="Before you build"
      sx={{
        borderTop: "1px solid",
        borderColor: "divider",
        paddingTop: SPACING.lg
      }}
    >
      <Label>Build places the nodes and then runs it once</Label>
      <Text size="small" color="secondary">
        {plan.inputs.length > 0
          ? "The graph is checked, and if it passes it runs once with the sample inputs above. That run calls the models below and can cost provider rates."
          : "The graph is checked, and if it passes it runs once. That run calls the models below and can cost provider rates."}
      </Text>
      <Text size="small">
        {chosen.length > 0
          ? `Runs on ${chosen.join(" · ")}`
          : "This plan needs no model of its own."}
      </Text>
      <Caption color="secondary">
        Cost is unknown until the run returns — it depends on what each step
        sends. Nothing runs a second time on its own.
      </Caption>
    </FlexColumn>
  );
};

/** One role's tile row, with the four states a model query can be in (F14). */
const ModelRoleRow: React.FC<{ role: ModelRoleChoices }> = ({ role }) => {
  const label = MODEL_ROLE_LABEL[role.role] ?? role.role;
  return (
    <FlexColumn gap={GAP.normal}>
      <Text size="normal" component="h3">
        {label}
      </Text>
      {role.status === "loading" ? (
        <FlexRow gap={GAP.normal} align="center">
          <LoadingSpinner size="small" />
          <Caption color="secondary" component="span">
            {`Reading the ${role.role} models your providers offer…`}
          </Caption>
        </FlexRow>
      ) : role.status === "error" ? (
        <AlertBanner
          severity="error"
          action={
            <EditorButton variant="text" onClick={role.onRetry}>
              Try again
            </EditorButton>
          }
        >
          <Caption component="span">
            {role.errorMessage
              ? `Could not read the ${role.role} models: ${role.errorMessage}`
              : `Could not read the ${role.role} models.`}
          </Caption>
        </AlertBanner>
      ) : role.status === "empty" ? (
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
        <>
          {role.unavailableSelection ? (
            <AlertBanner severity="warning">
              <Caption component="span">
                {`"${role.unavailableSelection}" is not offered any more. Pick another ${role.role} model.`}
              </Caption>
            </AlertBanner>
          ) : null}
          <OptionCardGrid
            label={label}
            options={role.tiles}
            selectedId={role.selectedId}
            onSelect={role.onSelect}
            minColumnWidth={220}
          />
        </>
      )}
    </FlexColumn>
  );
};

export const WorkflowSetupStep = memo(SetupStepInternal);
WorkflowSetupStep.displayName = "WorkflowSetupStep";

export default WorkflowSetupStep;
