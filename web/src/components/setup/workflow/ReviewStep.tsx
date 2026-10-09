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
 * while either marker is up (criterion 4). Above the steps, a warning lists
 * what would still make the built workflow fail — the planner's repair rounds
 * ran out, or an edit here broke the wiring or a Code step's body. Nothing here places a node or spends
 * anything; the one model call it can make is `Re-plan`.
 */

import React, { memo, useCallback, useMemo, useState } from "react";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import type { WorkflowSetupPlan } from "@nodetool-ai/protocol/api-schemas/workflows.js";
import {
  checkWorkflowPlan,
  planNodeShape,
  resolveWorkflowPlan
} from "@nodetool-ai/protocol";
import { plannedCodeStepProblems } from "@nodetool-ai/node-sdk/code-analysis";
import type { ResolvedWorkflowStep } from "@nodetool-ai/protocol";

import {
  AlertBanner,
  Autocomplete,
  Box,
  Caption,
  CONTROL,
  EditorButton,
  FlexColumn,
  FlexRow,
  GAP,
  LoadingSpinner,
  MOTION,
  Text,
  TextInput,
  TextLink,
  ThinkingIndicator,
  ToolbarIconButton,
  reducedMotion
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
  /**
   * Stops a running `Re-plan`. The plan on screen stays, and so does
   * `Continue to setup`.
   */
  onCancelReplan?: () => void;
  /** True when a configured provider covers this model role. */
  providerConfigured: (role: string) => boolean;
  /**
   * True while the providers' model list for this role is still being read.
   * A role reads as uncovered meanwhile, which is not a reason to connect one.
   */
  roleLoading?: (role: string) => boolean;
  /** The reason the last plan run was refused, if it was. */
  error?: string | null;
}

const ReviewStepInternal: React.FC<WorkflowReviewStepProps> = ({
  plan,
  onPlanChange,
  onReplan,
  replanPending = false,
  onCancelReplan,
  providerConfigured,
  roleLoading = () => false,
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
      missingProviders: resolved.missingRoles.filter(
        (role) => !roleLoading(role)
      ),
      loadingRoles: resolved.missingRoles.filter(roleLoading)
    }),
    [resolved.missingRoles, resolved.steps, roleLoading]
  );

  // A step with no real node already carries its own marker; the run-time
  // check only means something once every step names one.
  const planProblems = useMemo(
    () =>
      blocked.unknownNodeTypes > 0
        ? []
        : checkWorkflowPlan(plan, {
            lookup: (nodeType) => {
              const meta = metadata[nodeType];
              return meta ? planNodeShape(meta) : null;
            },
            checkCode: plannedCodeStepProblems
          }),
    [blocked.unknownNodeTypes, metadata, plan]
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
          readOnly: replanPending,
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
    [onPlanChange, plan, replanPending]
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

      {replanPending ? (
        <FlexRow gap={GAP.normal} align="center" wrap>
          <ThinkingIndicator label="Re-planning the steps" announce />
          {onCancelReplan ? (
            <EditorButton variant="text" onClick={onCancelReplan}>
              Stop re-planning
            </EditorButton>
          ) : null}
        </FlexRow>
      ) : null}

      {error ? (
        <AlertBanner severity="error" role="alert">
          {error}
        </AlertBanner>
      ) : null}

      {planProblems.length > 0 ? (
        <AlertBanner
          severity="warning"
          title="This plan would fail when it runs"
          action={
            <EditorButton
              variant="text"
              onClick={onReplan}
              disabled={replanPending}
            >
              Re-plan
            </EditorButton>
          }
        >
          <FlexColumn gap={GAP.tight}>
            {planProblems.map((problem) => (
              <Caption component="span" key={problem}>
                {problem}
              </Caption>
            ))}
          </FlexColumn>
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

      {blocked.loadingRoles.length > 0 ? (
        <FlexRow gap={GAP.normal} align="center">
          <LoadingSpinner size="small" />
          <Caption color="secondary" component="span">
            {`Reading the ${blocked.loadingRoles.join(" and ")} models your providers offer…`}
          </Caption>
        </FlexRow>
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
              readOnly={replanPending}
              roleLoading={roleLoading}
            />
          </Box>
        ))}
      </FlexColumn>

      <FlexRow gap={GAP.normal}>
        <EditorButton
          variant="outlined"
          onClick={addStep}
          disabled={replanPending}
        >
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
  /**
   * Held while a re-plan runs. Its answer replaces the whole plan, so an edit
   * made meanwhile would be written and then silently overwritten.
   */
  readOnly: boolean;
  roleLoading: (role: string) => boolean;
}

const StepRow: React.FC<StepRowProps> = ({
  entry,
  index,
  stepCount,
  nodeTypeOptions,
  onChange,
  onMove,
  onRemove,
  readOnly,
  roleLoading
}) => {
  const { step } = entry;
  // A role whose models are still being read has its own line above.
  const missingRole =
    entry.missingProvider !== null && !roleLoading(entry.missingProvider)
      ? entry.missingProvider
      : null;
  const [picking, setPicking] = useState(false);
  const pickNodeType = (value: unknown): void => {
    onChange(step.id, {
      node_type: value === null ? null : (value as AutocompleteOption).value
    });
    setPicking(false);
  };
  return (
    // The number sits in a column of its own, so the title, the description
    // and the node line all start on the same edge whatever the digit count.
    <FlexRow gap={GAP.comfortable} align="flex-start">
      <FlexRow
        align="center"
        justify="center"
        sx={{
          flexShrink: 0,
          width: CONTROL.height.xs,
          height: CONTROL.height.sm
        }}
      >
        <Text
          size="normal"
          color="secondary"
          sx={{ fontVariantNumeric: "tabular-nums" }}
        >
          {`${index + 1}`}
        </Text>
      </FlexRow>

      <FlexColumn gap={GAP.normal} sx={{ flex: 1, minWidth: 0 }}>
        {/* The title is the field that edits it. A heading that repeated the
            title above the field that holds it made every step read twice. */}
        <FlexRow gap={GAP.normal} align="center">
          <Box
            sx={{
              ...EDITABLE_FIELD,
              flex: 1,
              minWidth: 0,
              "& .MuiInputBase-input": { fontWeight: 500 }
            }}
          >
            <TextInput
              compact
              label={`Step ${index + 1} title`}
              hideLabel
              value={step.title}
              disabled={readOnly}
              onChange={(event) =>
                onChange(step.id, { title: event.target.value })
              }
            />
          </Box>
          <FlexRow gap={GAP.micro}>
            <ToolbarIconButton
              size="small"
              icon={<ArrowUpwardIcon fontSize="inherit" />}
              tooltip={readOnly || index === 0 ? "" : "Move up"}
              onClick={() => onMove(index, -1)}
              disabled={readOnly || index === 0}
              aria-label={`Move step ${index + 1} up`}
            />
            <ToolbarIconButton
              size="small"
              icon={<ArrowDownwardIcon fontSize="inherit" />}
              tooltip={readOnly || index === stepCount - 1 ? "" : "Move down"}
              onClick={() => onMove(index, 1)}
              disabled={readOnly || index === stepCount - 1}
              aria-label={`Move step ${index + 1} down`}
            />
            <ToolbarIconButton
              size="small"
              icon={<DeleteOutlineIcon fontSize="inherit" />}
              tooltip={readOnly ? "" : "Remove step"}
              onClick={() => onRemove(step.id)}
              disabled={readOnly}
              aria-label={`Remove step ${index + 1}`}
            />
          </FlexRow>
        </FlexRow>

        <Box sx={EDITABLE_FIELD}>
          <TextInput
            compact
            label={`Step ${index + 1} description`}
            hideLabel
            placeholder="What this step does"
            value={step.summary}
            disabled={readOnly}
            multiline
            minRows={2}
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
                disabled={readOnly}
                onChange={(_event, value) => pickNodeType(value)}
              />
            </FlexColumn>
          </AlertBanner>
        ) : (
          <FlexColumn gap={GAP.tight}>
            {/* The node type is its own change control: quiet at rest, so the
                line reads as information, and a link under the pointer, on
                keyboard focus, and while the picker it opened is showing. */}
            <Caption component="span">
              <TextLink
                asButton
                aria-expanded={picking}
                aria-label={`Change node: ${step.node_type ?? ""}`}
                aria-disabled={readOnly || undefined}
                onClick={() => {
                  if (!readOnly) {
                    setPicking(!picking);
                  }
                }}
                sx={{
                  color: picking ? "primary.main" : "text.disabled",
                  textDecoration: picking ? "underline" : "none",
                  transition: MOTION.all,
                  ...reducedMotion({ transition: MOTION.none }),
                  "&:hover, &:focus-visible": {
                    color: "primary.main",
                    textDecoration: "underline"
                  }
                }}
              >
                {step.node_type}
              </TextLink>
            </Caption>
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
                disabled={readOnly}
                onChange={(_event, value) => pickNodeType(value)}
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
    </FlexRow>
  );
};

export const WorkflowReviewStep = memo(ReviewStepInternal);
WorkflowReviewStep.displayName = "WorkflowReviewStep";

export default WorkflowReviewStep;
