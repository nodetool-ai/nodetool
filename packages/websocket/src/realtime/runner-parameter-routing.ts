import { createLogger } from "@nodetool/config";
import type { ActiveRealtimeJob } from "./command-handler-types.js";

const log = createLogger("nodetool.websocket.realtime-parameter-routing");

export interface RouteRealtimeParameterUpdatesRequest {
  activeJob: ActiveRealtimeJob | undefined;
  jobId: string;
  parameterUpdates: Record<string, unknown>;
  sessionId: string;
}

export interface RouteRealtimeParameterUpdatesResult {
  routedParameters: string[];
  unroutedParameters: string[];
}

export const routeRealtimeParameterUpdates = async ({
  activeJob,
  jobId,
  parameterUpdates,
  sessionId
}: RouteRealtimeParameterUpdatesRequest): Promise<RouteRealtimeParameterUpdatesResult> => {
  const routedParameters: string[] = [];
  const unroutedParameters: string[] = [];
  if (!activeJob) {
    return { routedParameters, unroutedParameters };
  }

  for (const [inputName, value] of Object.entries(parameterUpdates)) {
    try {
      const parameterResult = activeJob.runner.pushParameter
        ? await activeJob.runner.pushParameter(inputName, value)
        : { routed: false, nodeIds: [] };

      if (parameterResult.routed) {
        routedParameters.push(inputName);
        continue;
      }

      await activeJob.runner.pushInputValue(inputName, value);
      routedParameters.push(inputName);
    } catch (error) {
      log.warn("Failed to route realtime session parameter update", {
        sessionId,
        jobId,
        inputName,
        error: error instanceof Error ? error.message : String(error)
      });
      unroutedParameters.push(inputName);
    }
  }

  return { routedParameters, unroutedParameters };
};
