import React, { useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { apiService } from '../services/api';
import { Workflow, MiniAppResult } from '../types/miniapp';
import { RootStackParamList } from '../navigation/types';
import { useWorkflowRunner } from '../stores/WorkflowRunner';
import { useMiniAppInputs } from '../hooks/useMiniAppInputs';
import { PropertyRenderer } from '../components/properties';
import { MiniAppResults } from '../components/miniapps/MiniAppResults';
import { useTheme } from '../hooks/useTheme';

type MiniAppScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'MiniApp'>;
  route: RouteProp<RootStackParamList, 'MiniApp'>;
};

export default function MiniAppScreen({ navigation, route }: MiniAppScreenProps) {
  const { workflowId, workflowName } = route.params;
  const [workflow, setWorkflow] = React.useState<Workflow | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const { colors, shadows } = useTheme();

  const runnerStore = useWorkflowRunner(workflowId);
  const state = runnerStore((s) => s.state);
  const statusMessage = runnerStore((s) => s.statusMessage);
  const runResults = runnerStore((s) => s.results);
  const logs = runnerStore((s) => s.logs);
  const run = runnerStore((s) => s.run);
  const cancel = runnerStore((s) => s.cancel);
  const cleanup = runnerStore((s) => s.cleanup);

  const { inputDefinitions, inputValues, updateInputValue } = useMiniAppInputs(workflow);

  const isRunning = state === 'running' || state === 'connecting';
  const isCompleted = state === 'completed';
  const isError = state === 'error';

  const scrollViewRef = React.useRef<ScrollView>(null);

  const loadWorkflow = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await apiService.getWorkflow(workflowId);
      setWorkflow(data ?? null);
    } catch (error) {
      console.error('Failed to load workflow:', error);
      Alert.alert('Error', 'Failed to load mini app. Check your connection and try again.');
    } finally {
      setIsLoading(false);
    }
  }, [workflowId]);

  useEffect(() => {
    loadWorkflow();
    return () => {
      cleanup();
    };
  }, [workflowId, cleanup, loadWorkflow]);

  useEffect(() => {
    navigation.setOptions({ title: workflowName || 'Mini App' });
  }, [navigation, workflowName]);

  const handleRun = async () => {
    const missingInputs = inputDefinitions.filter(input => {
      const value = inputValues[input.data.name];
      return value === undefined && input.kind !== 'boolean';
    });

    if (missingInputs.length > 0) {
      Alert.alert(
        'Missing Inputs',
        `Please fill in: ${missingInputs.map(i => i.data.label).join(', ')}`
      );
      return;
    }

    const params = inputDefinitions.reduce<Record<string, unknown>>(
      (accumulator, definition) => {
        const value = inputValues[definition.data.name];

        if (value === undefined) {
          return accumulator;
        }

        if (
          (definition.kind === "integer" || definition.kind === "float") &&
          typeof value === "number"
        ) {
          let normalized = value;
          if (definition.kind === "integer") {
            normalized = Math.round(value);
          }

          if (definition.data.min !== undefined || definition.data.max !== undefined) {
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
      await run(params, workflow as Workflow);
    } catch (error) {
      console.error('Failed to run workflow:', error);
      Alert.alert('Error', 'Failed to run workflow. Please try again.');
    }
  };

  const formattedResults = useMemo((): MiniAppResult[] => {
    if (!runResults) return [];

    if (Array.isArray(runResults)) {
      return runResults.map((r, i) => ({
        id: `res-${i}`,
        nodeId: 'unknown',
        nodeName: 'Output',
        outputName: `Output ${i + 1}`,
        outputType: typeof r === 'string' ? 'string' : 'unknown',
        value: r,
        receivedAt: Date.now()
      }));
    }

    if (typeof runResults === 'object') {
      return Object.entries(runResults as Record<string, unknown>).map(([key, val], i) => ({
        id: `res-${i}`,
        nodeId: key,
        nodeName: key,
        outputName: 'Output',
        outputType: typeof val === 'string' ? 'string' : 'unknown',
        value: val,
        receivedAt: Date.now()
      }));
    }

    return [{
      id: 'res-single',
      nodeId: 'output',
      nodeName: 'Output',
      outputName: 'Result',
      outputType: typeof runResults,
      value: runResults,
      receivedAt: Date.now()
    }];
  }, [runResults]);

  if (isLoading) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: colors.background }]}>
        <View style={[styles.loadingWrap, { backgroundColor: colors.primaryMuted }]}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading...</Text>
      </View>
    );
  }

  if (!workflow) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: colors.background }]}>
        <View style={[styles.errorWrap, { backgroundColor: colors.error + '15' }]}>
          <Ionicons name="alert-circle-outline" size={36} color={colors.error} />
        </View>
        <Text style={[styles.errorText, { color: colors.error }]}>Failed to load workflow</Text>
        <TouchableOpacity
          style={[styles.retryButton, { borderColor: colors.border, backgroundColor: colors.surface }]}
          onPress={loadWorkflow}
        >
          <Ionicons name="refresh-outline" size={16} color={colors.primary} style={{ marginRight: 6 }} />
          <Text style={[styles.retryText, { color: colors.primary }]}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Description */}
        {workflow.description ? (
          <View style={[styles.descriptionCard, shadows.small, { backgroundColor: colors.cardBg, borderColor: colors.borderLight }]}>
            <Ionicons name="information-circle-outline" size={18} color={colors.primary} style={{ marginRight: 8, marginTop: 1 }} />
            <Text style={[styles.description, { color: colors.textSecondary }]}>
              {workflow.description}
            </Text>
          </View>
        ) : null}

        {/* Inputs Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionIconWrap, { backgroundColor: colors.primaryMuted }]}>
              <Ionicons name="create-outline" size={16} color={colors.primary} />
            </View>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Inputs</Text>
          </View>
          {inputDefinitions.length === 0 ? (
            <Text style={[styles.noInputsText, { color: colors.textTertiary }]}>This mini app has no inputs</Text>
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

        {/* Run / Cancel Button */}
        <TouchableOpacity
          style={[
            styles.runButton,
            shadows.medium,
            { backgroundColor: isRunning ? colors.error : colors.primary },
            (isLoading) && styles.runButtonDisabled
          ]}
          onPress={isRunning ? cancel : handleRun}
          disabled={isLoading}
          activeOpacity={0.8}
        >
          {isRunning ? (
            <View style={styles.buttonRow}>
              <ActivityIndicator color="#fff" size="small" style={{ marginRight: 10 }} />
              <Text style={styles.runButtonText}>Cancel</Text>
            </View>
          ) : (
            <View style={styles.buttonRow}>
              <Ionicons name="play" size={18} color="#fff" style={{ marginRight: 10 }} />
              <Text style={styles.runButtonText}>Run Mini App</Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Status indicator */}
        {(isCompleted || isError) && (
          <View style={[
            styles.statusBanner,
            {
              backgroundColor: isCompleted ? colors.success + '12' : colors.error + '12',
              borderColor: isCompleted ? colors.success + '30' : colors.error + '30',
            }
          ]}>
            <Ionicons
              name={isCompleted ? 'checkmark-circle' : 'alert-circle'}
              size={20}
              color={isCompleted ? colors.success : colors.error}
            />
            <Text style={[
              styles.statusBannerText,
              { color: isCompleted ? colors.success : colors.error }
            ]}>
              {statusMessage || (isCompleted ? 'Completed successfully' : 'Execution failed')}
            </Text>
          </View>
        )}

        {/* Execution Logs */}
        {isRunning && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIconWrap, { backgroundColor: colors.primaryMuted }]}>
                <Ionicons name="terminal-outline" size={16} color={colors.primary} />
              </View>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Execution</Text>
            </View>
            {statusMessage && (
              <Text style={[styles.statusText, { color: colors.primary }]}>{statusMessage}</Text>
            )}
            <View style={[styles.terminalContainer, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
              <FlatList
                data={logs}
                keyExtractor={(_item, index) => `log-${index}`}
                renderItem={({ item: log }) => (
                  <Text style={[styles.terminalText, { color: colors.textSecondary }]}>
                    <Text style={[styles.terminalPrompt, { color: colors.primary }]}>{'> '}</Text>
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

        {/* Results Section */}
        {!isRunning && formattedResults.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIconWrap, { backgroundColor: colors.success + '15' }]}>
                <Ionicons name="sparkles-outline" size={16} color={colors.success} />
              </View>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Results</Text>
            </View>
            <MiniAppResults results={formattedResults} />
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  descriptionCard: {
    flexDirection: 'row',
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
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  sectionIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  runButton: {
    padding: 16,
    borderRadius: 14,
    alignItems: 'center',
    marginBottom: 16,
  },
  runButtonDisabled: {
    opacity: 0.6,
  },
  buttonRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  runButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    marginBottom: 16,
    gap: 10,
    borderWidth: 1,
  },
  statusBannerText: {
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 10,
  },
  loadingWrap: {
    width: 64,
    height: 64,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  loadingText: {
    fontSize: 15,
  },
  errorWrap: {
    width: 72,
    height: 72,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  errorText: {
    fontSize: 17,
    fontWeight: '600',
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 16,
  },
  retryText: {
    fontSize: 15,
    fontWeight: '500',
  },
  noInputsText: {
    fontSize: 14,
    fontStyle: 'italic',
  },
  terminalContainer: {
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    height: 200,
  },
  terminalText: {
    fontFamily: 'monospace',
    fontSize: 12,
    marginBottom: 4,
    lineHeight: 18,
  },
  terminalPrompt: {
    fontWeight: 'bold',
  },
});
