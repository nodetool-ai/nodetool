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
import { useQuery } from "@tanstack/react-query";
import AddIcon from "@mui/icons-material/Add";
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
  BORDER_RADIUS,
  SPACING
} from "../ui_primitives";

export interface AppDataPanelProps {
  meta: AppDocMeta;
  onChange: (next: AppDocMeta) => void;
  /** The workflow the builder opened with — the default for a new operation. */
  workflowId: string;
  workflowName?: string;
}

const TARGET_KIND_OPTIONS = [
  { label: "Workflow", value: "workflow" },
  { label: "JS script", value: "script" }
];

const POLICY_OPTIONS = [
  { label: "Replace running", value: "replace" },
  { label: "Queue behind", value: "queue" },
  { label: "Run in parallel", value: "parallel" }
];

const SCOPE_OPTIONS = [
  { label: "This session", value: "instance" },
  { label: "Per user", value: "user" }
];

/**
 * The node-SDK type names a variable may declare. A variable is a typed slot,
 * not a free-form bag, so the list is closed — anything richer is a node.
 */
const TYPE_OPTIONS = [
  { label: "Any", value: "" },
  { label: "Text", value: "str" },
  { label: "Number", value: "float" },
  { label: "Integer", value: "int" },
  { label: "True/false", value: "bool" },
  { label: "List", value: "list" },
  { label: "Record", value: "dict" }
];

const RESOURCE_KIND_OPTIONS: { label: string; value: ResourceKind }[] = [
  { label: "Asset", value: "asset" },
  { label: "Timeline", value: "timeline" },
  { label: "Storyboard", value: "storyboard" },
  { label: "Sketch", value: "sketch" }
];

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
      <FlexRow align="center" justify="space-between" gap={SPACING.sm} fullWidth>
        <Box sx={{ minWidth: 0 }}>
          <Text size="small" weight={600} truncate>
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
      deleteLabel={`Remove operation ${operation.name || operation.id}`}
    >
      <TextInput
        label="Name"
        value={operation.name}
        size="small"
        fullWidth
        onChange={(e) => onPatch({ name: e.target.value })}
      />
      <SelectField
        label="Runs"
        value={target.kind}
        options={TARGET_KIND_OPTIONS}
        onChange={setKind}
      />
      {target.kind === "script" ? (
        <SelectField
          label="Script"
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
          label="Workflow"
          value={operation.workflowId}
          options={withPinned(workflowOptions, operation.workflowId)}
          onChange={(value) => onPatch({ workflowId: value })}
        />
      )}
      <SelectField
        label="While one is running"
        value={operation.policy}
        options={POLICY_OPTIONS}
        onChange={(value) => onPatch({ policy: value as OperationPolicy })}
      />
      <TextInput
        label="Timeout (ms)"
        type="number"
        value={operation.timeoutMs == null ? "" : String(operation.timeoutMs)}
        size="small"
        fullWidth
        onChange={(e) =>
          onPatch({
            timeoutMs: e.target.value === "" ? undefined : Number(e.target.value)
          })
        }
      />
    </EntryCard>
  );
};

const VariableRow: React.FC<{
  variable: VariableDeclaration;
  onPatch: (patch: Partial<VariableDeclaration>) => void;
  onRemove: () => void;
}> = ({ variable, onPatch, onRemove }) => (
  <EntryCard
    title={variable.name || variable.id}
    subtitle={`var:${variable.id}`}
    onDelete={onRemove}
    deleteLabel={`Remove variable ${variable.name || variable.id}`}
  >
    <TextInput
      label="Name"
      value={variable.name}
      size="small"
      fullWidth
      onChange={(e) => onPatch({ name: e.target.value })}
    />
    <SelectField
      label="Type"
      value={variable.type?.type ?? ""}
      options={TYPE_OPTIONS}
      onChange={(value) => onPatch({ type: value ? { type: value } : null })}
    />
    <TextInput
      label="Default"
      value={variable.default == null ? "" : String(variable.default)}
      size="small"
      fullWidth
      onChange={(e) =>
        onPatch({ default: e.target.value === "" ? undefined : e.target.value })
      }
    />
    <SelectField
      label="Scope"
      value={variable.scope}
      options={SCOPE_OPTIONS}
      onChange={(value) => onPatch({ scope: value as "instance" | "user" })}
    />
    <LabeledSwitch
      // The label associates through `htmlFor`, so the control needs an id.
      id={`persist-${variable.id}`}
      label="Remember between visits"
      checked={variable.persist}
      // doc-ops downgrades persist on an instance-scoped variable, so the
      // control says why it will not stick rather than letting it flip back.
      disabled={variable.scope !== "user"}
      onChange={(checked) => onPatch({ persist: checked })}
    />
    {variable.scope !== "user" ? (
      <Caption color="secondary">Only per-user variables can be remembered.</Caption>
    ) : null}
  </EntryCard>
);

const ResourceRow: React.FC<{
  resource: ResourceBinding;
  onRemove: () => void;
}> = ({ resource, onRemove }) => (
  <EntryCard
    title={resource.name || resource.id}
    subtitle={`${resource.kind} · ${
      resource.scope.fixedId
        ? `pinned ${resource.scope.fixedId}`
        : `project ${resource.scope.projectId}`
    }`}
    onDelete={onRemove}
    deleteLabel={`Remove resource ${resource.name || resource.id}`}
  >
    <Caption color="secondary">
      Allows: {resource.operations.join(", ")}
    </Caption>
  </EntryCard>
);

/** The "add a resource binding" form — the one entry that needs a scope up front. */
const AddResourceForm: React.FC<{ onAdd: (input: {
  name: string;
  kind: ResourceKind;
  projectId: string;
}) => void }> = ({ onAdd }) => {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<ResourceKind>("asset");
  const [projectId, setProjectId] = useState("");

  const submit = useCallback(() => {
    if (!projectId.trim()) return;
    onAdd({ name: name.trim() || kind, kind, projectId: projectId.trim() });
    setName("");
    setProjectId("");
  }, [kind, name, onAdd, projectId]);

  return (
    <FlexColumn gap={SPACING.sm} fullWidth>
      <TextInput
        label="Name"
        value={name}
        size="small"
        fullWidth
        onChange={(e) => setName(e.target.value)}
      />
      <SelectField
        label="Kind"
        value={kind}
        options={RESOURCE_KIND_OPTIONS}
        onChange={(value) => setKind(value as ResourceKind)}
      />
      <TextInput
        label="Project id"
        value={projectId}
        size="small"
        fullWidth
        onChange={(e) => setProjectId(e.target.value)}
      />
      <EditorButton
        size="small"
        variant="outlined"
        startIcon={<AddIcon sx={{ fontSize: 16 }} />}
        disabled={!projectId.trim()}
        onClick={submit}
      >
        Add resource
      </EditorButton>
    </FlexColumn>
  );
};

const AppDataPanel: React.FC<AppDataPanelProps> = ({
  meta,
  onChange,
  workflowId,
  workflowName
}) => {
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
    if (!workflowId || listed.some((o) => o.value === workflowId)) return listed;
    return [{ label: workflowName || workflowId, value: workflowId }, ...listed];
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
        name: `Operation ${meta.operations.length + 1}`,
        workflowId
      }).meta
    );
  }, [meta, onChange, workflowId]);

  const addVar = useCallback(() => {
    onChange(
      declareVariable(meta, {
        name: `variable_${meta.variables.length + 1}`,
        scope: "instance"
      }).meta
    );
  }, [meta, onChange]);

  const addRes = useCallback(
    (input: { name: string; kind: ResourceKind; projectId: string }) => {
      onChange(
        addResource(meta, {
          name: input.name,
          kind: input.kind,
          scope: { projectId: input.projectId }
        }).meta
      );
    },
    [meta, onChange]
  );

  return (
    <ScrollArea fullHeight>
      <FlexColumn gap={SPACING.lg} padding={SPACING.lg} fullWidth>
        <CollapsibleSection title="Operations" defaultOpen compact>
          <FlexColumn gap={SPACING.md} fullWidth>
            <Caption color="secondary">
              The workflows and scripts this app runs. A Run action names one of
              these.
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
              startIcon={<AddIcon sx={{ fontSize: 16 }} />}
              disabled={!workflowId}
              onClick={addOp}
            >
              Add operation
            </EditorButton>
          </FlexColumn>
        </CollapsibleSection>

        <CollapsibleSection title="Variables" defaultOpen compact>
          <FlexColumn gap={SPACING.md} fullWidth>
            <Caption color="secondary">
              App state widgets read and write, and operation outputs can land in.
            </Caption>
            {meta.variables.map((variable) => (
              <VariableRow
                key={variable.id}
                variable={variable}
                onPatch={(patch) =>
                  onChange(updateVariable(meta, variable.id, patch).meta)
                }
                onRemove={() => onChange(removeVariable(meta, variable.id).meta)}
              />
            ))}
            <EditorButton
              size="small"
              variant="outlined"
              startIcon={<AddIcon sx={{ fontSize: 16 }} />}
              onClick={addVar}
            >
              Add variable
            </EditorButton>
          </FlexColumn>
        </CollapsibleSection>

        <CollapsibleSection title="Resources" compact>
          <FlexColumn gap={SPACING.md} fullWidth>
            <Caption color="secondary">
              Document collections a picker or gallery widget can browse.
            </Caption>
            {meta.resources.map((resource) => (
              <ResourceRow
                key={resource.id}
                resource={resource}
                onRemove={() => onChange(removeResource(meta, resource.id).meta)}
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
