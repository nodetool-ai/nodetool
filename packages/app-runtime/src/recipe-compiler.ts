import {
  APP_SCHEMA_VERSION,
  inspectRecipeManifest,
  operationTarget,
  parseApplicationDocument,
  validateRecipeBindings,
  type ApplicationDocument,
  type OperationBinding,
  type RecipeInputKind,
  type RecipeManifest,
  type RecipePreservationRule,
  type ResourceKind,
  type VariableDeclaration
} from "./document.js";
import { isKnownWidget } from "./widgets.js";

export interface RecipeOperationPort {
  readonly type: string;
  readonly required?: boolean;
}

/** Authoring contract for an existing Script or Workflow, never an executor. */
export interface RecipeOperationContract {
  readonly id: string;
  readonly version: number;
  readonly inputs: Readonly<Record<string, RecipeOperationPort>>;
  readonly outputs: Readonly<Record<string, RecipeOperationPort>>;
  readonly spend: "none" | "model" | "generation" | "render";
  readonly sideEffects: ReadonlyArray<{resource: ResourceKind; operations: ReadonlyArray<"create" | "update">}>;
  readonly preservation: ReadonlyArray<RecipePreservationRule["policy"]>;
  readonly mediaStrategies: ReadonlyArray<NonNullable<RecipeManifest["mediaPolicy"]>["defaultStrategy"]>;
  readonly idempotency: "revision_checked" | "semantic_upsert" | "read_only";
  readonly staleness: "input_fingerprint" | "resource_revision" | "none";
  /** A normal input port bound to the approval variable checked by this operation. */
  readonly approvalInput?: string;
}

export interface BoundRecipeOperation {
  readonly contract: RecipeOperationContract;
  readonly binding: OperationBinding;
}

export interface RecipeCompilationDiagnostic {
  readonly path: string;
  readonly message: string;
}

export type RecipeCompilationResult =
  | {readonly status: "ok"; readonly document: ApplicationDocument; readonly diagnostics: readonly []}
  | {readonly status: "error"; readonly diagnostics: ReadonlyArray<RecipeCompilationDiagnostic>};

/** Node/Script type vocabulary shared with normal Application variables. */
export const recipeInputType = (kind: RecipeInputKind): string => {
  if (kind === "text" || kind === "color") return "str";
  if (kind === "number") return "float";
  if (kind === "boolean") return "bool";
  return kind;
};

const inputWidgets: Partial<Record<RecipeInputKind, string>> = {
  text: "TextInput", number: "NumberInput", boolean: "Switch", image: "ImageInput",
  video: "VideoInput", audio: "AudioInput", color: "ColorInput", asset: "ResourcePicker",
  storyboard: "ResourcePicker", timeline: "ResourcePicker"
};
const widget = (type: string, id: string, props: Record<string, unknown>): unknown => ({type, props: {id, ...props}});
const constantMatches = (value: unknown, type: string): boolean => {
  if (type === "str") return typeof value === "string";
  if (type === "bool") return typeof value === "boolean";
  if (type === "float" || type === "int") return typeof value === "number" && Number.isFinite(value) && (type !== "int" || Number.isInteger(value));
  return value !== null && typeof value === "object";
};

/**
 * Compile authoring metadata into the same document the App Builder edits.
 * Supplied implementations are normal, concrete, pinned Application bindings.
 * No operation is invented or executed during compilation.
 */
export const compileRecipeApplication = (
  value: unknown,
  options: {readonly operations: ReadonlyArray<BoundRecipeOperation>; readonly title?: string}
): RecipeCompilationResult => {
  const diagnostics: RecipeCompilationDiagnostic[] = [];
  const error = (path: string, message: string): void => {diagnostics.push({path, message});};
  const inspected = inspectRecipeManifest(value);
  if (inspected.status !== "valid") {
    return {status: "error", diagnostics: [{path: "recipe.schemaVersion", message: inspected.status === "unsupported" ? `Unsupported Recipe version ${inspected.schemaVersion}.` : "Malformed or missing Recipe manifest."}]};
  }
  const recipe = inspected.manifest;
  const variables = new Map<string, VariableDeclaration>();
  const declare = (id: string, type: string, path: string, name = id): void => {
    const previous = variables.get(id);
    if (previous && previous.type?.type !== type) error(path, `Variable ${id} has conflicting types ${previous.type?.type} and ${type}.`);
    else if (!previous) variables.set(id, {id, name, type: {type}, scope: "instance", persist: false});
  };
  const selected: BoundRecipeOperation[] = [];
  const outputVariables = new Set<string>();
  const sourceVariables = new Set(recipe.inputs.map((input) => input.id));
  recipe.inputs.forEach((input, index) => {
    declare(input.id, recipeInputType(input.kind), `recipe.inputs[${index}]`, input.label);
    if (!inputWidgets[input.kind]) error(`recipe.inputs[${index}].kind`, `No supported widget strategy for ${input.kind}.`);
  });
  if (recipe.mediaPolicy?.defaultStrategy === "generated_video" && recipe.mediaPolicy.allowGeneratedVideo === false) error("recipe.mediaPolicy", "Generated video is forbidden by this Recipe.");
  recipe.operations.forEach((spec, index) => {
    const path = `recipe.operations[${index}]`;
    if (spec.strategy === "agentic" && !spec.model) error(`${path}.model`, "An agentic Application operation requires an explicit provider and model ID.");
    const matches = options.operations.filter(({contract, binding}) => contract.id === spec.intent && contract.version === (spec.version ?? 1) && binding.id === spec.bindingId);
    if (matches.length !== 1) {
      error(path, `Expected one concrete binding for ${spec.intent}@${spec.version ?? 1} (${spec.bindingId}), found ${matches.length}.`);
      return;
    }
    const implementation = matches[0];
    const {binding, contract} = implementation;
    const target = operationTarget(binding);
    if (target.kind === "script" ? !target.scriptId || !Number.isInteger(target.scriptVersion) || target.scriptVersion < 1 : !target.workflowId || !Number.isInteger(target.workflowVersion) || (target.workflowVersion ?? 0) < 1) error(path, "The concrete operation must name an existing target and pin a positive target version.");
    if (!Number.isInteger(contract.version) || contract.version < 1) error(path, "Operation contract version must be positive.");
    const strategy = recipe.mediaPolicy?.defaultStrategy;
    if (strategy && !contract.mediaStrategies.includes(strategy)) error(path, `Operation ${spec.intent} does not support ${strategy}.`);
    for (const rule of recipe.preservationRules ?? []) {
      if (!contract.preservation.includes(rule.policy)) error(path, `Operation ${spec.intent} cannot guarantee ${rule.policy} for ${rule.inputId}.`);
    }
    for (const [port, metadata] of Object.entries(contract.inputs)) {
      const mapping = binding.inputs[port];
      if (!mapping && metadata.required) error(`${path}.inputs.${port}`, "Required operation input is unbound.");
      if (mapping?.from === "widget") error(`${path}.inputs.${port}`, "Compiled operations require explicit variable, constant or resource mappings.");
      if (mapping?.from === "resource") error(`${path}.inputs.${port}`, "A resource mapping requires an explicitly supplied resource binding; use a typed Recipe input variable.");
      if (mapping?.from === "constant" && !constantMatches(mapping.value, metadata.type)) error(`${path}.inputs.${port}`, `Constant must have operation input type ${metadata.type}.`);
      if (mapping?.from === "variable") declare(mapping.variableId, metadata.type, `${path}.inputs.${port}`);
      if (mapping?.from === "variable" && metadata.required && !sourceVariables.has(mapping.variableId) && !outputVariables.has(mapping.variableId) && recipe.defaults?.[mapping.variableId] === undefined) error(`${path}.inputs.${port}`, `Required variable ${mapping.variableId} has no Recipe input, default or operation output producer.`);
    }
    for (const port of Object.keys(binding.inputs)) if (!contract.inputs[port]) error(`${path}.inputs.${port}`, "Mapped input is absent from the operation contract.");
    for (const [port, mapping] of Object.entries(binding.outputs)) {
      const metadata = contract.outputs[port];
      if (!metadata) error(`${path}.outputs.${port}`, "Mapped output is absent from the operation contract.");
      else if (mapping.to === "variable") declare(mapping.variableId, metadata.type, `${path}.outputs.${port}`);
    }
    for (const [port, metadata] of Object.entries(contract.outputs)) if (metadata.required && !binding.outputs[port]) error(`${path}.outputs.${port}`, "Required operation output is unbound.");
    if (contract.spend !== "none" && !contract.approvalInput) error(path, "Spend operations require a separately bound approval input.");
    if (contract.approvalInput) {
      const approval = binding.inputs[contract.approvalInput];
      if (!approval || approval.from !== "variable" || contract.inputs[contract.approvalInput]?.type !== "str") error(path, "Approval must be a string input bound to an Application variable.");
      if (contract.staleness === "none") error(path, "Approval operations must reject stale production inputs or resource revisions.");
    }
    selected.push(implementation);
    for (const mapping of Object.values(binding.outputs)) if (mapping.to === "variable") outputVariables.add(mapping.variableId);
  });
  for (const [id, initial] of Object.entries(recipe.defaults ?? {})) {
    const variable = variables.get(id);
    if (!variable) {error(`recipe.defaults.${id}`, "Default references an undeclared input or operation state variable."); continue;}
    const type = variable.type?.type;
    if ((type === "str" && typeof initial !== "string") || (type === "bool" && typeof initial !== "boolean") || ((type === "int" || type === "float") && (typeof initial !== "number" || !Number.isFinite(initial) || (type === "int" && !Number.isInteger(initial))))) error(`recipe.defaults.${id}`, `Default must have variable type ${type}.`);
    variable.default = structuredClone(initial);
  }
  for (const [index, input] of recipe.inputs.entries()) {
    if (input.choices && variables.get(input.id)?.default !== undefined && !input.choices.some((choice) => choice.value === variables.get(input.id)?.default)) error(`recipe.inputs[${index}].choices`, "Default must name a declared choice.");
  }
  for (const [index, shot] of (recipe.creativeStrategy?.shots ?? []).entries()) {
    for (const [elementIndex, element] of shot.elements.entries()) {
      const input = recipe.inputs.find((candidate) => candidate.id === element.inputId);
      if (!input || (element.kind === "asset" && input.kind !== "image") || (element.kind === "text" && input.kind !== "text") || (element.kind === "shape" && input.kind !== "color")) error(`recipe.creativeStrategy.shots[${index}].elements[${elementIndex}]`, "Graphic kind must match an image, text or color source input.");
    }
  }
  if (recipe.creativeStrategy?.shots) {
    const visibleInputs = new Set(recipe.creativeStrategy.shots.flatMap((shot) => shot.elements.map((element) => element.inputId)));
    for (const rule of recipe.preservationRules ?? []) if (!visibleInputs.has(rule.inputId)) error("recipe.creativeStrategy.shots", `Protected input ${rule.inputId} has no visible semantic element.`);
  }
  for (const [index, output] of recipe.outputs.entries()) {
    const binding = output.binding ?? `var:${output.id}`;
    const operationPort = /^op:([^/]+)\/out:(.+)$/.exec(binding);
    const type = binding.startsWith("var:") ? variables.get(binding.slice(4))?.type?.type : operationPort ? selected.find(({binding: operation}) => operation.id === operationPort[1])?.contract.outputs[operationPort[2]]?.type : undefined;
    if (type && output.kind === "timeline" && type !== "timeline") error(`recipe.outputs[${index}]`, `Timeline output requires a timeline reference, received ${type}.`);
    if (type && output.kind === "storyboard" && type !== "storyboard" && type !== "str") error(`recipe.outputs[${index}]`, `Storyboard output requires a storyboard reference or ID, received ${type}.`);
    if (type && output.kind === "asset" && !["asset", "image", "video", "audio", "document", "str"].includes(type)) error(`recipe.outputs[${index}]`, `Asset output requires a media reference or URI, received ${type}.`);
  }
  const content: unknown[] = [];
  if (variables.has("step")) content.push(widget("Stepper", "steps", {binding: "var:step", steps: [{value: "inputs", title: "Inputs"}, {value: "review", title: "Plan and review"}, {value: "result", title: "Editable result"}], allowBack: true}));
  const resources: ApplicationDocument["resources"] = [];
  const emittedInputs = new Set<string>();
  const emitInput = (id: string): void => {
    if (emittedInputs.has(id)) return;
    const input = recipe.inputs.find((candidate) => candidate.id === id);
    if (!input) {error("recipe.presentation.groups", `Unknown input ${id}.`); return;}
    const type = input.choices ? "ChoiceCards" : inputWidgets[input.kind];
    if (!type) return;
    const props: Record<string, unknown> = {label: input.label, binding: `var:${input.id}`};
    if (input.choices) props.options = structuredClone(input.choices);
    if (type === "ResourcePicker" && (input.kind === "asset" || input.kind === "timeline" || input.kind === "storyboard")) {
      props.resourceBindingId = `input-${input.id}`;
      resources.push({id: `input-${input.id}`, name: input.label, kind: input.kind, scope: {}, operations: ["read"]});
    }
    content.push(widget(type, input.id, props)); emittedInputs.add(id);
  };
  for (const group of recipe.presentation?.groups ?? []) {
    content.push(widget("Heading", `group-${group.id}`, {text: group.title, level: "h2"}));
    group.inputIds.forEach(emitInput);
  }
  recipe.inputs.forEach((input) => emitInput(input.id));
  const approvalWidgets = new Set<string>();
  const displayedOutputs = new Set<string>();
  const emitOutput = (output: RecipeManifest["outputs"][number]): void => {
    if (displayedOutputs.has(output.id)) return;
    const type = output.kind === "timeline" ? "Timeline" : output.kind === "asset" ? "Download" : "Json";
    content.push(widget(type, `output-${output.id}`, {binding: output.binding ?? `var:${output.id}`, label: output.label ?? output.id}));
    displayedOutputs.add(output.id);
  };
  for (const {binding, contract} of selected) {
    if (contract.approvalInput) {
      const mapping = binding.inputs[contract.approvalInput];
      if (mapping?.from === "variable" && !approvalWidgets.has(mapping.variableId)) {
        content.push(widget("Approval", mapping.variableId, {binding: `var:${mapping.variableId}`, label: "Approve exact sources and copy", description: "Changing any input requires a new plan and approval."}));
        approvalWidgets.add(mapping.variableId);
      }
    }
    content.push(widget("Button", binding.id, {label: binding.name, disabledWhen: {binding: `op:${binding.id}/exec#running`, op: "notEmpty"}, events: [{trigger: "click", kind: "run", operationId: binding.id}]}));
    content.push(widget("Text", `${binding.id}-error`, {binding: `op:${binding.id}/exec#error`}));
    for (const output of recipe.outputs) {
      const readable = output.binding ?? `var:${output.id}`;
      if (readable.startsWith(`op:${binding.id}/out:`) || Object.values(binding.outputs).some((mapping) => mapping.to === "variable" && readable === `var:${mapping.variableId}`)) emitOutput(output);
    }
  }
  recipe.outputs.forEach(emitOutput);
  const document: ApplicationDocument = {schemaVersion: APP_SCHEMA_VERSION, recipe: structuredClone(recipe), variables: [...variables.values()], operations: selected.map(({binding}) => structuredClone(binding)), resources, ui: {root: {props: {title: options.title ?? recipe.slug}}, content}};
  for (const message of validateRecipeBindings(document)) error("recipe.bindings", message);
  if (diagnostics.length > 0) return {status: "error", diagnostics};
  if (content.some((entry) => !entry || typeof entry !== "object" || !("type" in entry) || typeof entry.type !== "string" || !isKnownWidget(entry.type))) return {status: "error", diagnostics: [{path: "application.ui", message: "Compiled Recipe contains an unsupported widget."}]};
  const parsed = parseApplicationDocument(document);
  if (!parsed) return {status: "error", diagnostics: [{path: "application", message: "Compiled Application failed normal document validation."}]};
  return {status: "ok", document: parsed, diagnostics: []};
};
