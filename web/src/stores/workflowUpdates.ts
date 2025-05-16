import {
  WorkflowAttributes,
  JobUpdate,
  Prediction,
  NodeProgress,
  NodeUpdate,
  AssetRef,
  Message,
  TaskUpdate,
  ToolCallUpdate,
  Chunk,
  PlanningUpdate,
  OutputUpdate,
  ImageRef
} from "./ApiTypes";
import useResultsStore from "./ResultsStore";
import { useAssetStore } from "./AssetStore";
import useStatusStore from "./StatusStore";
import useLogsStore from "./LogStore";
import useErrorStore from "./ErrorStore";
import log from "loglevel";
import useWorkflowRunner from "./WorkflowRunner";
import { MsgpackData } from "./WorkflowChatStore";

export const handleUpdate = (
  workflow: WorkflowAttributes,
  data: MsgpackData
) => {
  const runner = useWorkflowRunner.getState();
  const getAsset = useAssetStore.getState().get;
  const setResult = useResultsStore.getState().setResult;
  const setStatus = useStatusStore.getState().setStatus;
  const setLogs = useLogsStore.getState().setLogs;
  const setError = useErrorStore.getState().setError;
  const setProgress = useResultsStore.getState().setProgress;
  const setTask = useResultsStore.getState().setTask;
  const addChunk = useResultsStore.getState().addChunk;
  const setToolCall = useResultsStore.getState().setToolCall;
  const setPlanningUpdate = useResultsStore.getState().setPlanningUpdate;

  if (data.type === "planning_update") {
    const planningUpdate = data as PlanningUpdate;
    if (planningUpdate.node_id) {
      setPlanningUpdate(workflow.id, planningUpdate.node_id, planningUpdate);
    } else {
      log.error("PlanningUpdate has no node_id");
    }
  }
  if (data.type === "tool_call_update") {
    const toolCall = data as ToolCallUpdate;
    if (toolCall.node_id) {
      setToolCall(workflow.id, toolCall.node_id, toolCall);
    } else {
      log.error("ToolCallUpdate has no node_id");
    }
  }

  if (data.type === "task_update") {
    const task = data as TaskUpdate;
    if (task.node_id) {
      setTask(workflow.id, task.node_id, task.task);
    } else {
      log.error("TaskUpdate has no node_id");
    }
  }

  if (data.type === "chunk") {
    const chunk = data as Chunk;
    if (chunk.node_id) {
      addChunk(workflow.id, chunk.node_id, chunk.content);
    } else {
      log.error("Chunk has no node_id");
    }
  }
  if (data.type === "output_update") {
    const update = data as OutputUpdate;
    const assetTypes = ["image", "audio", "video", "document"];
    if (update.output_type === "string") {
      addChunk(workflow.id, update.node_id, update.value as string);
    } else if (assetTypes.includes(update.output_type)) {
      setResult(
        workflow.id,
        update.node_id,
        {
          type: update.output_type,
          uri: "",
          data: (update.value as { data: Uint8Array }).data
        },
        true
      );
    } else {
      setResult(workflow.id, update.node_id, update.value, true);
    }
  }
  if (data.type === "job_update") {
    const job = data as JobUpdate;
    useWorkflowRunner.setState({
      state:
        job.status === "running" || job.status === "queued" ? "running" : "idle"
    });
    if (job.job_id) {
      useWorkflowRunner.setState({ job_id: job.job_id });
    }
    switch (job.status) {
      case "completed":
      case "cancelled":
      case "failed":
      case "timed_out":
        runner.addNotification({
          type: job.status === "failed" ? "error" : "info",
          alert: true,
          content: `Job ${job.status}${
            job.status === "failed" ? ` ${job.error || ""}` : ""
          }`,
          timeout: job.status === "failed" ? 30000 : undefined
        });
        runner.disconnect();
        break;
      case "queued":
        useWorkflowRunner.setState({
          statusMessage: "Worker is booting (may take a 15 seconds)..."
        });
        break;
      case "running":
        if (job.message) {
          runner.addNotification({
            type: "info",
            alert: true,
            content: job.message
          });
        }
        break;
    }
  }

  if (data.type === "prediction") {
    const pred = data as Prediction;
    setLogs(workflow.id, pred.node_id, pred.logs || "");
    if (pred.status === "booting") {
      setStatus(workflow.id, pred.node_id, "booting");
    }
  }

  if (data.type === "node_progress") {
    const progress = data as NodeProgress;
    setProgress(
      workflow.id,
      progress.node_id,
      progress.progress,
      progress.total
    );
  }

  if (data.type === "node_update") {
    const update = data as NodeUpdate;
    // const node = findNode(update.node_id);
    // if (!node) {
    //   log.error("received message for deleted node", update.node_id);
    //   return;
    // }

    if (update.error) {
      log.error("WorkflowRunner update error", update.error);
      runner.addNotification({
        type: "error",
        alert: true,
        content: update.error
      });
      useWorkflowRunner.setState({ state: "error" });
      setStatus(workflow.id, update.node_id, update.status);
      setError(workflow.id, update.node_id, update.error);
    } else {
      useWorkflowRunner.setState({
        statusMessage: `${update.node_name} ${update.status}`
      });
      setLogs(workflow.id, update.node_id, update.logs || "");
      setStatus(workflow.id, update.node_id, update.status);
    }

    if (update.status === "completed") {
      setResult(
        workflow.id,
        update.node_id,
        update.result,
        update.node_name === "Preview"
      );

      if (update.result) {
        Object.entries(update.result).forEach(([key, value]) => {
          const ref = value as AssetRef;
          if (typeof ref === "object" && ref !== null && "asset_id" in ref) {
            const asset_id = ref.asset_id;
            if (asset_id) {
              getAsset(asset_id).then((res) => {
                if (res?.get_url) {
                  ref.uri = res.get_url;
                }
                setResult(workflow.id, update.node_id, { [key]: ref });
              });
            } else {
              log.error(
                `WorkflowRunner: Asset id is null or undefined for key: ${key}`
              );
            }
          }
        });
      }
    }

    // if (update.properties) {
    //   const nodeData = findNode(update.node_id)?.data;
    //   if (nodeData) {
    //     updateNode(update.node_id, {
    //       ...nodeData,
    //       properties: { ...nodeData.properties, ...update.properties }
    //     });
    //   }
    // }
  }
};
