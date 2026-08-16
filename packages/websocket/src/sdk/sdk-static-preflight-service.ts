import {
  estimateWorkflowCost,
  extractPricingParams,
  validateGraph,
  type CostEstimateInput,
  type GraphValidationInput,
  type GraphValidationRegistry
} from "@nodetool-ai/node-sdk";
import {
  sdkV1PreflightRequest,
  sdkV1PreflightSummary,
  type SdkV1PreflightRequest,
  type SdkV1PreflightSummary,
  type SdkV1Requirement,
  type SdkV1ValidationIssue
} from "@nodetool-ai/protocol/api-schemas/sdk-lifecycle-v1.js";
import {
  workflowInterfaceV1,
  type WorkflowInterfaceV1Response
} from "@nodetool-ai/protocol/api-schemas/workflows.js";

type PreflightRegistry = GraphValidationRegistry & {
  getMetadata: CostEstimateInput["getMetadata"];
};

export interface BuildSdkV1StaticPreflightOptions {
  request: SdkV1PreflightRequest;
  workflowInterface: WorkflowInterfaceV1Response;
  graph: GraphValidationInput;
  registry: PreflightRegistry;
  getModelPrice?: CostEstimateInput["getModelPrice"];
  quantities?: Readonly<Record<string, number>>;
  approvalThreshold?: number | null;
  /**
   * Resolves an explicit installed-package identity for a node type.
   * Returning null means the registry cannot authoritatively identify a
   * package. Implementations must not infer package ids from namespaces.
   */
  resolveNodePackageId?: (input: {
    nodeId: string;
    nodeType: string;
    metadata: ReturnType<PreflightRegistry["getMetadata"]>;
  }) => string | null;
}

export interface SdkV1RequirementAvailability {
  status: SdkV1Requirement["status"];
  message?: string | null;
  details?: SdkV1Requirement["details"];
}

export interface BuildSdkV1AvailabilityPreflightOptions extends Omit<
  BuildSdkV1StaticPreflightOptions,
  "request"
> {
  request: SdkV1PreflightRequest & { level: "availability" };
  resolveRequirement: (
    requirement: Readonly<SdkV1Requirement>
  ) => Promise<SdkV1RequirementAvailability> | SdkV1RequirementAvailability;
}

export interface SdkV1ExecutionReadiness {
  requirements: SdkV1Requirement[];
  issues: SdkV1ValidationIssue[];
}

export interface BuildSdkV1ExecutionPreflightOptions extends Omit<
  BuildSdkV1AvailabilityPreflightOptions,
  "request"
> {
  request: SdkV1PreflightRequest & { level: "execution" };
  probeExecutionReadiness: () =>
    | Promise<SdkV1ExecutionReadiness>
    | SdkV1ExecutionReadiness;
}

type InterfaceType = {
  type: string;
  optional?: boolean;
  values?: Array<string | number> | null;
  type_args?: InterfaceType[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function valueMatchesType(value: unknown, type: InterfaceType): boolean {
  if (value === null) {
    return type.optional === true;
  }

  switch (type.type) {
    case "any":
    case "object":
    case "union":
      return true;
    case "str":
    case "string":
      return (
        typeof value === "string" &&
        (!type.values || type.values.includes(value))
      );
    case "int":
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "float":
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "bool":
    case "boolean":
      return typeof value === "boolean";
    case "list":
    case "array": {
      if (!Array.isArray(value)) return false;
      const itemType = type.type_args?.[0];
      return (
        !itemType || value.every((item) => valueMatchesType(item, itemType))
      );
    }
    case "dict":
    case "map":
      return isRecord(value);
    case "image":
    case "audio":
    case "video":
    case "svg":
    case "text":
    case "asset":
      return typeof value === "string" || isRecord(value);
    default:
      // Named/custom structured types are intentionally validated by their
      // owning node at execution-level preflight. Static preflight only
      // rejects JSON kinds whose public meaning is unambiguous.
      return true;
  }
}

function validateInputs(
  request: SdkV1PreflightRequest,
  workflowInterface: WorkflowInterfaceV1Response
): SdkV1ValidationIssue[] {
  const issues: SdkV1ValidationIssue[] = [];
  const pins = new Map(workflowInterface.inputs.map((pin) => [pin.name, pin]));

  for (const inputName of Object.keys(request.inputs)) {
    if (!pins.has(inputName)) {
      issues.push({
        severity: "error",
        code: "unknown_input",
        message: `Workflow input "${inputName}" is not part of interface v1.`,
        node_id: null,
        pin_name: inputName
      });
    }
  }

  for (const pin of workflowInterface.inputs) {
    const provided = Object.hasOwn(request.inputs, pin.name);
    if (!provided) {
      if (pin.required && pin.default === null) {
        issues.push({
          severity: "error",
          code: "missing_input",
          message: `Required workflow input "${pin.name}" has no value.`,
          node_id: pin.node_id,
          pin_name: pin.name
        });
      }
      continue;
    }

    const value = request.inputs[pin.name];
    const pinType = pin.type as InterfaceType;
    if (!valueMatchesType(value, pinType)) {
      issues.push({
        severity: "error",
        code: "input_type_mismatch",
        message: `Workflow input "${pin.name}" does not match type "${pinType.type}".`,
        node_id: pin.node_id,
        pin_name: pin.name
      });
      continue;
    }

    if (typeof value === "number") {
      if (pin.min !== undefined && value < pin.min) {
        issues.push({
          severity: "error",
          code: "input_below_minimum",
          message: `Workflow input "${pin.name}" must be at least ${pin.min}.`,
          node_id: pin.node_id,
          pin_name: pin.name
        });
      }
      if (pin.max !== undefined && value > pin.max) {
        issues.push({
          severity: "error",
          code: "input_above_maximum",
          message: `Workflow input "${pin.name}" must be at most ${pin.max}.`,
          node_id: pin.node_id,
          pin_name: pin.name
        });
      }
    }
  }

  return issues;
}

const PROVIDER_MODEL_TYPES = new Set([
  "language_model",
  "image_model",
  "embedding_model",
  "tts_model",
  "asr_model",
  "video_model"
]);
const ASSET_REFERENCE_PATTERN =
  /(?:asset:\/\/|\/api\/storage\/)[A-Za-z0-9._~\-/]+/g;

function assetRequirementId(reference: string): string | null {
  let raw = reference;
  if (raw.startsWith("asset://")) {
    raw = raw.slice("asset://".length);
  } else if (raw.startsWith("/api/storage/")) {
    raw = raw.slice("/api/storage/".length);
  }
  raw = raw.split(/[?#]/)[0] ?? "";
  const slash = raw.lastIndexOf("/");
  const prefix = slash >= 0 ? raw.slice(0, slash + 1) : "";
  const lastSegment = slash >= 0 ? raw.slice(slash + 1) : raw;
  const withoutExtension = lastSegment.replace(/\.[^.]+$/, "");
  const id = `${prefix}${withoutExtension}`.trim();
  return id || null;
}

function deriveStaticRequirements(
  options: BuildSdkV1StaticPreflightOptions
): SdkV1Requirement[] {
  const requirements = new Map<string, SdkV1Requirement>();
  const add = (
    kind: SdkV1Requirement["kind"],
    id: string,
    details?: Record<string, unknown>
  ): void => {
    const normalizedId = id.trim();
    if (!normalizedId) return;
    const key = `${kind}:${normalizedId}`;
    const existing = requirements.get(key);
    const nodeIds = new Set<string>();
    const providerIds = new Set<string>();
    const modelTypes = new Set<string>();
    const collectIds = (target: Set<string>, value: unknown): void => {
      if (Array.isArray(value)) {
        for (const item of value) {
          if (typeof item === "string") target.add(item);
        }
      }
    };
    collectIds(nodeIds, existing?.details?.node_ids);
    collectIds(nodeIds, details?.node_ids);
    collectIds(providerIds, existing?.details?.provider_ids);
    collectIds(providerIds, details?.provider_ids);
    collectIds(modelTypes, existing?.details?.model_types);
    collectIds(modelTypes, details?.model_types);
    type MergedDetailsFields = {
      node_ids?: string[];
      provider_ids?: string[];
      model_types?: string[];
    };
    const mergedDetails: MergedDetailsFields = {};
    if (nodeIds.size > 0) {
      mergedDetails.node_ids = [...nodeIds].sort();
    }
    if (providerIds.size > 0) {
      mergedDetails.provider_ids = [...providerIds].sort();
    }
    if (modelTypes.size > 0) {
      mergedDetails.model_types = [...modelTypes].sort();
    }
    const requirement: SdkV1Requirement = {
      kind,
      id: normalizedId,
      name: normalizedId,
      status: "unknown",
      blocking: true,
      message: null
    };
    if (Object.keys(mergedDetails).length > 0) {
      requirement.details = mergedDetails;
    }
    requirements.set(key, requirement);
  };

  for (const node of options.graph.nodes ?? []) {
    const nodeId = String(node.id ?? "");
    const nodeType = String(node.type ?? "");
    if (!nodeType) continue;
    const metadata = options.registry.getMetadata(nodeType);

    const packageId = options.resolveNodePackageId?.({
      nodeId,
      nodeType,
      metadata
    });
    if (packageId) {
      add("node_pack", packageId, { node_ids: [nodeId] });
    }
    if (!metadata) continue;

    for (const setting of metadata.required_settings ?? []) {
      add("credential", setting, { node_ids: [nodeId] });
    }
    for (const runtime of metadata.required_runtimes ?? []) {
      add("runtime", runtime, { node_ids: [nodeId] });
    }

    const data = isRecord(node.data)
      ? node.data
      : isRecord(node.properties)
        ? node.properties
        : {};
    for (const property of metadata.properties ?? []) {
      if (!PROVIDER_MODEL_TYPES.has(property.type?.type ?? "")) continue;
      const value = data[property.name];
      if (!isRecord(value)) continue;
      if (typeof value.provider === "string") {
        add("provider", value.provider, { node_ids: [nodeId] });
      }
      if (typeof value.id === "string") {
        type DetailsFields = {
          node_ids: string[];
          model_types: (string | undefined)[];
          provider_ids?: string[];
        };
        const details: DetailsFields = {
          node_ids: [nodeId],
          model_types: [property.type?.type]
        };
        if (typeof value.provider === "string") {
          details.provider_ids = [value.provider];
        }
        add("model", value.id, details);
      }
    }
  }

  const visitInput = (value: unknown): void => {
    if (typeof value === "string") {
      for (const reference of value.match(ASSET_REFERENCE_PATTERN) ?? []) {
        const id = assetRequirementId(reference);
        if (id) add("asset", id);
      }
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) visitInput(item);
      return;
    }
    if (!isRecord(value)) return;
    if (typeof value.asset_id === "string") {
      add("asset", value.asset_id);
    }
    for (const nested of Object.values(value)) visitInput(nested);
  };
  for (const value of Object.values(options.request.inputs)) visitInput(value);

  return [...requirements.values()].sort(
    (left, right) =>
      left.kind.localeCompare(right.kind) || left.id.localeCompare(right.id)
  );
}

function costSummary(
  options: BuildSdkV1StaticPreflightOptions
): SdkV1PreflightSummary["cost"] {
  const nonBillablePrefixes = [
    "nodetool.input.",
    "nodetool.output.",
    "nodetool.constant.",
    "nodetool.math.",
    "nodetool.string.",
    "nodetool.dictionary."
  ];
  const nodes = (options.graph.nodes ?? [])
    .map((node) => ({
      id: String(node.id ?? ""),
      type: String(node.type ?? ""),
      data: isRecord(node.data)
        ? node.data
        : isRecord(node.properties)
          ? node.properties
          : undefined
    }))
    // These built-in namespaces are graph plumbing or deterministic local
    // value transforms. Keep the allowlist deliberately narrow: an unpriced
    // provider-facing node must remain visible as unknown.
    .filter(
      (node) =>
        !nonBillablePrefixes.some((prefix) => node.type.startsWith(prefix))
    );
  const estimate = estimateWorkflowCost({
    nodes,
    // NodeRegistry.getMetadata is an instance method. Preserve its receiver;
    // passing the method reference directly fails against the production
    // registry even though simple test doubles often happen to work.
    getMetadata: (nodeType) => options.registry.getMetadata(nodeType),
    getModelPrice: options.getModelPrice,
    // What each node states about its job — a per-second model prices the
    // duration asked for instead of one second.
    getParams: (node) => extractPricingParams(node.data),
    quantities: options.quantities ? { ...options.quantities } : undefined
  });
  const known = estimate.items.filter((item) => item.confidence !== "unknown");
  const confidence =
    estimate.items.length === 0
      ? "exact"
      : known.length === 0
        ? "unknown"
        : estimate.unknown_count > 0
          ? "partial"
          : known.every((item) => item.confidence === "exact")
            ? "exact"
            : "estimate";
  const threshold = options.approvalThreshold;

  return {
    amount: confidence === "unknown" ? null : estimate.total,
    currency: estimate.currency,
    confidence,
    unknown_cost_nodes: estimate.items
      .filter((item) => item.confidence === "unknown")
      .map((item) => item.node_id),
    approval_required:
      threshold != null && estimate.total > threshold
  };
}

/**
 * Runs side-effect-free static preflight against caller-supplied workflow
 * state. It performs no database, provider, worker, asset, or model-download
 * operations and is intentionally not exposed as a route yet.
 */
export function buildSdkV1StaticPreflight(
  options: BuildSdkV1StaticPreflightOptions
): SdkV1PreflightSummary {
  const request = sdkV1PreflightRequest.parse(options.request);
  const workflowInterface = workflowInterfaceV1.parse(
    options.workflowInterface
  );
  if (request.level !== "static") {
    throw new TypeError(
      'Static preflight service only accepts level "static".'
    );
  }

  const issues: SdkV1ValidationIssue[] = [];
  if (request.workflow_id !== workflowInterface.workflow_id) {
    issues.push({
      severity: "error",
      code: "workflow_id_mismatch",
      message: "The workflow interface does not match the requested workflow.",
      node_id: null,
      pin_name: null
    });
  }
  if (
    request.workflow_etag !== null &&
    request.workflow_etag !== workflowInterface.etag
  ) {
    issues.push({
      severity: "error",
      code: "workflow_etag_mismatch",
      message:
        "The workflow changed after the client discovered its interface.",
      node_id: null,
      pin_name: null
    });
  }

  issues.push(
    ...workflowInterface.diagnostics.map((issue) => ({
      severity: issue.severity,
      code: issue.code,
      message: issue.message,
      node_id: issue.node_id ?? null,
      pin_name: issue.pin_name ?? null
    })),
    ...validateInputs(request, workflowInterface)
  );

  const graphReport = validateGraph(options.graph, options.registry);
  for (const issue of graphReport.issues) {
    if (issue.severity === "info") continue;
    issues.push({
      severity: issue.severity,
      code: `graph_${issue.code}`,
      message: issue.message,
      node_id: issue.nodeId ?? null,
      pin_name: null
    });
  }

  return sdkV1PreflightSummary.parse({
    version: 1,
    level: "static",
    workflow_id: request.workflow_id,
    workflow_etag: workflowInterface.etag,
    runnable: !issues.some((issue) => issue.severity === "error"),
    issues,
    requirements: deriveStaticRequirements(options),
    cost: costSummary(options)
  });
}

/**
 * Resolves the requirements discovered by static preflight through
 * caller-supplied, read-only probes. Probe failures are redacted and treated
 * conservatively as unknown; no provider request, download, or job is started.
 */
export async function buildSdkV1AvailabilityPreflight(
  options: BuildSdkV1AvailabilityPreflightOptions
): Promise<SdkV1PreflightSummary> {
  const request = sdkV1PreflightRequest.parse(options.request);
  if (request.level !== "availability") {
    throw new TypeError(
      'Availability preflight service only accepts level "availability".'
    );
  }

  const staticSummary = buildSdkV1StaticPreflight({
    ...options,
    request: { ...request, level: "static" }
  });
  const requirements = await Promise.all(
    staticSummary.requirements.map(async (requirement) => {
      try {
        const availability = await options.resolveRequirement(requirement);
        const resolved: SdkV1Requirement = {
          ...requirement,
          status: availability.status,
          message: availability.message ?? null
        };
        if (availability.details !== undefined) {
          resolved.details = {
            ...requirement.details,
            ...availability.details
          };
        }
        return resolved;
      } catch {
        return {
          ...requirement,
          status: "unknown" as const,
          message: "Availability check failed."
        };
      }
    })
  );
  const requirementsReady = requirements.every(
    (requirement) => !requirement.blocking || requirement.status === "available"
  );

  return sdkV1PreflightSummary.parse({
    ...staticSummary,
    level: "availability",
    runnable: staticSummary.runnable && requirementsReady,
    requirements
  });
}

function mergeRequirements(
  left: readonly SdkV1Requirement[],
  right: readonly SdkV1Requirement[]
): SdkV1Requirement[] {
  const merged = new Map<string, SdkV1Requirement>();
  for (const requirement of [...left, ...right]) {
    merged.set(`${requirement.kind}:${requirement.id}`, requirement);
  }
  return [...merged.values()].sort(
    (a, b) => a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id)
  );
}

/**
 * Adds execution-target readiness to availability preflight. The injected
 * probe may inspect worker/capacity state but must not enqueue jobs, start
 * downloads, or contact paid providers.
 */
export async function buildSdkV1ExecutionPreflight(
  options: BuildSdkV1ExecutionPreflightOptions
): Promise<SdkV1PreflightSummary> {
  const request = sdkV1PreflightRequest.parse(options.request);
  if (request.level !== "execution") {
    throw new TypeError(
      'Execution preflight service only accepts level "execution".'
    );
  }

  const availability = await buildSdkV1AvailabilityPreflight({
    ...options,
    request: { ...request, level: "availability" }
  });

  let readiness: SdkV1ExecutionReadiness;
  try {
    readiness = await options.probeExecutionReadiness();
  } catch {
    readiness = {
      requirements: [
        {
          kind: "worker",
          id: "execution-target",
          name: "Execution target",
          status: "unknown",
          blocking: true,
          message: "Execution readiness check failed."
        }
      ],
      issues: []
    };
  }

  const requirements = mergeRequirements(
    availability.requirements,
    readiness.requirements
  );
  const issues = [...availability.issues, ...readiness.issues];
  const executionReady = requirements.every(
    (requirement) => !requirement.blocking || requirement.status === "available"
  );

  return sdkV1PreflightSummary.parse({
    ...availability,
    level: "execution",
    runnable:
      availability.runnable &&
      executionReady &&
      !issues.some((issue) => issue.severity === "error"),
    requirements,
    issues
  });
}
