/**
 * Step 2 of the Workflow flow, second half — the plan review (PRD § 11.2, D23).
 *
 * The plan as a numbered list the creator can edit, reorder, add to and cut
 * from, with two markers that decide whether the flow can go on:
 *
 * - **red** — the step names a node type the live registry does not have. A
 *   search field beside it picks a real one. This is the marker that stops a
 *   plausible-sounding step from building a graph that runs and does nothing
 *   (R6): a type the registry cannot name never reaches `ui_add_node`.
 * - **amber** — the step needs a model role no configured provider covers.
 *   `Connect` opens provider onboarding in place.
 *
 * `Continue to setup` is the shell's primary button, and the flow disables it
 * while either marker is up (criterion 4). Nothing here places a node or spends
 * anything; the one model call it can make is `Re-plan`.
 */

import React, { memo, useCallback, useMemo } from "react";
import type { WorkflowSetupPlan } from "@nodetool-ai/protocol/api-schemas/workflows.js";
import { resolveWorkflowPlan } from "@nodetool-ai/protocol";
import type { ResolvedWorkflowStep } from "@nodetool-ai/protocol";

import {
  AlertBanner,
  Autocomplete,
  Box,
  Caption,
  EditorButton,
  FlexColumn,
  FlexRow,
  GAP,
  Text,
  TextInput
} from "../../ui_primitives";
import type { AutocompleteOption } from "../../ui_primitives";
import useMetadataStore from "../../../stores/MetadataStore";
import { openProviderOnboarding } from "../../../stores/ProviderOnboardingStore";
import { PlanReview } from "../PlanReview";
import type { PlanReviewSection } from "../PlanReview";
import { MODEL_ROLE_ONBOARDING } from "./modelRoles";


export interface WorkflowReviewStepProps {
  plan: WorkflowSetupPlan;
  /** Replaces the whole plan; the document is the draft (D1). */
  onPlanChange: (plan: WorkflowSetupPlan) => void;
  onReplan: () => void;
  replanPending?: boolean;
  /** True when a configured provider covers this model role. */
  providerConfigured: (role: string) => boolean;
  /** The reason the last plan run was refused, if it was. */
  error?: string | null;
}

const ReviewStepInternal: React.FC<WorkflowReviewStepProps> = ({
  plan,
  onPlanChange,
  onReplan,
  replanPending = false,
  providerConfigured,
  error = null
}) => {
  const metadata = useMetadataStore((state) => state.metadata);

  // Every type the registry has: the field is the fix for a step the planner
  // could not name, so narrowing it would hide the node someone needs.
  const nodeTypeOptions = useMemo<AutocompleteOption[]>(
    () =>
      Object.keys(metadata)
        .sort()
        .map((nodeType) => ({ label: nodeType, value: nodeType })),
    [metadata]
  );

  const resolved = useMemo(
    () =>
      resolveWorkflowPlan(plan, {
        knownNodeType: (nodeType) => nodeType in metadata,
        providerConfigured
      }),
    [metadata, plan, providerConfigured]
  );

  const updateStep = useCallback(
    (id: string, patch: Partial<WorkflowSetupPlan["steps"][number]>) => {
      onPlanChange({
        ...plan,
        steps: plan.steps.map((step) =>
          step.id === id ? { ...step, ...patch } : step
        )
      });
    },
    [onPlanChange, plan]
  );

  const moveStep = useCallback(
    (index: number, delta: number) => {
      const target = index + delta;
      if (target < 0 || target >= plan.steps.length) {
        return;
      }
      const steps = [...plan.steps];
      const [moved] = steps.splice(index, 1);
      steps.splice(target, 0, moved);
      onPlanChange({ ...plan, steps });
    },
    [onPlanChange, plan]
  );

  const removeStep = useCallback(
    (id: string) => {
      onPlanChange({
        ...plan,
        steps: plan.steps.filter((step) => step.id !== id)
      });
    },
    [onPlanChange, plan]
  );

  const addStep = useCallback(() => {
    onPlanChange({
      ...plan,
      steps: [
        ...plan.steps,
        {
          id: `step-${plan.steps.length + 1}-${Date.now()}`,
          title: "New step",
          summary: "",
          node_type: null
        }
      ]
    });
  }, [onPlanChange, plan]);

  const ioSections = useMemo<PlanReviewSection[]>(
    () => [
      {
        id: "inputs",
        header: "Inputs",
        subheader: "What the workflow is given when it runs.",
        rows: plan.inputs.map((input, index) => ({
          id: `input-${index}`,
          label: `${input.name} (${input.type})`,
          value: String(input.sample ?? ""),
          placeholder: "Sample value",
          onChange: (value: string) =>
            onPlanChange({
              ...plan,
              inputs: plan.inputs.map((entry, position) =>
                position === index ? { ...entry, sample: value } : entry
              )
            })
        }))
      },
      {
        id: "outputs",
        header: "Outputs",
        subheader: "What it hands back.",
        rows: plan.outputs.map((output, index) => ({
          id: `output-${index}`,
          label: `Output ${index + 1}`,
          value: output.name,
          onChange: (value: string) =>
            onPlanChange({
              ...plan,
              outputs: plan.outputs.map((entry, position) =>
                position === index ? { ...entry, name: value } : entry
              )
            })
        }))
      }
    ],
    [onPlanChange, plan]
  );

  return (
    <FlexColumn gap={GAP.spacious}>
      <FlexColumn gap={GAP.tight}>
        <Text size="big" component="h2">
          Your plan
        </Text>
        <Text size="normal" color="secondary">
          Edit anything here. Nothing is built until you continue.
        </Text>
      </FlexColumn>

      {error ? (
        <AlertBanner severity="error" role="alert">
          {error}
        </AlertBanner>
      ) : null}

      <FlexColumn gap={GAP.comfortable} component="ol" sx={{ listStyle: "none", m: 0, p: 0 }}>
        {resolved.steps.map((entry, index) => (
          <Box component="li" key={entry.step.id}>
            <StepRow
              entry={entry}
              index={index}
              stepCount={plan.steps.length}
              nodeTypeOptions={nodeTypeOptions}
              onChange={updateStep}
              onMove={moveStep}
              onRemove={removeStep}
            />
          </Box>
        ))}
      </FlexColumn>

      <FlexRow gap={GAP.normal}>
        <EditorButton variant="outlined" onClick={addStep}>
          Add a step
        </EditorButton>
      </FlexRow>

      <PlanReview
        sections={ioSections}
        replanLabel="Re-plan"
        onReplan={onReplan}
        replanPending={replanPending}
      />
    </FlexColumn>
  );
};

interface StepRowProps {
  entry: ResolvedWorkflowStep;
  index: number;
  stepCount: number;
  nodeTypeOptions: AutocompleteOption[];
  onChange: (
    id: string,
    patch: Partial<WorkflowSetupPlan["steps"][number]>
  ) => void;
  onMove: (index: number, delta: number) => void;
  onRemove: (id: string) => void;
}

const StepRow: React.FC<StepRowProps> = ({
  entry,
  index,
  stepCount,
  nodeTypeOptions,
  onChange,
  onMove,
  onRemove
}) => {
  const { step } = entry;
  const missingRole = entry.missingProvider;
  return (
    <FlexColumn gap={GAP.normal}>
      <FlexRow gap={GAP.normal} align="center" justify="space-between">
        <Text size="normal" component="h3">
          {`${index + 1}. ${step.title}`}
        </Text>
        <FlexRow gap={GAP.tight}>
          <EditorButton
            variant="text"
            onClick={() => onMove(index, -1)}
            disabled={index === 0}
            aria-label={`Move step ${index + 1} up`}
          >
            Up
          </EditorButton>
          <EditorButton
            variant="text"
            onClick={() => onMove(index, 1)}
            disabled={index === stepCount - 1}
            aria-label={`Move step ${index + 1} down`}
          >
            Down
          </EditorButton>
          <EditorButton
            variant="text"
            onClick={() => onRemove(step.id)}
            aria-label={`Remove step ${index + 1}`}
          >
            Remove
          </EditorButton>
        </FlexRow>
      </FlexRow>

      <TextInput
        label={`Step ${index + 1} title`}
        value={step.title}
        onChange={(event) => onChange(step.id, { title: event.target.value })}
      />
      <TextInput
        label={`Step ${index + 1} description`}
        value={step.summary}
        multiline
        onChange={(event) => onChange(step.id, { summary: event.target.value })}
      />

      {entry.unknownNodeType ? (
        <AlertBanner severity="error" title="No node for this step">
          <FlexColumn gap={GAP.normal}>
            <Caption component="span">
              {step.node_type === null
                ? "The plan could not name a node for this step. Pick one."
                : `"${step.node_type}" is not a node type this install has. Pick one.`}
            </Caption>
            <Autocomplete
              options={nodeTypeOptions}
              label={`Node type for step ${index + 1}`}
              placeholder="Search node types"
              onChange={(_event, value) =>
                onChange(step.id, {
                  node_type:
                    value === null
                      ? null
                      : (value as AutocompleteOption).value
                })
              }
            />
          </FlexColumn>
        </AlertBanner>
      ) : (
        <Caption color="secondary" component="p">
          {step.node_type}
        </Caption>
      )}

      {missingRole !== null ? (
        <AlertBanner
          severity="warning"
          title={`No ${missingRole} provider connected`}
          action={
            <EditorButton
              variant="text"
              onClick={() =>
                openProviderOnboarding({
                  capability: MODEL_ROLE_ONBOARDING[missingRole],
                  reason: `Step ${index + 1} needs a ${missingRole} model.`
                })
              }
            >
              Connect
            </EditorButton>
          }
        >
          <Caption component="span">
            {`This step runs on a ${missingRole} model. Connect a provider that offers one.`}
          </Caption>
        </AlertBanner>
      ) : null}
    </FlexColumn>
  );
};

export const WorkflowReviewStep = memo(ReviewStepInternal);
WorkflowReviewStep.displayName = "WorkflowReviewStep";

export default WorkflowReviewStep;
