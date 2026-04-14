/**
 * Screen for the chain-based mobile graph editor.
 *
 * Can be launched in two modes:
 * - New workflow (no params)
 * - Edit existing workflow (workflowId param)
 *
 * Includes a toggle to switch between the chain editor and the mini app runner.
 */

import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  FlatList,
} from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { RootStackParamList } from "../navigation/types";
import { useTheme } from "../hooks/useTheme";
import { useGraphEditorStore } from "../stores/GraphEditorStore";
import { apiService } from "../services/api";
import { ChainEditor } from "../components/graph_editor/ChainEditor";
import { Workflow, MiniAppResult } from "../types/miniapp";
import { useWorkflowRunner } from "../stores/WorkflowRunner";
import { useMiniAppInputs } from "../hooks/useMiniAppInputs";
import { PropertyRenderer } from "../components/properties";
import { MiniAppResults } from "../components/miniapps/MiniAppResults";

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

  useEffect(() => {
    const init = async () => {
      try {
        let metadata = allMetadata;
        if (metadata.length === 0) {
          await fetchMetadata();
          metadata = useGraphEditorStore.getState().allMetadata;
        }

        if (workflowId) {
          const wf = await apiService.getWorkflow(workflowId);
          if (wf) {
            setWorkflow(wf);
            loadWorkflowToStore(wf, metadata);
          } else {
            setError("Workflow not found");
          }
        } else {
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
  }, [workflowId, loadWorkflowToStore, newWorkflow, fetchMetadata, allMetadata]);

  useEffect(() => {
    const title = workflow?.name || "Workflow Editor";
    navigation.setOptions({
      title,
      headerRight: () =>
        workflowId ? (
          <View style={editorStyles.headerToggle}>
            <TouchableOpacity
              onPress={() => setViewMode("editor")}
              style={[
                editorStyles.toggleButton,
                viewMode === "editor" && { backgroundColor: colors.primary },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Editor view"
              accessibilityState={{ selected: viewMode === "editor" }}
            >
              <Ionicons
                name="git-network-outline"
                size={16}
                color={viewMode === "editor" ? "#fff" : colors.textSecondary}
              />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setViewMode("runner")}
              style={[
                editorStyles.toggleButton,
                viewMode === "runner" && { backgroundColor: colors.primary },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Runner view"
              accessibilityState={{ selected: viewMode === "runner" }}
            >
              <Ionicons
                name="play-outline"
                size={16}
                color={viewMode === "runner" ? "#fff" : colors.textSecondary}
              />
            </TouchableOpacity>
          </View>
        ) : null,
    });
  }, [navigation, workflow, workflowId, viewMode, colors]);

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

  if (viewMode === "runner" && workflowId && workflow) {
    return <MiniAppRunner workflowId={workflowId} workflow={workflow} />;
  }

  return <ChainEditor />;
};

/** Embedded mini app runner view */
function MiniAppRunner({
  workflowId,
  workflow,
}: {
  workflowId: string;
  workflow: Workflow;
}) {
  const { colors, shadows } = useTheme();

  const runnerStore = useWorkflowRunner(workflowId);
  const state = runnerStore((s) => s.state);
  const statusMessage = runnerStore((s) => s.statusMessage);
  const runResults = runnerStore((s) => s.results);
  const logs = runnerStore((s) => s.logs);
  const run = runnerStore((s) => s.run);
  const cancel = runnerStore((s) => s.cancel);
  const cleanup = runnerStore((s) => s.cleanup);

  const { inputDefinitions, inputValues, updateInputValue } =
    useMiniAppInputs(workflow);

  const isRunning = state === "running" || state === "connecting";
  const isCompleted = state === "completed";
  const isError = state === "error";

  const scrollViewRef = React.useRef<ScrollView>(null);

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  const handleRun = useCallback(async () => {
    const missingInputs = inputDefinitions.filter((input) => {
      const value = inputValues[input.data.name];
      return value === undefined && input.kind !== "boolean";
    });

    if (missingInputs.length > 0) {
      Alert.alert(
        "Missing Inputs",
        `Please fill in: ${missingInputs.map((i) => i.data.label).join(", ")}`
      );
      return;
    }

    const params = inputDefinitions.reduce<Record<string, unknown>>(
      (accumulator, definition) => {
        const value = inputValues[definition.data.name];
        if (value === undefined) return accumulator;

        if (
          (definition.kind === "integer" || definition.kind === "float") &&
          typeof value === "number"
        ) {
          let normalized = value;
          if (definition.kind === "integer") {
            normalized = Math.round(value);
          }
          if (
            definition.data.min !== undefined ||
            definition.data.max !== undefined
          ) {
            const min = definition.data.min ?? -Infinity;
            const max = definition.data.max ?? Infinity;
            normalized = Math.min(Math.max(normalized, min), max);
          }
          accumulator[definition.data.name] = normalized;
          return accumulator;
        }

        accumulator[definition.data.name] = value;
        return accumulator;
      },
      {}
    );

    try {
      await run(params, workflow);
    } catch (error) {
      console.error("Failed to run workflow:", error);
      Alert.alert("Error", "Failed to run workflow. Please try again.");
    }
  }, [inputDefinitions, inputValues, run, workflow]);

  const formattedResults = useMemo((): MiniAppResult[] => {
    if (!runResults) return [];

    if (Array.isArray(runResults)) {
      return runResults.map((r, i) => ({
        id: `res-${i}`,
        nodeId: "unknown",
        nodeName: "Output",
        outputName: `Output ${i + 1}`,
        outputType: typeof r === "string" ? "string" : "unknown",
        value: r,
        receivedAt: Date.now(),
      }));
    }

    if (typeof runResults === "object") {
      return Object.entries(runResults as Record<string, unknown>).map(
        ([key, val], i) => ({
          id: `res-${i}`,
          nodeId: key,
          nodeName: key,
          outputName: "Output",
          outputType: typeof val === "string" ? "string" : "unknown",
          value: val,
          receivedAt: Date.now(),
        })
      );
    }

    return [
      {
        id: "res-single",
        nodeId: "output",
        nodeName: "Output",
        outputName: "Result",
        outputType: typeof runResults,
        value: runResults,
        receivedAt: Date.now(),
      },
    ];
  }, [runResults]);

  return (
    <View style={[runnerStyles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        ref={scrollViewRef}
        style={runnerStyles.scrollView}
        contentContainerStyle={runnerStyles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {workflow.description ? (
          <View
            style={[
              runnerStyles.descriptionCard,
              shadows.small,
              { backgroundColor: colors.cardBg, borderColor: colors.borderLight },
            ]}
          >
            <Ionicons
              name="information-circle-outline"
              size={18}
              color={colors.primary}
              style={{ marginRight: 8, marginTop: 1 }}
            />
            <Text style={[runnerStyles.description, { color: colors.textSecondary }]}>
              {workflow.description}
            </Text>
          </View>
        ) : null}

        <View style={runnerStyles.section}>
          <View style={runnerStyles.sectionHeader}>
            <View style={[runnerStyles.sectionIconWrap, { backgroundColor: colors.primaryMuted }]}>
              <Ionicons name="create-outline" size={16} color={colors.primary} />
            </View>
            <Text style={[runnerStyles.sectionTitle, { color: colors.text }]}>Inputs</Text>
          </View>
          {inputDefinitions.length === 0 ? (
            <Text style={[runnerStyles.noInputsText, { color: colors.textTertiary }]}>
              This workflow has no inputs
            </Text>
          ) : (
            inputDefinitions.map((def) => (
              <PropertyRenderer
                key={def.nodeId}
                definition={def}
                value={inputValues[def.data.name]}
                onChange={(val) => updateInputValue(def.data.name, val)}
              />
            ))
          )}
        </View>

        <TouchableOpacity
          style={[
            runnerStyles.runButton,
            shadows.medium,
            { backgroundColor: isRunning ? colors.error : colors.primary },
          ]}
          onPress={isRunning ? cancel : handleRun}
          activeOpacity={0.8}
        >
          {isRunning ? (
            <View style={runnerStyles.buttonRow}>
              <ActivityIndicator color="#fff" size="small" style={{ marginRight: 10 }} />
              <Text style={runnerStyles.runButtonText}>Cancel</Text>
            </View>
          ) : (
            <View style={runnerStyles.buttonRow}>
              <Ionicons name="play" size={18} color="#fff" style={{ marginRight: 10 }} />
              <Text style={runnerStyles.runButtonText}>Run Workflow</Text>
            </View>
          )}
        </TouchableOpacity>

        {(isCompleted || isError) && (
          <View
            style={[
              runnerStyles.statusBanner,
              {
                backgroundColor: isCompleted ? colors.success + "12" : colors.error + "12",
                borderColor: isCompleted ? colors.success + "30" : colors.error + "30",
              },
            ]}
          >
            <Ionicons
              name={isCompleted ? "checkmark-circle" : "alert-circle"}
              size={20}
              color={isCompleted ? colors.success : colors.error}
            />
            <Text
              style={[
                runnerStyles.statusBannerText,
                { color: isCompleted ? colors.success : colors.error },
              ]}
            >
              {statusMessage || (isCompleted ? "Completed successfully" : "Execution failed")}
            </Text>
          </View>
        )}

        {isRunning && (
          <View style={runnerStyles.section}>
            <View style={runnerStyles.sectionHeader}>
              <View style={[runnerStyles.sectionIconWrap, { backgroundColor: colors.primaryMuted }]}>
                <Ionicons name="terminal-outline" size={16} color={colors.primary} />
              </View>
              <Text style={[runnerStyles.sectionTitle, { color: colors.text }]}>Execution</Text>
            </View>
            {statusMessage && (
              <Text style={[runnerStyles.statusText, { color: colors.primary }]}>
                {statusMessage}
              </Text>
            )}
            <View
              style={[
                runnerStyles.terminalContainer,
                { backgroundColor: colors.inputBg, borderColor: colors.border },
              ]}
            >
              <FlatList
                data={logs}
                keyExtractor={(_item: string, index: number) => `log-${index}`}
                renderItem={({ item: log }: { item: string }) => (
                  <Text style={[runnerStyles.terminalText, { color: colors.textSecondary }]}>
                    <Text style={[runnerStyles.terminalPrompt, { color: colors.primary }]}>
                      {"> "}
                    </Text>
                    {log}
                  </Text>
                )}
                nestedScrollEnabled
                onContentSizeChange={() => {
                  scrollViewRef.current?.scrollTo({ y: 100000, animated: true });
                }}
              />
            </View>
          </View>
        )}

        {!isRunning && formattedResults.length > 0 && (
          <View style={runnerStyles.section}>
            <View style={runnerStyles.sectionHeader}>
              <View style={[runnerStyles.sectionIconWrap, { backgroundColor: colors.success + "15" }]}>
                <Ionicons name="sparkles-outline" size={16} color={colors.success} />
              </View>
              <Text style={[runnerStyles.sectionTitle, { color: colors.text }]}>Results</Text>
            </View>
            <MiniAppResults results={formattedResults} />
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const editorStyles = StyleSheet.create({
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
  headerToggle: {
    flexDirection: "row",
    borderRadius: 8,
    overflow: "hidden",
    gap: 4,
  },
  toggleButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
});

const runnerStyles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  descriptionCard: {
    flexDirection: "row",
    padding: 14,
    borderRadius: 12,
    marginBottom: 20,
    borderWidth: StyleSheet.hairlineWidth,
  },
  description: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
  },
  sectionIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  runButton: {
    padding: 16,
    borderRadius: 14,
    alignItems: "center",
    marginBottom: 16,
  },
  buttonRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  runButtonText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  statusBanner: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 12,
    marginBottom: 16,
    gap: 10,
    borderWidth: 1,
  },
  statusBannerText: {
    fontSize: 14,
    fontWeight: "600",
    flex: 1,
  },
  statusText: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 10,
  },
  noInputsText: {
    fontSize: 14,
    fontStyle: "italic",
  },
  terminalContainer: {
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    height: 200,
  },
  terminalText: {
    fontFamily: "monospace",
    fontSize: 12,
    marginBottom: 4,
    lineHeight: 18,
  },
  terminalPrompt: {
    fontWeight: "bold",
  },
});

export default GraphEditorScreen;
