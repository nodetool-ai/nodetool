/**
 * Screen for the chain-based mobile graph editor.
 *
 * Can be launched in two modes:
 * - New workflow (no params)
 * - Edit existing workflow (workflowId param)
 *
 * Includes a toggle to switch between the chain editor and the mini app runner.
 */

import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  ActivityIndicator,
  StyleSheet,
  Alert,
  FlatList,
} from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { RootStackParamList } from "../navigation/types";
import { useTheme } from "../hooks/useTheme";
import { useGraphEditorStore } from "../stores/GraphEditorStore";
import { normalizeWorkflow } from "../services/api";
import { trpc } from "../trpc/client";
import { ChainEditor } from "../components/graph_editor/ChainEditor";
import { FloatingToolbar } from "../components/graph_editor/FloatingToolbar";
import { Workflow } from "../types/miniapp";
import { useWorkflowRunner } from "../stores/WorkflowRunner";
import { WorkflowAppView } from "../components/app_runtime";

type Props = NativeStackScreenProps<RootStackParamList, "GraphEditor">;

type ViewMode = "editor" | "runner";

const GraphEditorScreen: React.FC<Props> = ({ route, navigation }) => {
  const { colors, shadows } = useTheme();
  const workflowId = route.params?.workflowId;
  const [loading, setLoading] = useState(!!workflowId);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("editor");
  const [workflow, setWorkflow] = useState<Workflow | null>(null);

  const loadWorkflowToStore = useGraphEditorStore((s) => s.loadWorkflow);
  const newWorkflow = useGraphEditorStore((s) => s.newWorkflow);
  const fetchMetadata = useGraphEditorStore((s) => s.fetchMetadata);
  const allMetadata = useGraphEditorStore((s) => s.allMetadata);
  const isDirty = useGraphEditorStore((s) => s.isDirty);

  const workflowQuery = trpc.workflows.get.useQuery(
    { id: workflowId ?? "" },
    { enabled: !!workflowId }
  );

  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      try {
        if (allMetadata.length === 0) {
          await fetchMetadata();
        }
        if (!workflowId && !cancelled) {
          newWorkflow();
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load workflow"
          );
          setLoading(false);
        }
      }
    };
    init();
    return () => {
      cancelled = true;
    };
  }, [workflowId, newWorkflow, fetchMetadata, allMetadata.length]);

  useEffect(() => {
    if (!workflowId) {
      return;
    }
    if (workflowQuery.error) {
      setError(workflowQuery.error.message || "Failed to load workflow");
      setLoading(false);
      return;
    }
    const wf = workflowQuery.data;
    if (wf && allMetadata.length > 0) {
      const normalized = normalizeWorkflow(wf);
      setWorkflow(normalized);
      loadWorkflowToStore(normalized, allMetadata);
      setLoading(false);
    }
  }, [
    workflowId,
    workflowQuery.data,
    workflowQuery.error,
    allMetadata,
    loadWorkflowToStore,
  ]);

  const handleToggleView = useCallback(() => {
    setViewMode((m) => (m === "editor" ? "runner" : "editor"));
  }, []);

  useEffect(() => {
    const title = workflow?.name || "Workflow Editor";
    navigation.setOptions({ title });
  }, [navigation, workflow]);

  // Warn before leaving with unsaved edits so a stray back-swipe can't
  // silently discard the workflow.
  useEffect(() => {
    const unsubscribe = navigation.addListener("beforeRemove", (e) => {
      if (!isDirty) {
        return;
      }
      e.preventDefault();
      Alert.alert(
        "Discard changes?",
        "You have unsaved changes to this workflow.",
        [
          { text: "Keep editing", style: "cancel" },
          {
            text: "Discard",
            style: "destructive",
            onPress: () => navigation.dispatch(e.data.action),
          },
        ]
      );
    });
    return unsubscribe;
  }, [navigation, isDirty]);

  if (loading) {
    return (
      <View style={[editorStyles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[editorStyles.loadingText, { color: colors.textSecondary }]}>
          Loading workflow...
        </Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[editorStyles.centered, { backgroundColor: colors.background }]}>
        <Ionicons name="warning-outline" size={48} color={colors.error} />
        <Text style={[editorStyles.errorText, { color: colors.error }]}>
          {error}
        </Text>
      </View>
    );
  }

  return (
    <View style={editorStyles.flex}>
      {viewMode === "runner" && workflowId && workflow ? (
        <MiniAppRunner workflowId={workflowId} workflow={workflow} />
      ) : (
        <ChainEditor />
      )}
      <FloatingToolbar
        workflowId={workflowId}
        viewMode={viewMode}
        onToggleView={handleToggleView}
      />
    </View>
  );
};

/**
 * The mini app for this workflow: its saved app document rendered with native
 * widgets, plus the execution log while a run is in flight.
 */
function MiniAppRunner({
  workflowId,
  workflow,
}: {
  workflowId: string;
  workflow: Workflow;
}) {
  const { colors } = useTheme();

  const runnerStore = useWorkflowRunner(workflowId);
  const state = runnerStore((s) => s.state);
  const statusMessage = runnerStore((s) => s.statusMessage);
  const logs = runnerStore((s) => s.logs);
  const cleanup = runnerStore((s) => s.cleanup);

  const isRunning = state === "running" || state === "connecting";

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return (
    <View style={runnerStyles.container}>
      <View style={runnerStyles.appSurface}>
        <WorkflowAppView workflow={workflow} />
      </View>
      {isRunning && (
        <View
          style={[
            runnerStyles.logPanel,
            { backgroundColor: colors.inputBg, borderColor: colors.border },
          ]}
        >
          {statusMessage ? (
            <Text style={[runnerStyles.statusText, { color: colors.primary }]}>
              {statusMessage}
            </Text>
          ) : null}
          <FlatList
            data={logs}
            keyExtractor={(_item: string, index: number) => `log-${index}`}
            renderItem={({ item: log }: { item: string }) => (
              <Text
                style={[runnerStyles.terminalText, { color: colors.textSecondary }]}
              >
                <Text style={{ color: colors.primary }}>{"> "}</Text>
                {log}
              </Text>
            )}
          />
        </View>
      )}
    </View>
  );
}

const runnerStyles = StyleSheet.create({
  container: {
    flex: 1,
  },
  appSurface: {
    flex: 1,
  },
  logPanel: {
    height: 160,
    padding: 12,
    borderTopWidth: 1,
  },
  statusText: {
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 8,
  },
  terminalText: {
    fontFamily: "monospace",
    fontSize: 12,
    marginBottom: 4,
    lineHeight: 18,
  },
});

const editorStyles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loadingText: {
    fontSize: 15,
    marginTop: 8,
  },
  errorText: {
    fontSize: 15,
    textAlign: "center",
    marginHorizontal: 32,
  },
});

export default GraphEditorScreen;
