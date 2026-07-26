/**
 * Screen for the chain-based mobile graph editor.
 *
 * Can be launched in two modes:
 * - New workflow (no params)
 * - Edit existing workflow (workflowId param)
 *
 * A workflow is not an app: mini apps are their own resource, browsed in
 * `AppsScreen` and run in `AppScreen`. This screen only edits the graph.
 */

import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  ActivityIndicator,
  StyleSheet,
  Alert,
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

type Props = NativeStackScreenProps<RootStackParamList, "GraphEditor">;

const GraphEditorScreen: React.FC<Props> = ({ route, navigation }) => {
  const { colors } = useTheme();
  const workflowId = route.params?.workflowId;
  const [loading, setLoading] = useState(!!workflowId);
  const [error, setError] = useState<string | null>(null);
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
      <ChainEditor />
      <FloatingToolbar workflowId={workflowId} />
    </View>
  );
};

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
