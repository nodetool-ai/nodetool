import { createLogger } from "@nodetool-ai/config";
import { Job, sweepInterruptedAppRuns } from "@nodetool-ai/models";
import { getInstanceId } from "./lib/instance-id.js";

const log = createLogger("nodetool.websocket.interrupted-jobs");

/**
 * Fail the job rows a previous process of this server left in flight.
 *
 * Runs once at startup. Every in-flight run lives in the process that started
 * it, so its row would otherwise stay `running` forever, and every editor open
 * would reattach to it. The sweep is scoped to rows this server owned. With an
 * instance id that is the rows stamped with it. Without one it is every row,
 * which is only sound when no peer shares the database, so a shared database
 * without an instance id is left alone.
 */
export async function sweepInterruptedJobs(
  processStartIso: string,
  options: { sharedDatabase: boolean }
): Promise<number> {
  const instanceId = getInstanceId();
  if (!instanceId && options.sharedDatabase) {
    log.info(
      "Skipping the interrupted-job sweep: the database may be shared and no instance id is set"
    );
    return 0;
  }
  const swept = await Job.sweepInterrupted(processStartIso, instanceId);
  await sweepInterruptedAppRuns(processStartIso, instanceId);
  if (swept.length > 0) {
    log.info("Failed jobs interrupted by a restart", { count: swept.length });
  }
  return swept.length;
}
