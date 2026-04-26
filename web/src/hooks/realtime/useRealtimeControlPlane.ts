import { useCallback } from "react";
import type {
  RealtimeAnalysisEvent,
  RealtimeInferenceMetrics
} from "@nodetool/protocol";

import { useRealtimeSessionStore } from "../../stores/RealtimeSessionStore";
import {
  realtimeSessionClient,
  type RealtimeSignalPayload
} from "../../lib/websocket/RealtimeSessionClient";

export const useRealtimeControlPlane = () => {
  const sessions = useRealtimeSessionStore((state) => state.sessions);
  const metrics = useRealtimeSessionStore((state) => state.metrics);
  const inferenceMetrics = useRealtimeSessionStore(
    (state) => state.inferenceMetrics
  );
  const analysisEvents = useRealtimeSessionStore((state) => state.analysisEvents);
  const activeSessionId = useRealtimeSessionStore(
    (state) => state.activeSessionId
  );
  const isLoading = useRealtimeSessionStore((state) => state.isLoading);
  const error = useRealtimeSessionStore((state) => state.error);
  const hydrated = useRealtimeSessionStore((state) => state.hydrated);
  const hydrateSessions = useRealtimeSessionStore(
    (state) => state.hydrateSessions
  );
  const startSession = useRealtimeSessionStore((state) => state.startSession);
  const updateSession = useRealtimeSessionStore((state) => state.updateSession);
  const stopSession = useRealtimeSessionStore((state) => state.stopSession);
  const upsertSession = useRealtimeSessionStore((state) => state.upsertSession);
  const upsertMetrics = useRealtimeSessionStore((state) => state.upsertMetrics);
  const upsertInferenceMetrics = useRealtimeSessionStore(
    (state) => state.upsertInferenceMetrics
  );
  const appendAnalysisEvent = useRealtimeSessionStore(
    (state) => state.appendAnalysisEvent
  );
  const removeSession = useRealtimeSessionStore((state) => state.removeSession);
  const setActiveSession = useRealtimeSessionStore(
    (state) => state.setActiveSession
  );

  const signalSession = useCallback(
    (
      sessionId: string,
      workflowId: string | null,
      payload: RealtimeSignalPayload
    ) => realtimeSessionClient.signalSession(sessionId, workflowId, payload),
    []
  );

  const subscribeToSignals = useCallback(
    (
      sessionId: string,
      handler: Parameters<typeof realtimeSessionClient.subscribeToSignals>[1]
    ) => realtimeSessionClient.subscribeToSignals(sessionId, handler),
    []
  );

  const publishInferenceMetrics = useCallback(
    (nextMetrics: RealtimeInferenceMetrics) =>
      realtimeSessionClient.publishInferenceMetrics(nextMetrics),
    []
  );

  const publishAnalysisEvent = useCallback(
    (event: RealtimeAnalysisEvent) =>
      realtimeSessionClient.publishAnalysisEvent(event),
    []
  );

  return {
    sessions,
    metrics,
    inferenceMetrics,
    analysisEvents,
    activeSessionId,
    isLoading,
    error,
    hydrated,
    hydrateSessions,
    startSession,
    updateSession,
    stopSession,
    upsertSession,
    upsertMetrics,
    upsertInferenceMetrics,
    appendAnalysisEvent,
    removeSession,
    setActiveSession,
    signalSession,
    subscribeToSignals,
    publishInferenceMetrics,
    publishAnalysisEvent
  };
};
