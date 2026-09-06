import { z } from "zod";
import {
  planNodeShape,
  planToPlacement,
  resolveWorkflowPlan
} from "@nodetool-ai/protocol";
import {
  readWorkflowSetup,
  workflowSetupPlan,
  workflowSetupStage,
  workflowSetupRunMode,
  writeWorkflowSetup,
  type WorkflowSetupPlan
} from "@nodetool-ai/protocol/api-schemas/workflows.js";

import { FrontendToolRegistry } from "../frontendTools";
import type { FrontendToolState } from "../frontendTools";
import useMetadataStore from "../../../stores/MetadataStore";
import { resolveWorkflowId } from "./workflow";
import { docUrl } from "./resourceLinks";

/**
 * The four tools that drive the Workflow creation flow from an agent
 * (PRD § 11.6): write the setup answers, plan the steps, edit one step, build
 * the graph from the plan.
 *
 * They act on the same `settings.setup` field the browser flow reads, so an
 * agent can move an open flow between steps and a creator can take over
 * mid-way. `packages/agents/src/capabilities/workflows.ts` mirrors all four
 * against the stored row for a run with no editor open.
 *
 * Two rules carry the phase:
 *
 * - `ui_workflow_plan` places no node (criterion 3). It writes text.
 * - `ui_workflow_build_from_plan` refuses a plan that still names a node type
 *   the registry does not have (D23), and reports the wiring it could not do,
 *   because a graph with an unwired output validates and produces nothing (R6).
 */

const workflowIdParam = z
  .string()
  .optional()
  .describe(
    "Id of the workflow to act on. Defaults to the workflow the editor is on."
  );

/** Read the workflow's setup, or explain that there is none. */
function requireSetup(state: FrontendToolState, workflowId: string) {
  const workflow = state.getWorkflow(workflowId);
  if (!workflow) {
    throw new Error(
      `Workflow ${workflowId} is not open. Open it with ui_open_workflow first.`
    );
  }
  return { workflow, setup: readWorkflowSetup(workflow.settings) };
}

/** Write a setup patch and persist it, failing the call if the save is refused. */
async function persistSetup(
  state: FrontendToolState,
  workflowId: string,
  patch: Parameters<typeof writeWorkflowSetup>[1]
) {
  const { workflow } = requireSetup(state, workflowId);
  const settings = writeWorkflowSetup(workflow.settings, patch);
  const live = state.getNodeStore(workflowId)?.getState().getWorkflow();
  const next = { ...(live ?? workflow), settings };
  state.updateWorkflow(next);
  await state.saveWorkflow(next);
  return readWorkflowSetup(settings);
}

/** The plan on the workflow, or the reason there is nothing to act on. */
function requirePlan(
  state: FrontendToolState,
  workflowId: string
): WorkflowSetupPlan {
  const { setup } = requireSetup(state, workflowId);
  if (!setup?.plan) {
    throw new Error(
      `Workflow ${workflowId} has no plan. Write one with ui_workflow_plan first.`
    );
  }
  return setup.plan;
}

/** Grade a plan against the live registry — the review step's markers (D23). */
function reviewPlan(plan: WorkflowSetupPlan) {
  const metadata = useMetadataStore.getState().metadata;
  const resolved = resolveWorkflowPlan(plan, {
    knownNodeType: (nodeType) => nodeType in metadata,
    // The browser cannot enumerate providers here; the review step does that
    // from the model lists it already loads. An agent gets node-type checking
    // and is told which roles the plan needs.
    providerConfigured: () => true
  });
  return {
    can_continue: resolved.canContinue,
    roles: resolved.roles,
    steps: resolved.steps.map((entry) => ({
      id: entry.step.id,
      title: entry.step.title,
      node_type: entry.step.node_type,
      model_role: entry.step.model_role ?? null,
      unknown_node_type: entry.unknownNodeType
    }))
  };
}

const planParam = z
  .object({
    inputs: z.array(
      z
        .object({
          name: z.string(),
          type: z.string(),
          sample: z.unknown().optional()
        })
        .passthrough()
    ),
    steps: z.array(
      z
        .object({
          id: z.string().optional(),
          title: z.string(),
          summary: z.string(),
          node_type: z.string().nullable(),
          model_role: z.string().optional()
        })
        .passthrough()
    ),
    outputs: z.array(
      z.object({ name: z.string(), type: z.string() }).passthrough()
    )
  })
  .describe(
    "The plan: what the workflow takes in, the steps it runs in order, and what it hands back."
  );

FrontendToolRegistry.register({
  name: "ui_workflow_set_setup",
  description:
    "Write the guided-setup answers on a workflow: the `brief` (what it should do), the `category` that biases the planner, the `run_mode` it is built for, and the `stage` the flow sits at. Omit a field to leave it unchanged. The stages run idea → category → review → setup → done; a workflow that has finished setup, or was built before the flow existed, reads 'done'. Setting the stage is what moves the open flow to that step.",
  parameters: z.object({
    workflow_id: workflowIdParam,
    brief: z
      .string()
      .optional()
      .describe("What the workflow should do — the planner's input."),
    category: z
      .enum([
        "content-pipeline",
        "media-batch",
        "data-extraction",
        "research-agent",
        "trigger-automation",
        "chat-app"
      ])
      .optional()
      .describe("Kind of workflow. Biases which node types the planner sees."),
    run_mode: workflowSetupRunMode
      .optional()
      .describe("How the finished workflow is meant to be started."),
    stage: workflowSetupStage
      .optional()
      .describe("Where the guided flow should resume.")
  }),
  async execute({ workflow_id, brief, category, run_mode, stage }, ctx) {
    const state = ctx.getState();
    const workflowId = resolveWorkflowId(state, workflow_id);
    const patch: Parameters<typeof writeWorkflowSetup>[1] = {};
    if (brief !== undefined) patch.brief = brief;
    if (category !== undefined) patch.category = category;
    if (run_mode !== undefined) patch.run_mode = run_mode;
    if (stage !== undefined) patch.stage = stage;
    if (Object.keys(patch).length === 0) {
      throw new Error(
        "Nothing to set — pass brief, category, run_mode or stage."
      );
    }
    const setup = await persistSetup(state, workflowId, patch);
    return {
      ok: true,
      workflow_id: workflowId,
      setup,
      url: docUrl("workflow", workflowId)
    };
  }
});

FrontendToolRegistry.register({
  name: "ui_workflow_plan",
  description:
    "Store the plan for a workflow's brief and move the flow to its review step. Places no node and starts no job: the plan is text the creator reviews before anything is built. Every step names a node type from the registry (use ui_search_nodes to find them) or null when none fits — a named guess that turns out to be the wrong node builds a graph that runs and produces nothing. The result marks any step whose type this install does not have.",
  parameters: z.object({
    workflow_id: workflowIdParam,
    plan: planParam
  }),
  async execute({ workflow_id, plan }, ctx) {
    const state = ctx.getState();
    const workflowId = resolveWorkflowId(state, workflow_id);
    const parsed = workflowSetupPlan.parse({
      ...plan,
      steps: plan.steps.map((step, index) => ({
        ...step,
        id: step.id ?? `step-${index + 1}`
      }))
    });
    const setup = await persistSetup(state, workflowId, {
      plan: parsed,
      stage: "review"
    });
    return {
      ok: true,
      workflow_id: workflowId,
      setup,
      review: reviewPlan(parsed),
      nodes_placed: 0
    };
  }
});

FrontendToolRegistry.register({
  name: "ui_workflow_update_plan_step",
  description:
    "Edit the stored plan: change one step's title, summary, node type or model role, add a step, remove one, or move one to another position. Use it to replace a node type the registry does not have — the build refuses a plan that still names one.",
  parameters: z.object({
    workflow_id: workflowIdParam,
    step_id: z
      .string()
      .optional()
      .describe("The step to change. Omit with op 'add'."),
    op: z
      .enum(["update", "add", "remove", "move"])
      .default("update")
      .describe("What to do with the step."),
    title: z.string().optional(),
    summary: z.string().optional(),
    node_type: z
      .string()
      .nullable()
      .optional()
      .describe("Registry node type, or null when none fits."),
    model_role: z.enum(["language", "image", "video", "audio"]).optional(),
    index: z
      .number()
      .int()
      .optional()
      .describe("0-based position for op 'move' or 'add'.")
  }),
  async execute(
    { workflow_id, step_id, op, title, summary, node_type, model_role, index },
    ctx
  ) {
    const state = ctx.getState();
    const workflowId = resolveWorkflowId(state, workflow_id);
    const plan = requirePlan(state, workflowId);
    const steps = [...plan.steps];
    const at =
      step_id === undefined ? -1 : steps.findIndex((s) => s.id === step_id);
    if (op !== "add" && at === -1) {
      throw new Error(
        `No plan step "${step_id ?? ""}". The step ids are: ${steps
          .map((step) => step.id)
          .join(", ")}.`
      );
    }
    const fields: Partial<WorkflowSetupPlan["steps"][number]> = {};
    if (title !== undefined) fields.title = title;
    if (summary !== undefined) fields.summary = summary;
    if (node_type !== undefined) fields.node_type = node_type;
    if (model_role !== undefined) fields.model_role = model_role;

    const clamp = (position: number) =>
      Math.max(0, Math.min(steps.length, position));

    if (op === "remove") {
      steps.splice(at, 1);
    } else if (op === "move") {
      if (index === undefined) {
        throw new Error("op 'move' needs an `index`.");
      }
      const [moved] = steps.splice(at, 1);
      steps.splice(clamp(index), 0, moved);
    } else if (op === "add") {
      const added: WorkflowSetupPlan["steps"][number] = {
        id: step_id ?? `step-${steps.length + 1}`,
        title: fields.title ?? "New step",
        summary: fields.summary ?? "",
        node_type: fields.node_type ?? null
      };
      if (fields.model_role !== undefined) {
        added.model_role = fields.model_role;
      }
      steps.splice(index === undefined ? steps.length : clamp(index), 0, added);
    } else {
      steps[at] = { ...steps[at], ...fields };
    }

    const next = workflowSetupPlan.parse({ ...plan, steps });
    const setup = await persistSetup(state, workflowId, { plan: next });
    return { ok: true, workflow_id: workflowId, setup, review: reviewPlan(next) };
  }
});

FrontendToolRegistry.register({
  name: "ui_workflow_build_from_plan",
  description:
    "Build the workflow's graph from its stored plan: one input node per plan input, one node per step in plan order chained to the one before it, and one output node per plan output, each step's node carrying its plan step id. Refused while any step names a node type the registry does not have. The result lists any wiring it could not do — a plan whose output has nothing upstream builds a graph that validates and produces nothing, so check `issues` before you call it done. Run the workflow afterwards with the plan's sample inputs.",
  parameters: z.object({
    workflow_id: workflowIdParam,
    models: z
      .record(z.string(), z.unknown())
      .optional()
      .describe(
        'The model each role runs on, keyed by role ("language", "image", "video", "audio"), as ui_search_models returns it.'
      )
  }),
  async execute({ workflow_id, models }, ctx) {
    const state = ctx.getState();
    const workflowId = resolveWorkflowId(state, workflow_id);
    const plan = requirePlan(state, workflowId);
    const metadata = state.nodeMetadata;

    const review = reviewPlan(plan);
    const unknown = review.steps.filter((step) => step.unknown_node_type);
    if (unknown.length > 0) {
      throw new Error(
        "Every step must name a node type this install has before the graph is built. " +
          `Unresolved: ${unknown
            .map((step) => `${step.id} (${step.node_type ?? "no type"})`)
            .join(", ")}. Fix them with ui_workflow_update_plan_step.`
      );
    }

    const placement = planToPlacement(
      plan,
      (nodeType) => {
        const meta = metadata[nodeType];
        return meta ? planNodeShape(meta) : null;
      },
      models === undefined ? {} : { models }
    );

    let seq = 0;
    const call = (name: string, args: Record<string, unknown>) =>
      FrontendToolRegistry.call(name, args, `plan-build-${++seq}`, {
        getState: () => state
      });

    for (const node of placement.nodes) {
      await call("ui_add_node", {
        workflow_id: workflowId,
        id: node.id,
        type: node.type,
        position: node.position,
        properties: node.properties
      });
      const data: Record<string, unknown> = {};
      if (node.dynamicProperties !== undefined) {
        data["dynamic_properties"] = node.dynamicProperties;
      }
      if (node.setupStepId !== undefined) {
        data["setupStepId"] = node.setupStepId;
      }
      if (Object.keys(data).length > 0) {
        await call("ui_update_node_data", {
          workflow_id: workflowId,
          node_id: node.id,
          data
        });
      }
    }
    for (const edge of placement.edges) {
      await call("ui_connect_nodes", {
        workflow_id: workflowId,
        source_node_id: edge.source,
        source_handle: edge.sourceHandle,
        target_node_id: edge.target,
        target_handle: edge.targetHandle
      });
    }

    const setup = await persistSetup(state, workflowId, { stage: "done" });
    return {
      ok: true,
      workflow_id: workflowId,
      setup,
      nodes_placed: placement.nodes.length,
      edges_placed: placement.edges.length,
      issues: placement.issues,
      sample_inputs: Object.fromEntries(
        plan.inputs.map((input) => [input.name, input.sample ?? ""])
      ),
      url: docUrl("workflow", workflowId)
    };
  }
});
