/**
 * Screen for the chain-based mobile graph editor.
 *
 * Can be launched in two modes:
 * - New workflow (no params)
 * - Edit existing workflow (workflowId param)
 */

import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { RootStackParamList } from "../navigation/types";
import { useTheme } from "../hooks/useTheme";
import { useGraphEditorStore } from "../stores/GraphEditorStore";
import { apiService } from "../services/api";
import { ChainEditor } from "../components/graph_editor/ChainEditor";

type Props = NativeStackScreenProps<RootStackParamList, "GraphEditor">;

const GraphEditorScreen: React.FC<Props> = ({ route }) => {
  const { colors } = useTheme();
  const workflowId = route.params?.workflowId;
  const [loading, setLoading] = useState(!!workflowId);
  const [error, setError] = useState<string | null>(null);

  const loadWorkflow = useGraphEditorStore((s) => s.loadWorkflow);
  const newWorkflow = useGraphEditorStore((s) => s.newWorkflow);
  const fetchMetadata = useGraphEditorStore((s) => s.fetchMetadata);
  const allMetadata = useGraphEditorStore((s) => s.allMetadata);

  useEffect(() => {
    const init = async () => {
      try {
        // Ensure metadata is loaded
        let metadata = allMetadata;
        if (metadata.length === 0) {
          await fetchMetadata();
          metadata = useGraphEditorStore.getState().allMetadata;
        }

        if (workflowId) {
          // Load existing workflow
          const workflow = await apiService.getWorkflow(workflowId);
          if (workflow) {
            loadWorkflow(workflow, metadata);
          } else {
            setError("Workflow not found");
          }
        } else {
          // New workflow
          newWorkflow();
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load workflow"
        );
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [workflowId, loadWorkflow, newWorkflow, fetchMetadata, allMetadata]);

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
          Loading workflow...
        </Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <Ionicons name="warning-outline" size={48} color={colors.error} />
        <Text style={[styles.errorText, { color: colors.error }]}>
          {error}
        </Text>
      </View>
    );
  }

  return <ChainEditor />;
};

const styles = StyleSheet.create({
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
