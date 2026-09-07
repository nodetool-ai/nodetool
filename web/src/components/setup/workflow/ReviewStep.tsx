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

import React, { memo, useCallback, useMemo, useState } from "react";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import type { WorkflowSetupPlan } from "@nodetool-ai/protocol/api-schemas/workflows.js";
import { resolveWorkflowPlan } from "@nodetool-ai/protocol";
import type { ResolvedWorkflowStep } from "@nodetool-ai/protocol";

import {
  AlertBanner,
  Autocomplete,
  Box,
  Caption,
  Chip,
  EditorButton,
  FlexColumn,
  FlexRow,
  GAP,
  Text,
  TextInput,
  ToolbarIconButton
} from "../../ui_primitives";
import type { AutocompleteOption } from "../../ui_primitives";
import useMetadataStore from "../../../stores/MetadataStore";
import { openProviderOnboarding } from "../../../stores/ProviderOnboardingStore";
import { PlanReview } from "../PlanReview";
import {
  EDITABLE_FIELD,
  REVIEW_BLOCK,
  REVIEW_CONTENT_WIDTH
} from "../reviewStyles";
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

  // Why `Continue to setup` is held. The button belongs to the shell, and a
  // marker can sit a screen's worth of scroll above it. The two blocks are
  // counted apart because their remedies are different: an unknown node type is
  // fixed here with the search field, a missing provider by connecting one
  // (D23). Calling both "missing nodes" sent creators looking for the wrong fix.
  const blocked = useMemo(
    () => ({
      unknownNodeTypes: resolved.steps.filter((entry) => entry.unknownNodeType)
        .length,
      missingProviders: resolved.missingRoles
    }),
    [resolved.missingRoles, resolved.steps]
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

  // Inputs first, then the steps, then what comes out — the order the workflow
  // itself runs in (F32). The sample values are shown here and edited on the
  // setup step, which is where the PRD puts them (§ 11.3): one editable place,
  // one read-only summary, so the same field is not asked for twice.
  const inputSections = useMemo<PlanReviewSection[]>(
    () => [
      {
        id: "inputs",
        header: "Inputs",
        subheader:
          "What the workflow is given when it runs. You set the sample values on the next step.",
        rows: plan.inputs.map((input, index) => ({
          id: `input-${index}`,
          label: `${input.name} (${input.type})`,
          value: String(input.sample ?? ""),
          placeholder: "No sample yet",
          readOnly: true,
          onChange: () => undefined
        }))
      }
    ],
    [plan.inputs]
  );

  const outputSections = useMemo<PlanReviewSection[]>(
    () => [
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
    <FlexColumn
      gap={GAP.spacious}
      sx={{ width: "100%", maxWidth: REVIEW_CONTENT_WIDTH }}
    >
      <FlexColumn gap={GAP.tight}>
        <Text size="big" component="h2">
          Your plan
        </Text>
        <Text size="normal" color="secondary">
          Review this plan, then choose models before building.
        </Text>
      </FlexColumn>

      {error ? (
        <AlertBanner severity="error" role="alert">
          {error}
        </AlertBanner>
      ) : null}

      {blocked.unknownNodeTypes > 0 ? (
        <Caption color="secondary" component="p">
          {blocked.unknownNodeTypes === 1
            ? "1 step names no node this install has. Pick one below to continue."
            : `${blocked.unknownNodeTypes} steps name no node this install has. Pick one for each below to continue.`}
        </Caption>
      ) : null}

      {blocked.missingProviders.length > 0 ? (
        <Caption color="secondary" component="p">
          {`No connected provider offers a ${blocked.missingProviders.join(" or a ")} model. Connect one below to continue.`}
        </Caption>
      ) : null}

      {plan.inputs.length > 0 ? <PlanReview sections={inputSections} /> : null}

      {/* The blocks need air between them: the left rule says where a step
          ends only if the next one does not start against it. */}
      <FlexColumn
        gap={GAP.spacious}
        component="ol"
        sx={{ listStyle: "none", m: 0, p: 0, "& li": { listStyle: "none" } }}
      >
        {resolved.steps.map((entry, index) => (
          <Box component="li" key={entry.step.id} sx={REVIEW_BLOCK}>
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
        sections={outputSections}
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
  const [picking, setPicking] = useState(false);
  return (
    <FlexColumn gap={GAP.normal}>
      {/* One row for the step's head: the number, the title as the field that
          edits it, and the actions. A heading that repeated the title above
          the field that holds it made every step read twice. */}
      <FlexRow gap={GAP.normal} align="center">
        <Text size="normal" color="secondary">
          {`${index + 1}`}
        </Text>
        <Box sx={{ ...EDITABLE_FIELD, flex: 1, minWidth: 0 }}>
          <TextInput
            label={`Step ${index + 1} title`}
            hideLabel
            value={step.title}
            onChange={(event) =>
              onChange(step.id, { title: event.target.value })
            }
          />
        </Box>
        <FlexRow gap={GAP.tight}>
          <ToolbarIconButton
            size="small"
            icon={<ArrowUpwardIcon fontSize="inherit" />}
            tooltip={index === 0 ? "" : "Move up"}
            onClick={() => onMove(index, -1)}
            disabled={index === 0}
            aria-label={`Move step ${index + 1} up`}
          />
          <ToolbarIconButton
            size="small"
            icon={<ArrowDownwardIcon fontSize="inherit" />}
            tooltip={index === stepCount - 1 ? "" : "Move down"}
            onClick={() => onMove(index, 1)}
            disabled={index === stepCount - 1}
            aria-label={`Move step ${index + 1} down`}
          />
          <ToolbarIconButton
            size="small"
            color="error"
            icon={<DeleteOutlineIcon fontSize="inherit" />}
            tooltip="Remove step"
            onClick={() => onRemove(step.id)}
            aria-label={`Remove step ${index + 1}`}
          />
        </FlexRow>
      </FlexRow>

      <Box sx={EDITABLE_FIELD}>
        <TextInput
          label={`Step ${index + 1} description`}
          hideLabel
          placeholder="What this step does"
          value={step.summary}
          multiline
          onChange={(event) =>
            onChange(step.id, { summary: event.target.value })
          }
        />
      </Box>

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
        <FlexColumn gap={GAP.tight}>
          <FlexRow gap={GAP.tight} align="center">
            <Caption color="secondary" component="span">
              Builds
            </Caption>
            <Chip compact color="success" label={step.node_type ?? ""} />
            <EditorButton variant="text" onClick={() => setPicking(!picking)}>
              {picking ? "Keep it" : "Change"}
            </EditorButton>
          </FlexRow>
          {/* The plan names a node the registry has — but not always the one
              the step meant, because a step the planner left unnamed is
              matched by search. So every step's node stays changeable, not
              only the ones with no node at all. */}
          {picking ? (
            <Autocomplete
              options={nodeTypeOptions}
              value={
                nodeTypeOptions.find(
                  (option) => option.value === step.node_type
                ) ?? null
              }
              label={`Node type for step ${index + 1}`}
              placeholder="Search node types"
              onChange={(_event, value) =>
                onChange(step.id, {
                  node_type:
                    value === null ? null : (value as AutocompleteOption).value
                })
              }
            />
          ) : null}
        </FlexColumn>
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
