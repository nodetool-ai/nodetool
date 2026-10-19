/**
 * The half of an application document Puck does not own: its operations,
 * variables, and resource bindings.
 *
 * Until this existed the three lists were reachable only through the agent's
 * `ui_app_*` tools, so declaring a variable or binding a second workflow meant
 * asking the agent to do it. Every edit goes through app-runtime's `doc-ops`,
 * the same pure functions the agent tools and the CLI harness call, so both
 * paths produce identical documents.
 */
import React, { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import AddIcon from "@mui/icons-material/AddOutlined";
import {
  addOperation,
  addResource,
  declareVariable,
  removeOperation,
  removeResource,
  removeVariable,
  operationTarget,
  updateOperation,
  updateVariable,
  type AppDocMeta,
  type OperationBinding,
  type OperationPolicy,
  type ResourceBinding,
  type ResourceKind,
  type VariableDeclaration
} from "@nodetool-ai/app-runtime";

import { trpcClient } from "../../trpc/client";
import { workflowListQueryKey } from "../../serverState/workflowQueryKeys";
import {
  Box,
  Caption,
  Card,
  CollapsibleSection,
  DeleteButton,
  EditorButton,
  FlexColumn,
  FlexRow,
  LabeledSwitch,
  ScrollArea,
  SelectField,
  Text,
  TextInput,
  NumberField,
  BORDER_RADIUS,
  SPACING
} from "../ui_primitives";

interface AppDataPanelProps {
  meta: AppDocMeta;
  onChange: (next: AppDocMeta) => void;
  /** The workflow the builder opened with — the default for a new operation. */
  workflowId: string;
  workflowName?: string;
  /**
   * Project whose documents an "all of this kind" binding reaches. The form
   * never asks for it — the app already belongs to a project.
   */
  projectId?: string;
}

const TARGET_KIND_OPTIONS = [{ value: "workflow" }, { value: "script" }];

const POLICY_OPTIONS = [
  { value: "replace" },
  { value: "queue" },
  { value: "parallel" }
];

const SCOPE_OPTIONS = [{ value: "instance" }, { value: "user" }];

/**
 * The node-SDK type names a variable may declare. A variable is a typed slot,
 * not a free-form bag, so the list is closed — anything richer is a node.
 */
const TYPE_OPTIONS = [
  { value: "" },
  { value: "str" },
  { value: "float" },
  { value: "int" },
  { value: "bool" },
  { value: "list" },
  { value: "dict" }
];

const RESOURCE_KIND_OPTIONS: { value: ResourceKind }[] = [
  { value: "asset" },
  { value: "timeline" },
  { value: "storyboard" },
  { value: "sketch" }
];

const resourceKindKey = (kind: ResourceKind): string =>
  `i18n-cont-appbuilder-10.data.resourceKinds.${kind}`;

/** Sentinel: bind every document of this kind in the app's project. */
const ALL_OF_KIND = "__all__";

/** A row in one of the three lists: a bordered card with a delete affordance. */
const EntryCard: React.FC<{
  title: string;
  subtitle?: string;
  onDelete: () => void;
  deleteLabel: string;
  children: React.ReactNode;
}> = ({ title, subtitle, onDelete, deleteLabel, children }) => (
  <Card
    variant="outlined"
    padding="none"
    sx={{ p: SPACING.md, borderRadius: BORDER_RADIUS.md }}
  >
    <FlexColumn gap={SPACING.sm} fullWidth>
      <FlexRow
        align="center"
        justify="space-between"
        gap={SPACING.sm}
        fullWidth
      >
        <Box sx={{ minWidth: 0 }}>
          <Text size="small" weight={500} truncate>
            {title}
          </Text>
          {subtitle ? (
            <Caption color="secondary" sx={{ display: "block" }}>
              {subtitle}
            </Caption>
          ) : null}
        </Box>
        <DeleteButton onClick={onDelete} tooltip={deleteLabel} />
      </FlexRow>
      {children}
    </FlexColumn>
  </Card>
);

/** Keep a pinned-but-unlistable target selectable rather than rebinding it. */
const withPinned = (
  options: { label: string; value: string }[],
  value: string
): { label: string; value: string }[] =>
  !value || options.some((o) => o.value === value)
    ? options
    : [{ label: value, value }, ...options];

const OperationRow: React.FC<{
  operation: OperationBinding;
  workflowOptions: { label: string; value: string }[];
  scriptOptions: { label: string; value: string }[];
  defaultWorkflowId: string;
  onPatch: (patch: Partial<OperationBinding>) => void;
  onRemove: () => void;
}> = ({
  operation,
  workflowOptions,
  scriptOptions,
  defaultWorkflowId,
  onPatch,
  onRemove
}) => {
  const { t } = useTranslation();
  const target = operationTarget(operation);
  // Switching kind clears the mappings: they key on the old target's node ids
  // or port names, and none of them mean anything against the new one.
  const setKind = (kind: string) => {
    if (kind === target.kind) return;
    onPatch(
      kind === "script"
        ? {
            workflowId: "",
            target: { kind: "script", scriptId: "", scriptVersion: 0 },
            inputs: {},
            outputs: {}
          }
        : {
            workflowId: defaultWorkflowId,
            target: undefined,
            inputs: {},
            outputs: {}
          }
    );
  };
  return (
    <EntryCard
      title={operation.name || operation.id}
      subtitle={`id: ${operation.id}`}
      onDelete={onRemove}
      deleteLabel={t("i18n-cont-appbuilder-10.data.deleteOperation", {
        name: operation.name || operation.id
      })}
    >
      <TextInput
        label={t("i18n-cont-appbuilder-10.data.name")}
        value={operation.name}
        size="small"
        fullWidth
        onChange={(e) => onPatch({ name: e.target.value })}
      />
      <SelectField
        label={t("i18n-cont-appbuilder-10.data.runs")}
        value={target.kind}
        options={TARGET_KIND_OPTIONS.map((option) => ({
          ...option,
          label: t(`i18n-cont-appbuilder-10.data.targetKinds.${option.value}`)
        }))}
        onChange={setKind}
      />
      {target.kind === "script" ? (
        <SelectField
          label={t("i18n-cont-appbuilder-10.data.script")}
          value={target.scriptId}
          options={withPinned(scriptOptions, target.scriptId)}
          onChange={(value) =>
            onPatch({
              workflowId: "",
              target: { kind: "script", scriptId: value, scriptVersion: 0 },
              inputs: {},
              outputs: {}
            })
          }
        />
      ) : (
        <SelectField
          label={t("i18n-cont-appbuilder-10.data.workflow")}
          value={operation.workflowId}
          options={withPinned(workflowOptions, operation.workflowId)}
          onChange={(value) => onPatch({ workflowId: value })}
        />
      )}
      <SelectField
        label={t("i18n-cont-appbuilder-10.data.whileRunning")}
        value={operation.policy}
        options={POLICY_OPTIONS.map((option) => ({
          ...option,
          label: t(`i18n-cont-appbuilder-10.data.policies.${option.value}`)
        }))}
        onChange={(value) => onPatch({ policy: value as OperationPolicy })}
      />
      <NumberField
        label={t("i18n-cont-appbuilder-10.data.timeout")}
        unit="ms"
        min={0}
        value={operation.timeoutMs == null ? "" : String(operation.timeoutMs)}
        size="small"
        fullWidth
        onChange={(e) =>
          onPatch({
            timeoutMs:
              e.target.value === "" ? undefined : Number(e.target.value)
          })
        }
      />
    </EntryCard>
  );
};

export const parseVariableDefault = (
  raw: string,
  type: string | undefined,
  translate?: (key: string, type?: string) => string
): { value?: unknown; error?: string } => {
  const message = (key: string, fallback: string): string =>
    translate
      ? translate(
          `i18n-cont-appbuilder-10.data.validation.${key}`,
          key === "validJson" ? type : undefined
        )
      : fallback;
  if (raw === "") return {};
  if (!type || type === "str") return { value: raw };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (type === "bool" && typeof parsed !== "boolean") {
      return { error: message("boolean", "Enter true or false.") };
    }
    if ((type === "int" || type === "float") && typeof parsed !== "number") {
      return { error: message("number", "Enter a JSON number.") };
    }
    if (type === "int" && !Number.isInteger(parsed)) {
      return { error: message("integer", "Enter a whole number.") };
    }
    if (type === "list" && !Array.isArray(parsed)) {
      return {
        error: message("array", "Enter a JSON array, for example [1, 2].")
      };
    }
    if (
      type === "dict" &&
      (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
    ) {
      return {
        error: message(
          "object",
          'Enter a JSON object, for example {"key": "value"}.'
        )
      };
    }
    return { value: parsed };
  } catch {
    return { error: message("validJson", `Enter valid JSON for ${type}.`) };
  }
};

const formatVariableDefault = (
  value: unknown,
  type: string | undefined
): string => {
  if (value == null) return "";
  if (type && type !== "str") return JSON.stringify(value);
  return String(value);
};

const variableDefaultError = (
  value: unknown,
  type: string | undefined,
  translate?: (key: string, type?: string) => string
): string | undefined => {
  if (value == null || !type || type === "str") return undefined;
  return parseVariableDefault(JSON.stringify(value), type, translate).error;
};

const VariableRow: React.FC<{
  variable: VariableDeclaration;
  onPatch: (patch: Partial<VariableDeclaration>) => void;
  onRemove: () => void;
}> = ({ variable, onPatch, onRemove }) => {
  const { t } = useTranslation();
  const type = variable.type?.type;
  const translateValidation = (key: string, validationType?: string): string =>
    t(key, validationType ? { type: validationType } : undefined);
  const error = variableDefaultError(
    variable.default,
    type,
    translateValidation
  );
  return (
    <EntryCard
      title={variable.name || variable.id}
      subtitle={`var:${variable.id}`}
      onDelete={onRemove}
      deleteLabel={t("i18n-cont-appbuilder-10.data.deleteVariable", {
        name: variable.name || variable.id
      })}
    >
      <TextInput
        label={t("i18n-cont-appbuilder-10.data.name")}
        value={variable.name}
        size="small"
        fullWidth
        onChange={(e) => onPatch({ name: e.target.value })}
      />
      <SelectField
        label={t("i18n-cont-appbuilder-10.data.type")}
        value={variable.type?.type ?? ""}
        options={TYPE_OPTIONS.map((option) => ({
          ...option,
          label: t(
            `i18n-cont-appbuilder-10.data.variableTypes.${option.value || "any"}`
          )
        }))}
        onChange={(value) => onPatch({ type: value ? { type: value } : null })}
      />
      <TextInput
        label={t("i18n-cont-appbuilder-10.data.default")}
        value={formatVariableDefault(variable.default, type)}
        errorMessage={error}
        helperText={
          type && type !== "str"
            ? t("i18n-cont-appbuilder-10.data.useJsonForTypedValues")
            : undefined
        }
        size="small"
        fullWidth
        onChange={(e) => {
          const parsed = parseVariableDefault(
            e.target.value,
            type,
            translateValidation
          );
          if (!parsed.error) onPatch({ default: parsed.value });
        }}
      />
      <SelectField
        label={t("i18n-cont-appbuilder-10.data.scope")}
        value={variable.scope}
        options={SCOPE_OPTIONS.map((option) => ({
          ...option,
          label: t(`i18n-cont-appbuilder-10.data.scopes.${option.value}`)
        }))}
        onChange={(value) => onPatch({ scope: value as "instance" | "user" })}
      />
      <LabeledSwitch
        // The label associates through `htmlFor`, so the control needs an id.
        id={`persist-${variable.id}`}
        label={t("i18n-cont-appbuilder-10.data.rememberBetweenVisits")}
        checked={variable.persist}
        // doc-ops downgrades persist on an instance-scoped variable, so the
        // control says why it will not stick rather than letting it flip back.
        disabled={variable.scope !== "user"}
        onChange={(checked) => onPatch({ persist: checked })}
      />
      {variable.scope !== "user" ? (
        <Caption color="secondary">
          {t("i18n-cont-appbuilder-10.data.perUserRememberOnly")}
        </Caption>
      ) : null}
    </EntryCard>
  );
};

const ResourceRow: React.FC<{
  resource: ResourceBinding;
  onRemove: () => void;
}> = ({ resource, onRemove }) => {
  const { t } = useTranslation();
  return (
    <EntryCard
      title={resource.name || resource.id}
      subtitle={
        resource.scope.fixedId
          ? t(resourceKindKey(resource.kind))
          : t("i18n-cont-appbuilder-10.data.allResourceKinds", {
              kind: t(
                `i18n-cont-appbuilder-10.data.resourceKindsPlural.${resource.kind}`
              )
            })
      }
      onDelete={onRemove}
      deleteLabel={t("i18n-cont-appbuilder-10.data.deleteResource", {
        name: resource.name || resource.id
      })}
    >
      <Caption color="secondary">
        {t("i18n-cont-appbuilder-10.data.allowsOperations", {
          operations: resource.operations.join(", ")
        })}
      </Caption>
    </EntryCard>
  );
};

interface ResourceListItem {
  ref: { kind: ResourceKind; id: string };
  name: string;
}

/** Pick a document of the selected kind, or every document of that kind. */
const AddResourceForm: React.FC<{
  onAdd: (input: {
    name: string;
    kind: ResourceKind;
    fixedId?: string;
  }) => void;
}> = ({ onAdd }) => {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<ResourceKind>("asset");
  const [selectedId, setSelectedId] = useState(ALL_OF_KIND);

  const { data: items, isFetched } = useQuery({
    queryKey: ["app-data-panel-resources", kind],
    queryFn: async (): Promise<ResourceListItem[]> => {
      const listed = await trpcClient.resources.list.query({
        kind,
        limit: 50
      });
      return listed.map((item) => ({
        ref: { kind: item.ref.kind, id: item.ref.id },
        name: item.name
      }));
    },
    staleTime: 30_000
  });

  const documentOptions = useMemo(() => {
    const listed = (items ?? []).map((item) => ({
      value: item.ref.id,
      label: item.name || item.ref.id
    }));
    return [
      {
        value: ALL_OF_KIND,
        label: t("i18n-cont-appbuilder-10.data.allResourceKinds", {
          kind: t(`i18n-cont-appbuilder-10.data.resourceKindsPlural.${kind}`)
        })
      },
      ...listed
    ];
  }, [items, kind, t]);

  const setKindAndReset = useCallback((value: string) => {
    const next = RESOURCE_KIND_OPTIONS.find((option) => option.value === value);
    if (!next) return;
    setKind(next.value);
    setSelectedId(ALL_OF_KIND);
  }, []);

  const submit = useCallback(() => {
    const picked = (items ?? []).find((item) => item.ref.id === selectedId);
    const collection = selectedId === ALL_OF_KIND;
    if (!collection && !picked) return;
    onAdd({
      name:
        name.trim() ||
        (collection
          ? t("i18n-cont-appbuilder-10.data.resourceCollectionNames." + kind)
          : picked?.name || t(resourceKindKey(kind))),
      kind,
      fixedId: collection ? undefined : picked?.ref.id
    });
    setName("");
    setSelectedId(ALL_OF_KIND);
  }, [items, kind, name, onAdd, selectedId, t]);

  return (
    <FlexColumn gap={SPACING.sm} fullWidth>
      <TextInput
        label={t("i18n-cont-appbuilder-10.data.name")}
        value={name}
        size="small"
        fullWidth
        onChange={(e) => setName(e.target.value)}
      />
      <SelectField
        label={t("i18n-cont-appbuilder-10.data.kind")}
        value={kind}
        options={RESOURCE_KIND_OPTIONS.map((option) => ({
          ...option,
          label: t(resourceKindKey(option.value))
        }))}
        onChange={setKindAndReset}
      />
      <SelectField
        label={t(resourceKindKey(kind))}
        value={selectedId}
        options={documentOptions}
        onChange={setSelectedId}
      />
      {isFetched && (items ?? []).length === 0 ? (
        <Caption color="secondary">
          {t("i18n-cont-appbuilder-10.data.noResourcesYet", {
            kind: t(`i18n-cont-appbuilder-10.data.resourceKindsPlural.${kind}`)
          })}
        </Caption>
      ) : null}
      <EditorButton
        size="small"
        variant="outlined"
        startIcon={<AddIcon />}
        onClick={submit}
      >
        {t("i18n-cont-appbuilder-10.data.addResource")}
      </EditorButton>
    </FlexColumn>
  );
};

const AppDataPanel: React.FC<AppDataPanelProps> = ({
  meta,
  onChange,
  workflowId,
  workflowName,
  projectId = "default"
}) => {
  const { t } = useTranslation();
  const { data: workflows } = useQuery({
    queryKey: workflowListQueryKey(200),
    queryFn: () => trpcClient.workflows.list.query({ limit: 200 }),
    staleTime: 60_000
  });

  const workflowOptions = useMemo(() => {
    const listed = (workflows?.workflows ?? []).map((workflow) => ({
      label: workflow.name || workflow.id,
      value: workflow.id
    }));
    if (!workflowId || listed.some((o) => o.value === workflowId))
      return listed;
    return [
      { label: workflowName || workflowId, value: workflowId },
      ...listed
    ];
  }, [workflowId, workflowName, workflows]);

  const { data: scripts } = useQuery({
    queryKey: ["app-data-panel-js-scripts"],
    queryFn: () => trpcClient.jsScripts.list.query({}),
    staleTime: 60_000
  });

  const scriptOptions = useMemo(
    () =>
      (scripts ?? []).map((script) => ({
        label: script.name || script.id,
        value: script.id
      })),
    [scripts]
  );

  const addOp = useCallback(() => {
    if (!workflowId) return;
    onChange(
      addOperation(meta, {
        name: t("i18n-cont-appbuilder-10.data.operationName", {
          count: meta.operations.length + 1
        }),
        workflowId
      }).meta
    );
  }, [meta, onChange, workflowId, t]);

  const addVar = useCallback(() => {
    onChange(
      declareVariable(meta, {
        name: `variable_${meta.variables.length + 1}`,
        scope: "instance"
      }).meta
    );
  }, [meta, onChange]);

  const addRes = useCallback(
    (input: { name: string; kind: ResourceKind; fixedId?: string }) => {
      onChange(
        addResource(meta, {
          name: input.name,
          kind: input.kind,
          scope: input.fixedId ? { fixedId: input.fixedId } : { projectId }
        }).meta
      );
    },
    [meta, onChange, projectId]
  );

  return (
    <ScrollArea fullHeight>
      <FlexColumn gap={SPACING.lg} padding={SPACING.lg} fullWidth>
        <CollapsibleSection
          title={t("i18n-cont-appbuilder-10.data.operations")}
          defaultOpen
          compact
        >
          <FlexColumn gap={SPACING.md} fullWidth>
            <Caption color="secondary">
              {t("i18n-cont-appbuilder-10.data.operationsDescription")}
            </Caption>
            {meta.operations.map((operation) => (
              <OperationRow
                key={operation.id}
                operation={operation}
                workflowOptions={workflowOptions}
                scriptOptions={scriptOptions}
                defaultWorkflowId={workflowId}
                onPatch={(patch) =>
                  onChange(updateOperation(meta, operation.id, patch).meta)
                }
                onRemove={() =>
                  onChange(removeOperation(meta, operation.id).meta)
                }
              />
            ))}
            <EditorButton
              size="small"
              variant="outlined"
              startIcon={<AddIcon />}
              disabled={!workflowId}
              onClick={addOp}
            >
              {t("i18n-cont-appbuilder-10.data.addOperation")}
            </EditorButton>
          </FlexColumn>
        </CollapsibleSection>

        <CollapsibleSection
          title={t("i18n-cont-appbuilder-10.data.variables")}
          defaultOpen
          compact
        >
          <FlexColumn gap={SPACING.md} fullWidth>
            <Caption color="secondary">
              {t("i18n-cont-appbuilder-10.data.variablesDescription")}
            </Caption>
            {meta.variables.map((variable) => (
              <VariableRow
                key={variable.id}
                variable={variable}
                onPatch={(patch) =>
                  onChange(updateVariable(meta, variable.id, patch).meta)
                }
                onRemove={() =>
                  onChange(removeVariable(meta, variable.id).meta)
                }
              />
            ))}
            <EditorButton
              size="small"
              variant="outlined"
              startIcon={<AddIcon />}
              onClick={addVar}
            >
              {t("i18n-cont-appbuilder-10.data.addVariable")}
            </EditorButton>
          </FlexColumn>
        </CollapsibleSection>

        {/*
          CollapsibleSection defaults to open, so a section that starts closed
          has to say so — omitting the prop made the header click collapse it.
        */}
        <CollapsibleSection
          title={t("i18n-cont-appbuilder-10.data.resources")}
          defaultOpen={false}
          compact
        >
          <FlexColumn gap={SPACING.md} fullWidth>
            <Caption color="secondary">
              {t("i18n-cont-appbuilder-10.data.resourcesDescription")}
            </Caption>
            {meta.resources.map((resource) => (
              <ResourceRow
                key={resource.id}
                resource={resource}
                onRemove={() =>
                  onChange(removeResource(meta, resource.id).meta)
                }
              />
            ))}
            <AddResourceForm onAdd={addRes} />
          </FlexColumn>
        </CollapsibleSection>
      </FlexColumn>
    </ScrollArea>
  );
};

export default AppDataPanel;
