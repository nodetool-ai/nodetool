/**
 * Plan steps that name a Code-node snippet.
 *
 * Snippets reach the browser's metadata store under virtual node types
 * (`nodetool.json.json_csv_parse`), so the planner is offered them and the
 * registry ranking matches them. No server registry has those types: a step
 * placed with one is a node nothing can run. The node menu turns a snippet into
 * a `nodetool.code.Code` node with the snippet's body, and a plan step does the
 * same here.
 */
import { PLAN_CODE_NODE_TYPE } from "@nodetool-ai/protocol";
import type {
  WorkflowPlanStep,
  WorkflowSetupPlan
} from "@nodetool-ai/protocol/api-schemas/workflows.js";

import { findSnippetByNodeType } from "../config/snippetMetadata";
import {
  inferInputKeysFromCode,
  inferOutputKeysFromCode
} from "./codeOutputInference";

/** The Code step a snippet step stands for, or the step unchanged. */
export const snippetStepAsCode = (step: WorkflowPlanStep): WorkflowPlanStep => {
  const snippet =
    step.node_type === null ? undefined : findSnippetByNodeType(step.node_type);
  if (!snippet) {
    return step;
  }
  return {
    ...step,
    node_type: PLAN_CODE_NODE_TYPE,
    code: snippet.code,
    code_inputs: inferInputKeysFromCode(snippet.code) ?? [],
    code_outputs: inferOutputKeysFromCode(snippet.code) ?? ["output"]
  };
};

/** Every snippet step of a plan as the Code step it stands for. */
export const resolveSnippetSteps = (
  plan: WorkflowSetupPlan
): WorkflowSetupPlan => ({
  ...plan,
  steps: plan.steps.map(snippetStepAsCode)
});
