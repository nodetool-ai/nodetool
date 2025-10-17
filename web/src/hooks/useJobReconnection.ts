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
      runningJobs.forEach(async (job) => {
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

          // Reconnect with workflow context
          await runnerStore.getState().reconnectWithWorkflow(job.id, workflow);

          log.info(
            `Reconnected to job ${job.id} for workflow ${workflow.name}`
          );
        } catch (error) {
          log.error(`Error reconnecting to job ${job.id}:`, error);
        }
      });
    }
  }, [runningJobs, isSuccess]);

  return {
    runningJobs,
    isReconnecting: isSuccess && runningJobs && runningJobs.length > 0
  };
};
