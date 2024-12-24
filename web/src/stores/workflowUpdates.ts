import {
  WorkflowAttributes,
  JobUpdate,
  Prediction,
  NodeProgress,
  NodeUpdate,
  AssetRef,
  Message
} from "./ApiTypes";
import useResultsStore from "./ResultsStore";
import { useNodeStore } from "./NodeStore";
import { useAssetStore } from "./AssetStore";
import useStatusStore from "./StatusStore";
import useLogsStore from "./LogStore";
import useErrorStore from "./ErrorStore";
import { devError } from "../utils/DevLog";
import useWorkflowRunner from "./WorkflowRunner";

export const handleUpdate = (
  workflow: WorkflowAttributes,
  data: JobUpdate | Prediction | NodeProgress | NodeUpdate | Message
) => {
  const runner = useWorkflowRunner.getState();
  const getAsset = useAssetStore.getState().get;
  const setResult = useResultsStore.getState().setResult;
  const findNode = useNodeStore.getState().findNode;
  const updateNode = useNodeStore.getState().updateNodeData;
  const setStatus = useStatusStore.getState().setStatus;
  const setLogs = useLogsStore.getState().setLogs;
  const setError = useErrorStore.getState().setError;
  const setProgress = useResultsStore.getState().setProgress;

  if (data.type === "job_update") {
    const job = data as JobUpdate;
    console.log(job);
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
    const node = findNode(update.node_id);
    if (!node) {
      devError("received message for deleted node", update.node_id);
      return;
    }

    if (update.error) {
      devError("WorkflowRunner update error", update.error);
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
        statusMessage: `${node.type} ${update.status}`
      });
      setLogs(workflow.id, update.node_id, update.logs || "");
      setStatus(workflow.id, update.node_id, update.status);
    }

    if (update.status === "completed") {
      setResult(workflow.id, update.node_id, update.result);

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
              devError(
                `WorkflowRunner: Asset id is null or undefined for key: ${key}`
              );
            }
          }
        });
      }
    }

    if (update.properties) {
      const nodeData = findNode(update.node_id)?.data;
      if (nodeData) {
        updateNode(update.node_id, {
          ...nodeData,
          properties: { ...nodeData.properties, ...update.properties }
        });
      }
    }
  }
};
