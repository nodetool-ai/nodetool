import { useEffect, useRef } from "react";
import log from "loglevel";
import { getWorkflowRunnerStore } from "../stores/WorkflowRunner";
import { trpcClient } from "../trpc/client";
import { useRunningJobs } from "./useRunningJobs";
import { Job, RunStateInfo } from "../stores/ApiTypes";

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
              const workflow = await trpcClient.workflows.get.query({
                id: job.workflow_id
              });

              if (!workflow) {
                log.error(
                  `Failed to fetch workflow ${job.workflow_id} for job ${job.id}`
                );
                return;
              }

              log.debug("JobReconnection: fetched workflow", workflow);
              // Get the workflow runner store for this workflow
              const runnerStore = getWorkflowRunnerStore(job.workflow_id);

              // Determine initial state from job's run_state
              // run_state may be present on enriched job objects even though JobResponse schema omits it
              const runState = (job as Job & { run_state?: RunStateInfo | null }).run_state;
              let initialState: "running" | "paused" | "suspended" | undefined;
              if (runState?.status === "suspended") {
                initialState = "suspended";
              } else if (runState?.status === "paused") {
                initialState = "paused";
              } else {
                initialState = "running";
              }

              // Reconnect with workflow context and initial state
              await runnerStore.getState().reconnectWithWorkflow(
                job.id,
                workflow as never
              );

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
