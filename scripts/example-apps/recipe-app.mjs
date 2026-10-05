import { compileSharedRecipeBundle, PLAN_STORYBOARD_CODE, FINISH_STORYBOARD_CODE } from "../recipe-operations.mjs";

const SELECTED_MODEL_CODE = `const selectedModel = inputs.finishModel;
if (!selectedModel?.provider?.trim() || !selectedModel?.id?.trim()) throw new Error("Select a finishing model before planning.");
inputs.finishModel = {provider: selectedModel.provider, id: selectedModel.id};
inputs.recipe = {...inputs.recipe, operations: inputs.recipe.operations.map(operation => operation.intent === "finish_storyboard" ? {...operation, model: inputs.finishModel} : operation)};
`;
export const PLAN_CODE = SELECTED_MODEL_CODE + PLAN_STORYBOARD_CODE;
export const FINISH_CODE = SELECTED_MODEL_CODE + FINISH_STORYBOARD_CODE;

/** A Code node stops a runaway agent after this long. */
const AGENT_JOB_TIMEOUT_SECONDS = 1800;

/**
 * Moves a compiled script operation into a bundled workflow job that runs the
 * same code in a Code node. A script operation stops after 120 seconds, and an
 * agent that lays out or finishes a cut with rendered frames takes longer.
 * One Value Input per port passes each value through unchanged.
 */
const runAsWorkflowJob = (bundle, operationId) => {
  const operation = bundle.app.operations.find(candidate => candidate.id === operationId);
  const scriptIndex = bundle.scripts.findIndex(script => script.key === operation.target.scriptId);
  const [script] = bundle.scripts.splice(scriptIndex, 1);
  const {inputs, outputs, code} = script.document;
  const node = (id, type, data, x, extra = {}) => ({id, type, data, ui_properties: {position: {x, y: 0}}, dynamic_properties: {}, dynamic_outputs: {}, ...extra});
  bundle.workflows.push({key: operationId, name: operation.name, description: `Runs “${operation.name}” as a job, so its agent is not bound by the script time limit.`, version: 1, graphHash: null, graph: {
    nodes: [
      ...inputs.map(port => node(`in-${port.name}`, "nodetool.input.ValueInput", {name: port.name, value: null, description: ""}, 0)),
      node("run", "nodetool.code.Code", {code, timeout: AGENT_JOB_TIMEOUT_SECONDS}, 360, {
        dynamic_properties: Object.fromEntries(inputs.map(port => [port.name, null])),
        dynamic_inputs: Object.fromEntries(inputs.map(port => [port.name, {type: {type: "any"}}])),
        dynamic_outputs: Object.fromEntries(outputs.map(port => [port.name, {type: "any", type_args: [], optional: true}])),
        sync_mode: "on_all"
      }),
      ...outputs.map(port => node(`out-${port.name}`, "nodetool.output.Output", {name: port.name}, 820))
    ],
    edges: [
      ...inputs.map(port => ({id: `${port.name}-in`, source: `in-${port.name}`, sourceHandle: "output", target: "run", targetHandle: port.name})),
      ...outputs.map(port => ({id: `${port.name}-out`, source: "run", sourceHandle: port.name, target: `out-${port.name}`, targetHandle: "value"}))
    ]
  }});
  // Pinned like the script it replaces, so the Recipe still names an exact target.
  operation.workflowId = operationId;
  operation.workflowVersion = 1;
  delete operation.target;
  operation.inputs = Object.fromEntries(Object.entries(operation.inputs).map(([port, mapping]) => [`in-${port}`, mapping]));
  operation.outputs = Object.fromEntries(Object.entries(operation.outputs).map(([port, mapping]) => [`out-${port}`, mapping]));
};

/**
 * Compiles a Recipe manifest into the stepped Application Product Price Drop
 * established: the model pickers, then inputs, review, build and result.
 * Planning runs an agent that lays out every frame, so the review shows the
 * composition the build keeps.
 */
export const buildRecipeAppBundle = (manifest, name, description) => {
  const bundle = compileSharedRecipeBundle(manifest, name, description);
  bundle.app.variables.push(
    {id: "finishModel", name: "Finishing model", type: {type: "dict"}, scope: "user", persist: true, default: {type: "language_model", provider: "", id: "", name: ""}},
    {id: "imageModel", name: "Image model", type: {type: "dict"}, scope: "user", persist: true, default: {type: "image_model", provider: "", id: "", name: ""}}
  );
  bundle.app.ui.content.splice(1, 0,
    {type: "ModelSelect", props: {id: "finishModel", label: "Finishing model", binding: "var:finishModel", modelKind: "language_model", events: [{trigger: "change", kind: "setVariable", key: "var:approval", value: "pending"}]}},
    {type: "Text", props: {id: "finishModel-help", text: "The selected language model lays out every frame and finishes the editable cut. Pick one that reads images. No generated video."}},
    {type: "ModelSelect", props: {id: "imageModel", label: "Image model", binding: "var:imageModel", modelKind: "image_model", events: []}},
    {type: "Text", props: {id: "imageModel-help", text: "Optional. Paints backgrounds and decoration while the agent lays out the frames. Without one, the agent decorates with shapes."}}
  );
  const planErrorAt = bundle.app.ui.content.findIndex(item => item.props.id === "plan-error");
  bundle.app.ui.content.splice(planErrorAt + 1, 0,
    {type: "AgentActivity", props: {id: "plan-activity", binding: "op:plan/exec#transcript", label: "Layout agent", height: 280, placeholder: "The agent's layout edits and frame reviews appear here.", visibleWhen: {binding: "op:plan/exec#transcript", op: "notEmpty"}}}
  );
  // The layout agent saves its best cut when its visual review still has
  // findings. The review step says so, and the person may still approve it.
  const designAt = bundle.app.ui.content.findIndex(item => item.props.id === "output-designPreview");
  bundle.app.ui.content.splice(designAt < 0 ? bundle.app.ui.content.length : designAt, 0,
    {type: "Container", props: {id: "layout-review", variant: "plain", content: [
      {type: "Alert", props: {id: "layout-needs-review", severity: "warning", title: "The layout needs a look", text: "Edit the cut or plan again. You can still approve it.", visibleWhen: {binding: "var:layoutFindings", op: "notEmpty"}}},
      {type: "List", props: {id: "layout-findings", binding: "var:layoutFindings", visibleWhen: {binding: "var:layoutFindings", op: "notEmpty"}}}
    ]}}
  );
  // Each Stepper step shows only its own widgets. The plan script sets step to
  // "review" and the finish script sets it to "result". The finish button keeps
  // its own approval condition.
  const stepOf = (item) => {
    const id = item.props.id;
    if (id === "steps") return undefined;
    if (["output-storyboardId", "output-storyboardId-preview", "output-designPreview", "layout-review", "finish", "request-changes"].includes(id)) return "review";
    if (["finish-error", "finish-activity"].includes(id)) return "build";
    if (["output-timeline", "finish-status"].includes(id)) return "result";
    return "inputs";
  };
  // Review offers two buttons. Building the cut is the approval, so the
  // Approval widget gives way to a build button that approves, then runs.
  const content = bundle.app.ui.content;
  const finishIndex = content.findIndex((item) => item.props.id === "finish");
  const approvalIndex = content.findIndex((item) => item.props.id === "approval");
  const finish = content[finishIndex].props;
  delete finish.visibleWhen;
  finish.events = [{trigger: "click", kind: "setVariable", key: "var:approval", value: "approved"}, {trigger: "click", kind: "setVariable", key: "var:step", value: "build"}, ...finish.events];
  const steps = content[0].props.steps;
  steps.splice(steps.length - 1, 0, {value: "build", title: "Build"});
  content[approvalIndex] = {type: "Button", props: {id: "request-changes", label: "Request changes", variant: "outlined", events: [
    {trigger: "click", kind: "setVariable", key: "var:approval", value: "pending"},
    {trigger: "click", kind: "setVariable", key: "var:step", value: "inputs"}
  ]}};
  content.splice(finishIndex, 1);
  content.splice(approvalIndex, 0, {type: "Button", props: finish});
  for (const item of bundle.app.ui.content) {
    const step = stepOf(item);
    if (step) item.props.visibleWhen = {binding: "var:step", op: "eq", value: step};
  }
  for (const operation of bundle.app.operations) {
    operation.inputs.finishModel = {from: "variable", variableId: "finishModel"};
    if (operation.id === "plan") operation.inputs.imageModel = {from: "variable", variableId: "imageModel"};
  }
  for (const script of bundle.scripts) {
    const planning = script.key === "plan_storyboard-v1";
    script.document.code = planning ? PLAN_CODE : FINISH_CODE;
    if (!script.document.inputs.some(port => port.name === "finishModel")) {
      script.document.inputs.push({name: "finishModel", type: "dict"});
    }
    if (planning) script.document.inputs.push({name: "imageModel", type: "dict"});
  }
  for (const operation of [...bundle.app.operations]) runAsWorkflowJob(bundle, operation.id);
  return bundle;
};

// The plan script moves the stepper to review, which a no-run debug never
// executes. Without this step the build button is unreachable.
export const RECIPE_APP_DEBUG_INTERACTIONS = [{set: {key: "step", value: "review"}}];
