import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { Workflow } from "../../stores/ApiTypes";
import type { NodeMetadata } from "../../stores/ApiTypes";
import { formatGenericProviderName, isLocalProvider } from "../../utils/providerDisplay";
import { isRecord, isString } from "../../utils/typePredicates";

export interface EntryWorkflowLike {
  input_schema?: unknown;
  graph?: unknown;
  required_providers?: unknown;
  required_models?: unknown;
}

interface ModelRequirement {
  provider?: string;
  id: string;
  selected: boolean;
}

type CompatibilityUnknown =
  | "noInputsDeclared"
  | "inputRequirementsUnknown"
  | "requiredInputsUnknown"
  | "providerModelRequirementsUnknown"
  | "noModelSelected"
  | "providerUndeclared"
  | "credentialRequirementsUndeclared"
  | "runtimeRequirementsUnknown";

export interface EntryCompatibility {
  inputs: Array<{ name: string; required: boolean | null }>;
  providers: string[];
  selectedModels: ModelRequirement[];
  compatibleModels: ModelRequirement[];
  requiredSettings: string[];
  requiredRuntimes: string[];
  executionLocation: "localAndProviderHosted" | "local" | "providerHosted" | "unknown";
  unknowns: CompatibilityUnknown[];
}

const unique = <T extends string>(values: T[]): T[] => [...new Set(values)];

const stringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter(isString) : [];

const providerFromNodeType = (nodeType: string | undefined): string | undefined => {
  if (!nodeType || nodeType.startsWith("nodetool.")) {
    return undefined;
  }
  return nodeType.split(".")[0] || undefined;
};

const modelIdFromRecord = (value: Record<string, unknown>): string | undefined => {
  for (const key of ["id", "model", "model_id", "endpoint_id"]) {
    const candidate = value[key];
    if (isString(candidate) && candidate.trim()) {
      return candidate.trim();
    }
  }
  return undefined;
};

const addModel = (
  models: ModelRequirement[],
  id: string,
  provider: string | undefined,
  selected: boolean
): void => {
  const key = `${provider ?? ""}/${id}`;
  if (!models.some((model) => `${model.provider ?? ""}/${model.id}` === key)) {
    models.push({ id, provider, selected });
  }
};

const collectModelSelections = (
  value: unknown,
  providerHint: string | undefined,
  models: ModelRequirement[],
  keyHint = ""
): void => {
  if (Array.isArray(value)) {
    value.forEach((item) =>
      collectModelSelections(item, providerHint, models, keyHint)
    );
    return;
  }
  if (!isRecord(value)) {
    if (
      isString(value) &&
      (keyHint === "model" || keyHint.endsWith("_model") || keyHint === "model_id") &&
      value.trim()
    ) {
      addModel(models, value.trim(), providerHint, true);
    }
    return;
  }

  const provider = isString(value.provider) ? value.provider : providerHint;
  const id = modelIdFromRecord(value);
  if (id && (value.type === undefined || isString(value.type))) {
    addModel(models, id, provider, true);
  }

  for (const [key, child] of Object.entries(value)) {
    if (key === "provider" || key === "id" || key === "name" || key === "type") {
      continue;
    }
    collectModelSelections(child, provider, models, key);
  }
};

const inputNamesFromSchema = (
  schema: unknown
): Array<{ name: string; required: boolean | null }> | null => {
  if (!isRecord(schema) || !isRecord(schema.properties)) {
    return null;
  }
  const required = new Set(stringArray(schema.required));
  return Object.entries(schema.properties).map(([name, value]) => ({
    name:
      isRecord(value) && isString(value.title) && value.title.trim()
        ? value.title.trim()
        : name,
    required: required.has(name)
  }));
};

const graphNodes = (graph: unknown): Array<Record<string, unknown>> => {
  if (!isRecord(graph) || !Array.isArray(graph.nodes)) {
    return [];
  }
  return graph.nodes.filter(isRecord);
};

const inputNamesFromGraph = (
  workflows: EntryWorkflowLike[]
): Array<{ name: string; required: boolean | null }> => {
  const names: Array<{ name: string; required: boolean | null }> = [];
  for (const workflow of workflows) {
    for (const node of graphNodes(workflow.graph)) {
      const type = isString(node.type) ? node.type : "";
      const data = isRecord(node.data) ? node.data : null;
      if (!type.includes(".input.") || !data || !isString(data.name)) {
        continue;
      }
      const name = data.name.trim();
      if (name && !names.some((input) => input.name === name)) {
        names.push({ name, required: null });
      }
    }
  }
  return names;
};

const executionLocation = (
  providers: string[]
): EntryCompatibility["executionLocation"] => {
  const local = providers.some((provider) => isLocalProvider(provider));
  const remote = providers.some((provider) => !isLocalProvider(provider));
  if (local && remote) return "localAndProviderHosted";
  if (local) return "local";
  if (remote) return "providerHosted";
  return "unknown";
};

export const getWorkflowCompatibility = (
  workflow: Workflow | EntryWorkflowLike,
  metadata: Record<string, NodeMetadata>
): EntryCompatibility => {
  const workflows = [workflow];
  return getCompatibility(workflows, metadata);
};

const getCompatibility = (
  workflows: EntryWorkflowLike[],
  metadata: Record<string, NodeMetadata>
): EntryCompatibility => {
  const schemaInputs = workflows
    .map((workflow) => inputNamesFromSchema(workflow.input_schema))
    .filter((inputs): inputs is Array<{ name: string; required: boolean | null }> => inputs !== null);
  const inputs = schemaInputs.length
    ? schemaInputs.flat().filter(
        (input, index, all) => all.findIndex((candidate) => candidate.name === input.name) === index
      )
    : inputNamesFromGraph(workflows);

  const selectedModels: ModelRequirement[] = [];
  const compatibleModels: ModelRequirement[] = [];
  const providers: string[] = [];
  const requiredSettings: string[] = [];
  const requiredRuntimes: string[] = [];
  let missingMetadata = false;

  for (const workflow of workflows) {
    providers.push(...stringArray(workflow.required_providers));
    for (const model of stringArray(workflow.required_models)) {
      const slash = model.indexOf("/");
      addModel(
        selectedModels,
        slash > 0 ? model.slice(slash + 1) : model,
        slash > 0 ? model.slice(0, slash) : undefined,
        true
      );
    }

    for (const node of graphNodes(workflow.graph)) {
      const nodeType = isString(node.type) ? node.type : undefined;
      const nodeMetadata = nodeType ? metadata[nodeType] : undefined;
      if (!nodeMetadata) missingMetadata = true;
      if (nodeMetadata) {
        requiredSettings.push(...nodeMetadata.required_settings);
        requiredRuntimes.push(...nodeMetadata.required_runtimes ?? []);
        if (!selectedModels.length) {
          for (const model of nodeMetadata.recommended_models) {
            if (model.id) {
              addModel(
                compatibleModels,
                model.id,
                model.provider ?? undefined,
                false
              );
            }
          }
        }
      }
      collectModelSelections(
        node.data,
        providerFromNodeType(nodeType),
        selectedModels
      );
      collectModelSelections(
        node.dynamic_properties,
        providerFromNodeType(nodeType),
        selectedModels
      );
    }
  }

  const uniqueProviders = unique([
    ...providers,
    ...selectedModels.flatMap((model) => (model.provider ? [model.provider] : [])),
    ...compatibleModels.flatMap((model) => (model.provider ? [model.provider] : []))
  ]);
  const unknowns: CompatibilityUnknown[] = [];
  if (!inputs.length) {
    unknowns.push(
      workflows.some((workflow) => workflow.graph)
        ? "noInputsDeclared"
        : "inputRequirementsUnknown"
    );
  } else if (inputs.some((input) => input.required === null)) {
    unknowns.push("requiredInputsUnknown");
  }
  if (!selectedModels.length && !compatibleModels.length) {
    unknowns.push("providerModelRequirementsUnknown");
  } else if (!selectedModels.length) {
    unknowns.push("noModelSelected");
  }
  if (uniqueProviders.some((provider) => !provider.trim())) {
    unknowns.push("providerUndeclared");
  }
  if (uniqueProviders.some((provider) => !isLocalProvider(provider)) && !requiredSettings.length) {
    unknowns.push("credentialRequirementsUndeclared");
  }
  if (missingMetadata && !requiredRuntimes.length) {
    unknowns.push("runtimeRequirementsUnknown");
  }

  return {
    inputs,
    providers: uniqueProviders,
    selectedModels,
    compatibleModels,
    requiredSettings: unique(requiredSettings),
    requiredRuntimes: unique(requiredRuntimes),
    executionLocation: executionLocation(uniqueProviders),
    unknowns: unique(unknowns)
  };
};

interface CompatibilityDetailsProps {
  compatibility: EntryCompatibility;
}

export const CompatibilityDetails = ({
  compatibility
}: CompatibilityDetailsProps): ReactNode => {
  const { t } = useTranslation();
  const translateModel = (model: ModelRequirement): string => {
    const provider = model.provider
      ? formatGenericProviderName(model.provider)
      : t("pass3_19.portal.compatibility.unknownProvider");
    return `${provider} / ${model.id}`;
  };
  const locationLabels: Record<EntryCompatibility["executionLocation"], string> = {
    localAndProviderHosted: t("pass3_19.portal.compatibility.execution.localAndProviderHosted"),
    local: t("pass3_19.portal.compatibility.execution.local"),
    providerHosted: t("pass3_19.portal.compatibility.execution.providerHosted"),
    unknown: t("pass3_19.portal.compatibility.execution.unknown")
  };
  const inputLabel = compatibility.inputs.length
    ? compatibility.inputs
        .map((input) =>
          input.required === true
            ? t("pass3_19.portal.compatibility.inputs.required", { name: input.name })
            : input.required === false
              ? t("pass3_19.portal.compatibility.inputs.optional", { name: input.name })
              : t("pass3_19.portal.compatibility.inputs.requirementUnknown", {
                  name: input.name
                })
        )
        .join(", ")
    : t("pass3_19.portal.compatibility.inputs.noneDeclared");
  const providerModelLabel = compatibility.selectedModels.length
    ? compatibility.selectedModels.map(translateModel).join(", ")
    : compatibility.compatibleModels.length
      ? t("pass3_19.portal.compatibility.models.notSelected", {
          models: compatibility.compatibleModels.map(translateModel).join(", ")
        })
      : compatibility.providers.length
        ? compatibility.providers.map(formatGenericProviderName).join(", ")
        : null;

  const details = [
    t("pass3_19.portal.compatibility.details.inputs", { value: inputLabel }),
    providerModelLabel
      ? t("pass3_19.portal.compatibility.details.providerModel", {
          value: providerModelLabel
        })
      : null,
    compatibility.executionLocation === "unknown"
      ? null
      : t("pass3_19.portal.compatibility.details.execution", {
          value: locationLabels[compatibility.executionLocation]
        }),
    compatibility.requiredSettings.length > 0
      ? t("pass3_19.portal.compatibility.details.requiredSetup", {
          value: compatibility.requiredSettings.join(", ")
        })
      : null,
    compatibility.requiredRuntimes.length > 0
      ? t("pass3_19.portal.compatibility.details.runtime", {
          value: compatibility.requiredRuntimes.join(", ")
        })
      : null
  ].filter((detail): detail is string => detail !== null);

  return (
    <span
      className="entry-compat"
      aria-label={t("pass3_19.portal.compatibility.ariaLabel")}
    >
      {details.map((detail) => (
        <span key={detail}>{detail}</span>
      ))}
    </span>
  );
};
