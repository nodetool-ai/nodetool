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
import { resolveWorkflowPlan } from "@nodetool-ai/protocol";
import type {
  WorkflowSetupPlan,
  WorkflowSetupRunMode,
  WorkflowSetupStage
} from "@nodetool-ai/protocol/api-schemas/workflows.js";

import useMetadataStore from "../../../stores/MetadataStore";
import {
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
import { WorkflowCategoryStep } from "./CategoryStep";
import { WorkflowIdeaStep } from "./IdeaStep";
import { WorkflowReviewStep } from "./ReviewStep";
import { WorkflowSetupStep } from "./SetupStep";
import type { ModelRoleChoices } from "./SetupStep";

const FLOW_LABELS = { title: "Workflow" } as const;

/** An empty plan, so the review step renders before a planner ever ran. */
const EMPTY_PLAN: WorkflowSetupPlan = { inputs: [], steps: [], outputs: [] };

export interface WorkflowSetupFlowOptions {
  workflowId: string;
  /** The planner's model. Null means the flow falls back to a pinned plan. */
  plannerModel: { provider: string; id: string } | null;
  /** True when a configured provider covers this model role (D23). */
  providerConfigured: (role: string) => boolean;
  /** Model choices per role, for step 3's tile rows. */
  modelChoices: (role: string) => ModelRoleChoices;
  /** The model object the build assigns for a role, once one is chosen. */
  chosenModel: (role: string) => unknown;
  /** Opens the examples browser (step 1's first alternative). */
  onStartFromExample: () => void;
  /** Reads an imported workflow file onto this workflow. */
  onImport: (file: File) => Promise<void>;
  /** Runs after the flow reaches stage `done` — the host opens the canvas. */
  onFinish?: (result: BuildFromPlanResult | null) => void;
}

export interface WorkflowSetupFlowResult
  extends SetupFlowConfig<WorkflowSetupStage> {
  /** The build's outcome, for the landing checklist (PRD § 11.4). */
  buildResult: BuildFromPlanResult | null;
}

export const useWorkflowSetupFlow = ({
  workflowId,
  plannerModel,
  providerConfigured,
  modelChoices,
  chosenModel,
  onStartFromExample,
  onImport,
  onFinish
}: WorkflowSetupFlowOptions): WorkflowSetupFlowResult => {
  const stage = useWorkflowSetupStage(workflowId);
  const setup = useWorkflowSetupDocument(workflowId);
  const { setSetup } = useWorkflowSetupWriter(workflowId);
  const metadata = useMetadataStore((state) => state.metadata);
  const { planWorkflow, planning, error: planError } = usePlanWorkflow(workflowId);
  const { buildFromPlan, building, result: buildResult } =
    useBuildFromPlan(workflowId);
  const [importError, setImportError] = useState<string | null>(null);

  // A refused plan run reports through state, one render after the call
  // resolves, so the step's own closure cannot see it. Mirror it.
  const planErrorRef = useRef<string | null>(null);
  planErrorRef.current = planError;

  const brief = setup?.brief ?? "";
  const category = setup?.category;
  const plan = setup?.plan ?? EMPTY_PLAN;
  const runMode: WorkflowSetupRunMode =
    setup?.run_mode ?? defaultRunModeFor(category);

  const onStageChange = useCallback(
    (next: WorkflowSetupStage) => {
      void setSetup({ stage: next });
    },
    [setSetup]
  );

  const finish = useCallback(() => {
    void setSetup({ stage: "done" });
    onFinish?.(null);
  }, [onFinish, setSetup]);

  const handleImport = useCallback(
    async (file: File) => {
      setImportError(null);
      try {
        await onImport(file);
        finish();
      } catch (cause) {
        setImportError(
          cause instanceof Error ? cause.message : String(cause)
        );
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

  const roleChoices = useMemo(
    () => review.roles.map((role) => modelChoices(role)),
    [modelChoices, review.roles]
  );

  const steps = useMemo<SetupStep<WorkflowSetupStage>[]>(
    () => [
      {
        stage: "idea",
        label: "Idea",
        primaryLabel: "Continue",
        canAdvance: brief.trim().length > 0,
        render: () =>
          createElement(WorkflowIdeaStep, {
            workflowId,
            onBriefChange: (next: string) => {
              void setSetup({ brief: next });
            },
            onStartFromExample: () => {
              onStartFromExample();
              finish();
            },
            onImport: handleImport,
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
        primaryLabel: "Plan the steps",
        canAdvance: (category ?? "").length > 0,
        pending: planning,
        render: () =>
          createElement(WorkflowCategoryStep, {
            selectedId: category ?? null,
            onSelect: (id: string) => {
              void setSetup({ category: id, run_mode: defaultRunModeFor(id) });
            }
          }),
        // The planner runs here and places nothing (criterion 3). A refused
        // run leaves the creator on the category with the reason on the button.
        onAdvance: async () => {
          const planned = await planWorkflow({
            brief,
            category,
            model: plannerModel
          });
          if (!planned) {
            throw new Error(
              planErrorRef.current ?? "The planner did not return a plan."
            );
          }
        }
      },
      {
        stage: "review",
        label: "Plan",
        primaryLabel: "Continue to setup",
        // Criterion 4, D23.
        canAdvance: review.canContinue && plan.steps.length > 0,
        render: () =>
          createElement(WorkflowReviewStep, {
            plan,
            onPlanChange: (next: WorkflowSetupPlan) => {
              void setSetup({ plan: next });
            },
            onReplan: () => {
              void planWorkflow({ brief, category, model: plannerModel });
            },
            replanPending: planning,
            providerConfigured,
            error: planError
          })
      },
      {
        stage: "setup",
        label: "Build",
        primaryLabel: "Build your workflow",
        pending: building,
        render: () =>
          createElement(WorkflowSetupStep, {
            plan,
            roles: roleChoices,
            runMode,
            onRunModeChange: (mode: WorkflowSetupRunMode) => {
              void setSetup({ run_mode: mode });
            },
            onSampleChange: (inputName: string, value: string) => {
              void setSetup({
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
        onAdvance: async () => {
          const built = await buildFromPlan({
            plan,
            models: Object.fromEntries(
              review.roles.map((role) => [role, chosenModel(role)])
            ),
            sampleInputs: Object.fromEntries(
              plan.inputs
                .filter((input) => input.sample !== undefined)
                .map((input) => [input.name, input.sample])
            )
          });
          onFinish?.(built);
        }
      }
    ],
    [
      brief,
      buildFromPlan,
      building,
      category,
      chosenModel,
      finish,
      handleImport,
      importError,
      onFinish,
      onStartFromExample,
      plan,
      planError,
      planWorkflow,
      plannerModel,
      planning,
      providerConfigured,
      review.canContinue,
      review.roles,
      roleChoices,
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
    buildResult
  };
};

export default useWorkflowSetupFlow;
