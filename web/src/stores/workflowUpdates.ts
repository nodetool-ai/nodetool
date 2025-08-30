import {
  WorkflowAttributes,
  JobUpdate,
  Prediction,
  NodeProgress,
  NodeUpdate,
  TaskUpdate,
  ToolCallUpdate,
  PlanningUpdate,
  OutputUpdate,
  PreviewUpdate
} from "./ApiTypes";
import useResultsStore from "./ResultsStore";
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
  const setResult = useResultsStore.getState().setResult;
  const setStatus = useStatusStore.getState().setStatus;
  const setLogs = useLogsStore.getState().setLogs;
  const setError = useErrorStore.getState().setError;
  const setProgress = useResultsStore.getState().setProgress;
  const setPreview = useResultsStore.getState().setPreview;
  const setTask = useResultsStore.getState().setTask;
  const setToolCall = useResultsStore.getState().setToolCall;
  const setPlanningUpdate = useResultsStore.getState().setPlanningUpdate;

  console.log("handleUpdate", data);

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

  if (data.type === "output_update") {
    const update = data as OutputUpdate;
    const assetTypes = ["image", "audio", "video", "document"];
    if (update.output_type === "string") {
      // String updates are handled in WorkflowChatStore directly
    } else if (assetTypes.includes(update.output_type)) {
      const value = update.value as { uri: string; data: Uint8Array };
      setResult(
        workflow.id,
        update.node_id,
        {
          output: {
            type: update.output_type,
            uri: value.uri,
            data: value.data
          }
        },
        true
      );
    } else {
      setResult(
        workflow.id,
        update.node_id,
        {
          output: update.value
        },
        true
      );
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

  if (data.type === "preview_update") {
    const preview = data as PreviewUpdate;
    setPreview(workflow.id, preview.node_id, preview.value, true);
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
      if (update.logs) {
        setLogs(workflow.id, update.node_id, update.logs);
      }
      setStatus(workflow.id, update.node_id, update.status);
    }

    if (update.status === "completed") {
      setResult(workflow.id, update.node_id, update.result, true);

      // This should happen in output renderer.
      // if (update.result) {
      //   Object.entries(update.result).forEach(([key, value]) => {
      //     const ref = value as AssetRef;
      //     if (typeof ref === "object" && ref !== null && "asset_id" in ref) {
      //       const asset_id = ref.asset_id;
      //       if (asset_id) {
      //         getAsset(asset_id).then((res) => {
      //           if (res?.get_url) {
      //             ref.uri = res.get_url;
      //           }
      //           setResult(workflow.id, update.node_id, { [key]: ref });
      //         });
      //       } else {
      //         log.error(
      //           `WorkflowRunner: Asset id is null or undefined for key: ${key}`
      //         );
      //       }
      //     }
      //   });
      // }
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
