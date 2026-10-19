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

import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { useTranslation } from "react-i18next";
import AddIcon from "@mui/icons-material/AddOutlined";
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
  FieldDensityContext,
  FlexColumn,
  FlexRow,
  GAP,
  LoadingSpinner,
  MOTION,
  SPACING,
  Text,
  TextArea,
  TextInput,
  TextLink,
  ThinkingIndicator,
  ToolbarIconButton,
  reducedMotion
} from "../../ui_primitives";
import type { AutocompleteOption } from "../../ui_primitives";
import useMetadataStore from "../../../stores/MetadataStore";
import { openProviderOnboarding } from "../../../stores/ProviderOnboardingStore";
import ReportBugButton from "../../support/ReportBugButton";
import { PlanReview, PlanReviewHeading } from "../PlanReview";
import { REVIEW_BLOCK, REVIEW_CONTENT_WIDTH } from "../reviewStyles";
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
  const { t } = useTranslation();
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

  // The removed row takes its button with it, so the keyboard moves to the
  // row that took its place, or to "Add a step" when none is left.
  const rootRef = useRef<HTMLDivElement>(null);
  const addStepRef = useRef<HTMLButtonElement>(null);
  const focusAfterRemoveRef = useRef<number | null>(null);
  useEffect(() => {
    const removedAt = focusAfterRemoveRef.current;
    if (removedAt === null) {
      return;
    }
    focusAfterRemoveRef.current = null;
    const target = Math.min(removedAt, plan.steps.length - 1);
    const next =
      target >= 0
        ? rootRef.current?.querySelector<HTMLElement>(
            `button[aria-label="${t("pass3_14.workflowSetup.review.deleteStepAriaLabel", { step: target + 1 })}"]`
          )
        : null;
    (next ?? addStepRef.current)?.focus();
  }, [plan.steps.length, t]);

  const removeStep = useCallback(
    (id: string) => {
      focusAfterRemoveRef.current = plan.steps.findIndex(
        (step) => step.id === id
      );
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
          title: t("pass3_14.workflowSetup.review.newStepTitle"),
          summary: "",
          node_type: null
        }
      ]
    });
  }, [onPlanChange, plan, t]);

  // Inputs first, then the steps, then what comes out — the order the workflow
  // itself runs in (F32). The sample values are shown here and edited on the
  // setup step, which is where the PRD puts them (§ 11.3): one editable place,
  // one read-only summary, so the same field is not asked for twice.
  const inputSections = useMemo<PlanReviewSection[]>(
    () => [
      {
        id: "inputs",
        header: t("pass3_14.workflowSetup.review.inputsHeader"),
        subheader: t("pass3_14.workflowSetup.review.inputsDescription"),
        rows: plan.inputs.map((input, index) => ({
          id: `input-${index}`,
          label: `${input.name} (${input.type})`,
          value: String(input.sample ?? ""),
          placeholder: t("pass3_14.workflowSetup.review.noSamplePlaceholder"),
          // A CSV or a list sample keeps its lines. On one line its rows ran
          // together: "product,settingceramic mug,…".
          multiline: String(input.sample ?? "").includes("\n"),
          readOnly: true,
          onChange: () => undefined
        }))
      }
    ],
    [plan.inputs, t]
  );

  const outputSections = useMemo<PlanReviewSection[]>(
    () => [
      {
        id: "outputs",
        header: t("pass3_14.workflowSetup.review.outputsHeader"),
        subheader: t("pass3_14.workflowSetup.review.outputsDescription"),
        rows: plan.outputs.map((output, index) => ({
          id: `output-${index}`,
          label: t("pass3_14.workflowSetup.review.outputLabel", {
            output: index + 1
          }),
          // One output needs no number. The section heading names it.
          hideLabel: plan.outputs.length === 1,
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
    [onPlanChange, plan, replanPending, t]
  );

  return (
    // The review is read far more than it is typed into, so its fields take
    // the quiet compact look: still boxed, so they read as editable, but at
    // control size on the page surface rather than as a stack of form fields.
    <FieldDensityContext.Provider value="compact">
      <FlexColumn
        ref={rootRef}
        gap={GAP.spacious}
        sx={{ width: "100%", maxWidth: REVIEW_CONTENT_WIDTH }}
      >
        {/* Re-plan replaces the whole plan, so it sits with the plan's heading,
          not under the last section. */}
        <FlexRow gap={GAP.normal} align="flex-start" justify="space-between">
          <FlexColumn gap={GAP.tight} sx={{ minWidth: 0 }}>
            <Text size="big" component="h2">
              {t("pass3_14.workflowSetup.review.title")}
            </Text>
            <Text size="normal" color="secondary">
              {t("pass3_14.workflowSetup.review.description")}
            </Text>
          </FlexColumn>
          <EditorButton
            variant="outlined"
            onClick={onReplan}
            disabled={replanPending}
            sx={{ flexShrink: 0 }}
          >
            {t("pass3_14.workflowSetup.review.replan")}
          </EditorButton>
        </FlexRow>

        {replanPending ? (
          <FlexRow gap={GAP.normal} align="center" wrap>
            <ThinkingIndicator
              label={t("pass3_14.workflowSetup.review.replanning")}
              announce
            />
            {onCancelReplan ? (
              <EditorButton variant="text" onClick={onCancelReplan}>
                {t("pass3_14.workflowSetup.review.stopReplanning")}
              </EditorButton>
            ) : null}
          </FlexRow>
        ) : null}

        {error ? (
          <AlertBanner
            severity="error"
            role="alert"
            action={
              <ReportBugButton
                context={{
                  source: "provider-call",
                  summary: t("pass3_14.workflowSetup.review.replanFailed"),
                  errorText: error
                }}
              />
            }
          >
            {error}
          </AlertBanner>
        ) : null}

        {planProblems.length > 0 ? (
          <AlertBanner
            severity="warning"
            title={t("pass3_14.workflowSetup.review.planWouldFail")}
            action={
              <EditorButton
                variant="text"
                onClick={onReplan}
                disabled={replanPending}
              >
                {t("pass3_14.workflowSetup.review.replan")}
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
            {t("pass3_14.workflowSetup.review.unknownNodeTypes", {
              count: blocked.unknownNodeTypes
            })}
          </Caption>
        ) : null}

        {blocked.missingProviders.length > 0 ? (
          <Caption color="secondary" component="p">
            {t("pass3_14.workflowSetup.review.missingProviders", {
              roles: blocked.missingProviders.join(" or a ")
            })}
          </Caption>
        ) : null}

        {blocked.loadingRoles.length > 0 ? (
          <FlexRow gap={GAP.normal} align="center">
            <LoadingSpinner size="small" />
            <Caption color="secondary" component="span">
              {t("pass3_14.workflowSetup.review.loadingRoles", {
                roles: blocked.loadingRoles.join(" and ")
              })}
            </Caption>
          </FlexRow>
        ) : null}

        {plan.inputs.length > 0 ? (
          <PlanReview sections={inputSections} />
        ) : null}

        <FlexColumn gap={GAP.compact} component="section">
          <PlanReviewHeading
            header={t("pass3_14.workflowSetup.review.stepsHeader")}
            subheader={t("pass3_14.workflowSetup.review.stepsDescription")}
          />
          {/* The blocks need air between them: the left rule says where a step
          ends only if the next one does not start against it. */}
          <FlexColumn
            gap={GAP.normal}
            component="ol"
            sx={{
              listStyle: "none",
              m: 0,
              p: 0,
              "& li": { listStyle: "none" }
            }}
          >
            {resolved.steps.map((entry, index) => (
              <Box component="li" key={entry.step.id} sx={REVIEW_BLOCK}>
                <StepRow
                  entry={entry}
                  nodeTitle={
                    entry.step.node_type
                      ? (metadata[entry.step.node_type]?.title ?? null)
                      : null
                  }
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

          {/* The next step goes where the list ends, drawn as the outline of one. */}
          <EditorButton
            ref={addStepRef}
            variant="outlined"
            fullWidth
            startIcon={<AddIcon />}
            onClick={addStep}
            disabled={replanPending}
            sx={{
              borderStyle: "dashed",
              justifyContent: "flex-start",
              color: "text.secondary",
              borderColor: "divider",
              "&:hover": { borderStyle: "dashed", borderColor: "text.disabled" }
            }}
          >
            {t("pass3_14.workflowSetup.review.addStep")}
          </EditorButton>
        </FlexColumn>

        <PlanReview sections={outputSections} />
      </FlexColumn>
    </FieldDensityContext.Provider>
  );
};

interface StepRowProps {
  entry: ResolvedWorkflowStep;
  /** The node's display name from the registry, e.g. "Code". */
  nodeTitle: string | null;
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
  nodeTitle,
  index,
  stepCount,
  nodeTypeOptions,
  onChange,
  onMove,
  onRemove,
  readOnly,
  roleLoading
}) => {
  const { t } = useTranslation();
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

      <FlexColumn gap={GAP.comfortable} sx={{ flex: 1, minWidth: 0 }}>
        {/* The title is the field that edits it. A heading that repeated the
            title above the field that holds it made every step read twice. */}
        <FlexRow gap={GAP.normal} align="center">
          {/* The title is the step's name, so it carries the weight the
              description does not. */}
          <Box
            sx={{
              flex: 1,
              minWidth: 0,
              "& .MuiInputBase-input": { fontWeight: 500 }
            }}
          >
            <TextInput
              compact
              label={t("pass3_14.workflowSetup.review.stepTitleLabel", {
                step: index + 1
              })}
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
              tooltip={
                readOnly || index === 0
                  ? ""
                  : t("pass3_14.workflowSetup.review.moveUp")
              }
              onClick={() => onMove(index, -1)}
              disabled={readOnly || index === 0}
              aria-label={t(
                "pass3_14.workflowSetup.review.moveStepUpAriaLabel",
                {
                  step: index + 1
                }
              )}
            />
            <ToolbarIconButton
              size="small"
              icon={<ArrowDownwardIcon fontSize="inherit" />}
              tooltip={
                readOnly || index === stepCount - 1
                  ? ""
                  : t("pass3_14.workflowSetup.review.moveDown")
              }
              onClick={() => onMove(index, 1)}
              disabled={readOnly || index === stepCount - 1}
              aria-label={t(
                "pass3_14.workflowSetup.review.moveStepDownAriaLabel",
                {
                  step: index + 1
                }
              )}
            />
            <ToolbarIconButton
              size="small"
              icon={<DeleteOutlineIcon fontSize="inherit" />}
              tooltip={
                readOnly ? "" : t("pass3_14.workflowSetup.review.deleteStep")
              }
              onClick={() => onRemove(step.id)}
              disabled={readOnly}
              aria-label={t(
                "pass3_14.workflowSetup.review.deleteStepAriaLabel",
                {
                  step: index + 1
                }
              )}
            />
          </FlexRow>
        </FlexRow>

        <TextArea
          compact
          label={t("pass3_14.workflowSetup.review.stepDescriptionLabel", {
            step: index + 1
          })}
          hideLabel
          placeholder={t(
            "pass3_14.workflowSetup.review.stepDescriptionPlaceholder"
          )}
          value={step.summary}
          disabled={readOnly}
          minRows={1}
          onChange={(value) => onChange(step.id, { summary: value })}
        />

        {entry.unknownNodeType ? (
          <AlertBanner
            severity="error"
            title={t("pass3_14.workflowSetup.review.noNodeTitle")}
          >
            <FlexColumn gap={GAP.normal}>
              <Caption component="span">
                {step.node_type === null
                  ? t("pass3_14.workflowSetup.review.unnamedNodeError")
                  : t("pass3_14.workflowSetup.review.unknownNodeError", {
                      nodeType: step.node_type
                    })}
              </Caption>
              <Autocomplete
                options={nodeTypeOptions}
                label={t("pass3_14.workflowSetup.review.nodeTypeLabel", {
                  step: index + 1
                })}
                placeholder={t("pass3_14.workflowSetup.review.searchNodeTypes")}
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
                aria-label={t(
                  "pass3_14.workflowSetup.review.changeNodeAriaLabel",
                  {
                    nodeType: step.node_type ?? ""
                  }
                )}
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
                  },
                  "&:hover span, &:focus-visible span": { color: "inherit" }
                }}
              >
                {/* The name says what the step runs; the type id stays for the
                    creator who knows the registry. */}
                {nodeTitle ? (
                  <Box
                    component="span"
                    sx={{ color: "text.secondary", mr: SPACING.md }}
                  >
                    {nodeTitle}
                  </Box>
                ) : null}
                <span>{step.node_type}</span>
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
                label={t("pass3_14.workflowSetup.review.nodeTypeLabel", {
                  step: index + 1
                })}
                placeholder={t("pass3_14.workflowSetup.review.searchNodeTypes")}
                disabled={readOnly}
                onChange={(_event, value) => pickNodeType(value)}
              />
            ) : null}
          </FlexColumn>
        )}

        {missingRole !== null ? (
          <AlertBanner
            severity="warning"
            title={t("pass3_14.workflowSetup.review.noRoleProviderTitle", {
              role: missingRole
            })}
            action={
              <EditorButton
                variant="text"
                onClick={() =>
                  openProviderOnboarding({
                    capability: MODEL_ROLE_ONBOARDING[missingRole],
                    reason: t(
                      "pass3_14.workflowSetup.review.missingRoleReason",
                      {
                        step: index + 1,
                        role: missingRole
                      }
                    )
                  })
                }
              >
                {t("pass3_14.workflowSetup.review.connect")}
              </EditorButton>
            }
          >
            <Caption component="span">
              {t("pass3_14.workflowSetup.review.missingRoleDescription", {
                role: missingRole
              })}
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
