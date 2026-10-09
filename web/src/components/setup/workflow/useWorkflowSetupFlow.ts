/**
 * The Workflow flow's config: the one place that maps a workflow's
 * `settings.setup.stage` onto a step (PRD § 11.1–11.4, D19).
 *
 * Everything the flow needs is on the workflow, so any host builds the same
 * four steps from a workflow id and resumes where the creator left off
 * (criterion 2). `done` maps to no step: the workflow belongs to the editor
 * from there on (D3).
 *
 * The one rule the shell enforces for this flow is criterion 4 — `Continue to
 * setup` stays disabled while any step names a node type the registry does not
 * have, or needs a model role no configured provider covers (D23). That is
 * `canAdvance` on the review step, and it is read from the live registry every
 * render, so connecting a provider in the amber marker's dialog unblocks the
 * button without a reload.
 */

import { createElement, useCallback, useMemo, useRef, useState } from "react";
import {
  planInputSample,
  resolveWorkflowPlan,
  WORKFLOW_INSPIRATION_CHIPS,
  WORKFLOW_PLAN_MAX_ROUNDS
} from "@nodetool-ai/protocol";
import type {
  WorkflowSetupPlan,
  WorkflowSetupRunMode,
  WorkflowSetupStage
} from "@nodetool-ai/protocol/api-schemas/workflows.js";

import useMetadataStore from "../../../stores/MetadataStore";
import type { Workflow } from "../../../stores/ApiTypes";
import {
  reportSetupSaveError,
  useWorkflowSetupDocument,
  useWorkflowSetupStage,
  useWorkflowSetupWriter
} from "../../../hooks/workflow/useWorkflowSetup";
import { usePlanWorkflow } from "../../../hooks/workflow/usePlanWorkflow";
import {
  useBuildFromPlan,
  type BuildFromPlanResult
} from "../../../hooks/workflow/useBuildFromPlan";
import type { SetupFlowConfig, SetupStep } from "../types";
import { defaultRunModeFor } from "./categories";
import {
  planSourceMatches,
  readPlanSource,
  readRoleModels,
  ROLE_MODELS_KEY
} from "./setupExtras";
import {
  PlannerModelFooterField,
  WorkflowCategoryStep
} from "./CategoryStep";
import { WorkflowIdeaStep } from "./IdeaStep";
import { WorkflowReviewStep } from "./ReviewStep";
import { WorkflowSetupStep } from "./SetupStep";
import type { ModelRoleAvailability, ModelRoleChoices } from "./SetupStep";

const FLOW_LABELS = { title: "Workflow" } as const;

/** One planner call's output allowance. */
const PLANNER_MAX_OUTPUT_TOKENS = 4096;

/** An empty plan, so the review step renders before a planner ever ran. */
const EMPTY_PLAN: WorkflowSetupPlan = { inputs: [], steps: [], outputs: [] };

export interface WorkflowSetupFlowOptions {
  workflowId: string;
  /**
   * The planner's model until the creator picks one — the first language model
   * a configured provider offers. Null means no provider offers one, and the
   * flow falls back to a pinned plan.
   */
  defaultPlannerModel: { provider: string; id: string } | null;
  /** True when a configured provider covers this model role (D23). */
  providerConfigured: (role: string) => boolean;
  /** What the configured providers offer per role, for step 3's tile rows. */
  modelChoices: (role: string) => ModelRoleAvailability;
  /** The model object the build assigns for a role's chosen tile. */
  chosenModel: (role: string, tileId: string | null) => unknown;
  /**
   * Copies the example the creator picked in step 1's inline browser
   * (PRD § 11.1). Resolves the id of the workflow the copy landed in — this
   * workflow when the host wrote the graph onto it, another id when the host
   * made a copy of its own and opened that — or `null` when nothing was
   * copied, which leaves the creator on the idea step. A rejection is shown
   * beside the browser and the creator stays there too.
   */
  onStartFromExample: (example: Workflow) => Promise<string | null>;
  /** Reads an imported workflow file onto this workflow. */
  onImport: (file: File) => Promise<void>;
  /** Runs after the flow reaches stage `done` — the host opens the canvas. */
  onFinish?: (result: BuildFromPlanResult | null) => void;
}

export interface WorkflowSetupFlowResult extends SetupFlowConfig<WorkflowSetupStage> {
  /** The build's outcome, for the landing checklist (PRD § 11.4). */
  buildResult: BuildFromPlanResult | null;
  /** True while the build runs, which outlasts the `done` it writes. */
  building: boolean;
  cancelBuild: () => Promise<void>;
}

export const useWorkflowSetupFlow = ({
  workflowId,
  defaultPlannerModel,
  providerConfigured,
  modelChoices,
  chosenModel,
  onStartFromExample,
  onImport,
  onFinish
}: WorkflowSetupFlowOptions): WorkflowSetupFlowResult => {
  const stage = useWorkflowSetupStage(workflowId);
  const setup = useWorkflowSetupDocument(workflowId);
  const { setSetup: saveSetup, editSetup } = useWorkflowSetupWriter(workflowId);
  // A choice or a stage change saves at once. Nobody awaits these, so a
  // refused save is reported instead of rejecting into the void.
  const setSetup = useCallback(
    (patch: Parameters<typeof saveSetup>[0]) => {
      saveSetup(patch).catch(reportSetupSaveError);
    },
    [saveSetup]
  );
  const metadata = useMetadataStore((state) => state.metadata);
  const {
    planWorkflow,
    cancelPlanning,
    planning,
    planningPhase,
    planningStatus,
    error: planError
  } = usePlanWorkflow(workflowId);
  const {
    buildFromPlan,
    cancelBuild,
    building,
    result: buildResult
  } = useBuildFromPlan(workflowId);
  const [importError, setImportError] = useState<string | null>(null);
  // A file being read onto this workflow. It finishes the flow when it lands,
  // so the step holds Continue and the shell's navigation until then.
  const [importing, setImporting] = useState(false);
  const stageRef = useRef(stage);
  stageRef.current = stage;
  // Step 1's inline examples browser: which example is being copied, why the
  // last copy failed, and whether the browser is open at all. It replaces the
  // step's body, so the shell's own primary button is held while it is up.
  const [browsingExamples, setBrowsingExamples] = useState(false);
  const [pickingExampleId, setPickingExampleId] = useState<string | null>(null);
  const [exampleError, setExampleError] = useState<string | null>(null);

  const brief = setup?.brief ?? "";
  const category = setup?.category;
  const hasPinnedPlan = WORKFLOW_INSPIRATION_CHIPS.some(
    (chip) => chip.brief.toLowerCase() === brief.trim().toLowerCase()
  );
  const plan = setup?.plan ?? EMPTY_PLAN;
  const runMode: WorkflowSetupRunMode =
    setup?.run_mode ?? defaultRunModeFor(category);
  // The picked model lives on the workflow, so a reload plans with it.
  const plannerModel = setup?.planner_model ?? defaultPlannerModel;
  // Whether the stored plan still answers what is on the category step. It
  // decides what that step's button does, so a creator who steps back to read
  // their category does not lose the plan by pressing the only button there.
  const planIsCurrent =
    plan.steps.length > 0 &&
    planSourceMatches(readPlanSource(setup), brief, category);

  const onPlannerModelChange = useCallback(
    (model: { provider: string; id: string }) => {
      setSetup({ planner_model: model });
    },
    [setSetup]
  );

  const onStageChange = useCallback(
    (next: WorkflowSetupStage) => {
      setSetup({ stage: next });
    },
    [setSetup]
  );

  const finish = useCallback(() => {
    setSetup({ stage: "done" });
    onFinish?.(null);
  }, [onFinish, setSetup]);

  // Picking an example is one action from here: copy it, then leave. The flow
  // writes the terminal stage only when the copy landed on *this* workflow —
  // a host that made a copy of its own owns that row and this one, and writing
  // to a row it may have discarded would fail for no reason (PRD § 11.1).
  const handlePickExample = useCallback(
    async (example: Workflow) => {
      setExampleError(null);
      setPickingExampleId(example.id);
      try {
        const landedIn = await onStartFromExample(example);
        if (landedIn === null) {
          return;
        }
        if (landedIn === workflowId) {
          setSetup({ stage: "done" });
        }
        onFinish?.(null);
      } catch (cause) {
        setExampleError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        setPickingExampleId(null);
      }
    },
    [onFinish, onStartFromExample, setSetup, workflowId]
  );

  const handleImport = useCallback(
    async (file: File) => {
      setImportError(null);
      setImporting(true);
      try {
        await onImport(file);
        // A creator who moved on while the file was read keeps their place.
        if (stageRef.current === "idea") {
          finish();
        }
      } catch (cause) {
        setImportError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        setImporting(false);
      }
    },
    [finish, onImport]
  );

  // Criterion 4: the review step's gate, read from the live registry.
  const review = useMemo(
    () =>
      resolveWorkflowPlan(plan, {
        knownNodeType: (nodeType) => nodeType in metadata,
        providerConfigured
      }),
    [metadata, plan, providerConfigured]
  );

  // The picked model per role lives on the workflow (F17, PRD § 11.5): it
  // decides what the build places and what the test run spends, so a remount
  // must not quietly swap it for whatever sorts first.
  const roleModels = useMemo(() => readRoleModels(setup), [setup]);

  const onRoleModelChange = useCallback(
    (role: string, tileId: string) => {
      setSetup({ [ROLE_MODELS_KEY]: { ...roleModels, [role]: tileId } });
    },
    [roleModels, setSetup]
  );

  // F20: the review advertises editing, so it can be left holding an empty
  // field. Every step needs a title and every output a name before the build
  // reads them.
  const planContentIsComplete =
    plan.steps.every((step) => step.title.trim().length > 0) &&
    plan.outputs.every((output) => output.name.trim().length > 0);

  const roleChoices = useMemo<ModelRoleChoices[]>(
    () =>
      review.roles.map((role) => {
        const available = modelChoices(role);
        const remembered = roleModels[role];
        const offered =
          remembered !== undefined &&
          available.tiles.some((tile) => tile.id === remembered);
        return {
          ...available,
          selectedId: offered
            ? (remembered ?? null)
            : (available.tiles[0]?.id ?? null),
          onSelect: (id: string) => onRoleModelChange(role, id),
          unavailableSelection:
            remembered !== undefined &&
            !offered &&
            available.status === "ready"
              ? remembered
              : null
        };
      }),
    [modelChoices, onRoleModelChange, review.roles, roleModels]
  );

  // A role whose model list has not answered yet reads as uncovered, which is
  // the safe way round but says the wrong thing on the button. The wait gets
  // its own reason (F14).
  const rolesLoading = roleChoices.some((role) => role.status === "loading");
  // The build assigns one model per role. A role whose list failed, or that no
  // connected provider covers, has nothing to assign, and a build without it
  // places nodes that cannot run.
  const rolesFailed = roleChoices.some((role) => role.status === "error");
  const rolesAssigned = roleChoices.every(
    (role) => role.status === "ready" && role.selectedId !== null
  );

  const steps = useMemo<SetupStep<WorkflowSetupStage>[]>(
    () => [
      {
        stage: "idea",
        label: "Idea",
        primaryLabel: "Continue",
        // The copy cannot be stopped once asked for, so it is not the shell's
        // pending operation: that would offer a Cancel that hides the picker
        // and leaves only a Retry the open picker keeps disabled. The picker
        // shows the copy and holds "Back to your idea" until it lands.
        canAdvance: !importing && !browsingExamples && brief.trim().length > 0,
        // A copy or an import lands by leaving this flow, so the shell's Back
        // and Change flow stay off until it has.
        holdNavigation: pickingExampleId !== null || importing,
        blockedReason: importing
          ? "Reading your file"
          : pickingExampleId !== null
            ? "Copying the example"
            : browsingExamples
              ? "Pick an example, or go back to your idea"
              : "Describe the task",
        render: () =>
          createElement(WorkflowIdeaStep, {
            workflowId,
            // Typing saves after a pause rather than on every keystroke.
            onBriefChange: (next: string) => {
              editSetup({ brief: next });
            },
            browsingExamples,
            onBrowseExamples: (browsing: boolean) => {
              setExampleError(null);
              setBrowsingExamples(browsing);
            },
            onStartFromExample: (example: Workflow) => {
              void handlePickExample(example);
            },
            pickingExampleId,
            exampleError,
            onImport: handleImport,
            importing,
            onStartBlank: finish,
            importError,
            onDismissImportError: () => setImportError(null)
          })
      },
      {
        // Category and review are both step 2, so they collapse into one
        // stepper entry (PRD § 6.2).
        stage: "category",
        label: "Plan",
        // Coming back to this step with the plan it produced still answering
        // the brief and category on screen, the button continues to that plan
        // instead of throwing it away and calling the model again (F15).
        primaryLabel: planIsCurrent
          ? "Continue to your plan"
          : plan.steps.length > 0
            ? "Re-plan the steps"
            : "Plan the steps",
        canAdvance:
          (category ?? "").length > 0 &&
          (planIsCurrent || Boolean(plannerModel?.id) || hasPinnedPlan),
        blockedReason: !category
          ? "Pick a workflow category"
          : "Pick a planner model, or use a shipped example",
        // The planner checks its own draft and may call the model again to
        // repair it, so the estimate covers every round's output (F10).
        generation: planIsCurrent
          ? undefined
          : {
              result: `Draft a plan of inputs, processing steps and outputs, then check it (up to ${WORKFLOW_PLAN_MAX_ROUNDS} planner calls)`,
              next: "Review the proposed nodes and required models next. Build places the nodes later; this click does not run the workflow.",
              model: plannerModel,
              brief,
              maxOutputTokens:
                PLANNER_MAX_OUTPUT_TOKENS * WORKFLOW_PLAN_MAX_ROUNDS,
              noModelCall: !plannerModel?.id && hasPinnedPlan
            },
        primaryDetail: planIsCurrent
          ? "Your plan is unchanged — this keeps it."
          : undefined,
        pending: planning,
        pendingLabel:
          planningPhase === "checking" ? "Checking the plan" : "Planning the steps",
        footerControls: (context) =>
          createElement(PlannerModelFooterField, {
            plannerModel,
            onPlannerModelChange,
            readOnly: context.readOnly
          }),
        render: () =>
          createElement(WorkflowCategoryStep, {
            selectedId: category ?? null,
            // Only a real change writes the category's default run mode.
            // Re-selecting the card the creator is already on used to reset a
            // run mode they had chosen on the next step (F15).
            onSelect: (id: string) => {
              setSetup(
                id === category
                  ? { category: id }
                  : { category: id, run_mode: defaultRunModeFor(id) }
              );
            }
          }),
        // The planner runs here and places nothing (criterion 3). A refused
        // run leaves the creator on the category with the reason on the button.
        onAdvance: async () => {
          if (planIsCurrent) {
            return;
          }
          // The reason comes back from the call, not from `planError` — that
          // state is a render behind, so reading it here reported every
          // refusal, a provider 429 included, as a missing plan.
          // A refusal, or an answer set aside because the brief or category
          // changed meanwhile, keeps the creator here with the reason. The
          // shell must not advance to a review with no plan on it (F2).
          const refusal = await planWorkflow({
            brief,
            category,
            model: plannerModel
          });
          if (refusal) {
            throw new Error(refusal);
          }
        },
        onCancel: cancelPlanning,
        canceled: planningStatus === "canceled"
      },
      {
        stage: "review",
        label: "Plan",
        primaryLabel: "Continue to setup",
        // Criterion 4 and D23, plus the content gate: a step with no title, or
        // an output with no name, builds a node nobody can read afterwards, so
        // the review does not hand an empty field on to the build (F20).
        // `Re-plan` runs outside the shell's primary button, so the button is
        // held while it runs: the creator cannot continue to setup while the
        // plan they are reading is being replaced (F2). It is not the shell's
        // pending operation either. Canceling one there replaced the plan with
        // a canceled screen whose Retry re-planned, so the plan the creator
        // kept was out of reach (F6). The review stops its own re-plan and
        // keeps the plan on screen.
        // A re-plan answers onto this step, so Back is held until it lands.
        holdNavigation: planning,
        canAdvance:
          !planning &&
          review.canContinue &&
          plan.steps.length > 0 &&
          planContentIsComplete,
        blockedReason: planning
          ? planningPhase === "checking"
            ? "Checking the plan"
            : "Re-planning the steps"
          : plan.steps.length === 0
            ? "Add a plan step"
            : !planContentIsComplete
              ? "Give every step and output a name"
              : rolesLoading
                ? "Reading the models your providers offer"
                : "Resolve the missing nodes or model providers above",
        render: () =>
          createElement(WorkflowReviewStep, {
            plan,
            // Typed step titles and summaries save after a pause (F1).
            onPlanChange: (next: WorkflowSetupPlan) => {
              editSetup({ plan: next });
            },
            onReplan: () => {
              void planWorkflow({ brief, category, model: plannerModel });
            },
            replanPending: planning,
            onCancelReplan: cancelPlanning,
            providerConfigured,
            error: planError
          })
      },
      {
        stage: "setup",
        label: "Build",
        primaryLabel: "Build your workflow",
        // The label the PRD fixes (Appendix A) names the build, and § 11.3
        // makes the run part of it. The line beside the button says so before
        // the click; the step's own "Before you build" block carries the
        // models and the sample inputs that run will use (F1).
        primaryDetail: "Builds, checks, then runs it once",
        canAdvance: rolesAssigned,
        blockedReason: rolesLoading
          ? "Reading the models your providers offer"
          : rolesFailed
            ? "Try reading the models again above"
            : "Connect a provider for every model above",
        pending: building,
        pendingLabel: "Building the graph, then running it once",
        render: () =>
          createElement(WorkflowSetupStep, {
            plan,
            roles: roleChoices,
            runMode,
            onRunModeChange: (mode: WorkflowSetupRunMode) => {
              setSetup({ run_mode: mode });
            },
            onSampleChange: (inputName: string, value: string) => {
              editSetup({
                plan: {
                  ...plan,
                  inputs: plan.inputs.map((input) =>
                    input.name === inputName
                      ? { ...input, sample: value }
                      : input
                  )
                }
              });
            }
          }),
        // `buildFromPlan` writes the terminal stage itself, as soon as the
        // nodes are placed (PRD § 11.3, D3).
        continueAfterUnmount: true,
        onAdvance: async (context) => {
          const built = await buildFromPlan({
            plan,
            models: Object.fromEntries(
              roleChoices.map((role) => [
                role.role,
                chosenModel(role.role, role.selectedId)
              ])
            ),
            // The same converted value the input node carries, so a number
            // input runs with a number and a media input sends no text.
            sampleInputs: Object.fromEntries(
              plan.inputs.flatMap((input) => {
                const sample = planInputSample(input);
                return sample === undefined ? [] : [[input.name, sample]];
              })
            )
          }, context?.signal);
          onFinish?.(built);
        },
        onCancel: cancelBuild
      }
    ],
    [
      brief,
      browsingExamples,
      exampleError,
      handlePickExample,
      hasPinnedPlan,
      pickingExampleId,
      buildFromPlan,
      cancelBuild,
      building,
      category,
      cancelPlanning,
      chosenModel,
      editSetup,
      finish,
      handleImport,
      importError,
      importing,
      onFinish,
      onPlannerModelChange,
      plan,
      planContentIsComplete,
      planError,
      planIsCurrent,
      planWorkflow,
      plannerModel,
      planning,
      planningPhase,
      planningStatus,
      providerConfigured,
      review.canContinue,
      roleChoices,
      rolesAssigned,
      rolesFailed,
      rolesLoading,
      runMode,
      setSetup,
      workflowId
    ]
  );

  return {
    labels: FLOW_LABELS,
    steps,
    stage,
    onStageChange,
    buildResult,
    building,
    cancelBuild
  };
};

export default useWorkflowSetupFlow;
