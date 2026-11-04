import { useState } from "react";
import { useNodes, useNodeStoreRef } from "../../contexts/NodeContext";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { useTorchExecutionStore } from "../../stores/TorchExecutionStore";
import {
  useTorchCapabilities,
  useTorchCancel,
  useTorchStart,
  useTorchStatus
} from "../../serverState/useTorchWorkflow";
import type { RouterInputs } from "../../trpc/client";
import {
  Dialog,
  FlexColumn,
  FlexRow,
  EditorButton,
  SelectField,
  TextInput,
  Text,
  CodeBlock,
  SPACING
} from "../ui_primitives";
import ErrorBanner from "../support/ErrorBanner";

type TorchInputs = NonNullable<RouterInputs["torch"]["start"]["inputs"]>;

export const parseTorchInputs = (raw: string): TorchInputs => {
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Inputs must be an object keyed by input name.");
  }
  const inputs: Array<[string, TorchInputs[string]]> = [];
  for (const [name, tensor] of Object.entries(parsed)) {
    if (
      typeof tensor !== "object" ||
      tensor === null ||
      !("shape" in tensor) ||
      !("values" in tensor) ||
      !Array.isArray(tensor.shape) ||
      !Array.isArray(tensor.values) ||
      !tensor.shape.every(
        (dimension: unknown) =>
          typeof dimension === "number" &&
          Number.isSafeInteger(dimension) &&
          dimension > 0
      ) ||
      !tensor.values.every(
        (value: unknown) => typeof value === "number" && Number.isFinite(value)
      )
    ) {
      throw new Error(
        `Input ${name} needs an integer shape and flat finite numeric values.`
      );
    }
    if (
      tensor.shape.reduce(
        (size: number, dimension: number) => size * dimension,
        1
      ) !== tensor.values.length
    ) {
      throw new Error(
        `Input ${name} has a different value count than its shape.`
      );
    }
    inputs.push([name, { shape: tensor.shape, values: tensor.values }]);
  }
  return Object.fromEntries(inputs);
};

interface TorchWorkflowPanelProps {
  workflowId: string;
}

const TorchWorkflowPanel = ({ workflowId }: TorchWorkflowPanelProps) => {
  const openWorkflowId = useTorchExecutionStore((state) => state.workflowId);
  const close = useTorchExecutionStore((state) => state.close);
  const workflow = useNodes((state) => state.workflow);
  const editGeneration = useNodes((state) => state.editGeneration);
  const [jobGeneration, setJobGeneration] = useState<number | null>(null);
  const nodeStore = useNodeStoreRef();
  const saveWorkflow = useWorkflowManager((state) => state.saveWorkflow);
  const updateWorkflow = useWorkflowManager((state) => state.updateWorkflow);
  const capabilities = useTorchCapabilities();
  const start = useTorchStart();
  const cancel = useTorchCancel();
  const [jobId, setJobId] = useState<string | null>(null);
  const [inputs, setInputs] = useState(() => {
    const execution = workflow.settings?.execution;
    return JSON.stringify(
      typeof execution === "object" &&
        execution !== null &&
        "inputs" in execution
        ? execution.inputs
        : {},
      null,
      2
    );
  });
  const [inputError, setInputError] = useState<string | null>(null);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const status = useTorchStatus(jobId);
  const execution = workflow.settings?.execution;
  const target =
    typeof execution === "object" &&
    execution !== null &&
    "target" in execution &&
    execution.target === "cuda"
      ? "cuda"
      : "cpu";
  const active =
    saving ||
    start.isPending ||
    status.data?.status === "scheduled" ||
    status.data?.status === "queued" ||
    status.data?.status === "running";
  const error =
    operationError ??
    capabilities.error?.message ??
    start.error?.message ??
    cancel.error?.message ??
    status.error?.message ??
    status.data?.error;

  const updateExecution = (patch: Record<string, unknown>): void => {
    const current = nodeStore.getState().workflow;
    const previousExecution = current.settings?.execution;
    const previous =
      typeof previousExecution === "object" && previousExecution !== null
        ? previousExecution
        : undefined;
    updateWorkflow({
      ...current,
      settings: {
        ...current.settings,
        execution: { ...previous, kind: "torch", version: 1, ...patch }
      }
    });
    nodeStore.getState().setWorkflowDirty(true);
  };

  const changeTarget = (value: string) => {
    if (value !== "cpu" && value !== "cuda") {
      return;
    }
    updateExecution({ target: value });
    setJobId(null);
  };

  const execute = async (action: "compile" | "run") => {
    setInputError(null);
    setOperationError(null);
    let tensors: TorchInputs;
    try {
      tensors = parseTorchInputs(inputs);
    } catch (failure) {
      setInputError(
        failure instanceof Error ? failure.message : "Invalid input JSON"
      );
      return;
    }
    try {
      setJobId(null);
      setSaving(true);
      updateExecution({ inputs: tensors });
      const generation = nodeStore.getState().editGeneration;
      await saveWorkflow(nodeStore.getState().getWorkflow());
      const updatedAt = nodeStore.getState().workflow.updated_at;
      const request: RouterInputs["torch"]["start"] = {
        workflow_id: workflowId,
        target,
        action
      };
      if (updatedAt) {
        request.expected_updated_at = updatedAt;
      }
      if (action === "run") {
        request.inputs = tensors;
      }
      const job = await start.mutateAsync(request);
      setJobGeneration(generation);
      setJobId(job.job_id);
    } catch (failure) {
      setOperationError(
        failure instanceof Error ? failure.message : "Torch operation failed"
      );
    } finally {
      setSaving(false);
    }
  };

  const stale = jobGeneration !== null && jobGeneration !== editGeneration;
  const signatures = nodeStore
    .getState()
    .nodes.filter((node) => node.type === "nodetool.torch.Input")
    .map((node) => ({
      name: node.data.properties.name,
      shape: node.data.properties.shape
    }));

  return (
    <Dialog
      open={openWorkflowId === workflowId}
      onClose={close}
      title="Torch workflow"
      fullWidth
      maxWidth="md"
    >
      <FlexColumn gap={SPACING.md}>
        <Text>
          Compile this tensor graph on this computer, then run it with the
          compiled Torch runtime.
        </Text>
        {capabilities.data && !capabilities.data.enabled && (
          <Text>
            {capabilities.data.reason ??
              "Local Torch compilation is unavailable."}
          </Text>
        )}
        <SelectField
          label="Device"
          value={target}
          onChange={changeTarget}
          disabled={active}
          options={[
            {
              value: "cpu",
              label: "CPU",
              disabled: !capabilities.data?.targets.includes("cpu")
            },
            {
              value: "cuda",
              label: "CUDA",
              disabled: !capabilities.data?.targets.includes("cuda")
            }
          ]}
        />
        <Text size="small">
          Inputs use float32 tensors. Supply each input by name with its
          declared shape and flat values.
        </Text>
        <CodeBlock language="input signatures">
          {JSON.stringify(signatures, null, 2)}
        </CodeBlock>
        <TextInput
          label="Tensor inputs (JSON)"
          value={inputs}
          onChange={(event) => {
            setInputs(event.target.value);
            setJobId(null);
          }}
          multiline
          minRows={4}
          maxRows={8}
          monospace
          disabled={active}
          errorMessage={inputError ?? undefined}
          helperText={'Example: {"x":{"shape":[2],"values":[1,2]}}'}
        />
        <FlexRow gap={SPACING.md}>
          <EditorButton
            onClick={() => void execute("compile")}
            disabled={
              !capabilities.data?.enabled ||
              !capabilities.data.targets.includes(target) ||
              active
            }
          >
            Compile
          </EditorButton>
          <EditorButton
            onClick={() => void execute("run")}
            disabled={
              !capabilities.data?.enabled ||
              !capabilities.data.targets.includes(target) ||
              active
            }
          >
            Compile and run
          </EditorButton>
          {jobId && active && (
            <EditorButton
              onClick={() => cancel.mutate(jobId)}
              disabled={cancel.isPending}
            >
              Cancel
            </EditorButton>
          )}
        </FlexRow>
        <Text role="status">
          {saving
            ? "Saving workflow"
            : start.isPending
              ? "Starting"
              : status.data
                ? `${status.data.status}: ${status.data.stage}`
                : capabilities.isPending
                  ? "Checking local compiler"
                  : "Ready"}
        </Text>
        {error && (
          <ErrorBanner
            report={{
              source: "operation-failure",
              summary: "Torch workflow failed",
              errorText: error
            }}
          >
            {error}
          </ErrorBanner>
        )}
        {stale && (
          <Text>
            The graph has changed since this job. Compile again to use your
            edits.
          </Text>
        )}
        {!stale && status.data?.outputs && (
          <>
            <Text>Outputs</Text>
            <CodeBlock language="json" copyable>
              {JSON.stringify(status.data.outputs, null, 2)}
            </CodeBlock>
          </>
        )}
        {!stale &&
          status.data?.status === "completed" &&
          !status.data.outputs && (
            <Text>
              Compilation completed. Run with tensor inputs to inspect outputs.
            </Text>
          )}
      </FlexColumn>
    </Dialog>
  );
};

export default TorchWorkflowPanel;
