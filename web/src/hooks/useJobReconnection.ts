import { useEffect, useRef } from "react";
import { useRunningJobs } from "./useRunningJobs";
import { getWorkflowRunnerStore } from "../stores/WorkflowRunner";
import { client } from "../stores/ApiClient";
import log from "loglevel";

/**
 * Hook to automatically reconnect to running jobs on app reload
 * This should be used at the app initialization level
 */
export const useJobReconnection = () => {
  const { data: runningJobs, isSuccess } = useRunningJobs();
  const hasReconnected = useRef(false);

  useEffect(() => {
    // Only reconnect once when the app loads
    if (
      !hasReconnected.current &&
      isSuccess &&
      runningJobs &&
      runningJobs.length > 0
    ) {
      hasReconnected.current = true;

      log.info(
        `Found ${runningJobs.length} running job(s), reconnecting...`,
        runningJobs
      );

      // Reconnect to each running job
      const reconnectJobs = async () => {
        await Promise.all(
          runningJobs.map(async (job) => {
            try {
              log.debug("JobReconnection: processing job", job);
              // Fetch the workflow for this job
              const { data: workflow, error } = await client.GET(
                "/api/workflows/{id}",
                {
                  params: {
                    path: { id: job.workflow_id }
                  }
                }
              );

              if (error || !workflow) {
                log.error(
                  `Failed to fetch workflow ${job.workflow_id} for job ${job.id}:`,
                  error
                );
                return;
              }

              log.debug("JobReconnection: fetched workflow", workflow);
              // Get the workflow runner store for this workflow
              const runnerStore = getWorkflowRunnerStore(job.workflow_id);

              // Determine initial state from job's run_state
              const runState = (job as any).run_state;
              let initialState: "running" | "paused" | "suspended" | undefined;
              if (runState?.status === "suspended") {
                initialState = "suspended";
              } else if (runState?.status === "paused") {
                initialState = "paused";
              } else {
                initialState = "running";
              }

              // Reconnect with workflow context and initial state
              await runnerStore.getState().reconnectWithWorkflow(job.id, workflow);

              // Set proper state after reconnection based on run_state
              if (initialState && initialState !== "running") {
                runnerStore.setState({
                  state: initialState,
                  statusMessage:
                    runState?.suspension_reason ||
                    (initialState === "suspended"
                      ? "Workflow suspended"
                      : "Workflow paused")
                });
              }

              log.info(
                `Reconnected to job ${job.id} for workflow ${workflow.name} (state: ${initialState})`
              );
            } catch (error) {
              log.error(`Error reconnecting to job ${job.id}:`, error);
            }
          })
        );
      };

      reconnectJobs();
    }
  }, [runningJobs, isSuccess]);

  return {
    runningJobs,
    isReconnecting: isSuccess && runningJobs && runningJobs.length > 0
  };
};
