import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
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
  const { colors } = useTheme();
  
  // Use the workflow runner store
  const runnerStore = useWorkflowRunner(workflowId);
  // Subscribe to store state
  const state = runnerStore((state) => state.state);
  const statusMessage = runnerStore((state) => state.statusMessage);
  const runResults = runnerStore((state) => state.results);
  const logs = runnerStore((state) => state.logs);
  const run = runnerStore((state) => state.run);
  const cleanup = runnerStore((state) => state.cleanup);

  // Use the new hook for inputs
  const { inputDefinitions, inputValues, updateInputValue } = useMiniAppInputs(workflow);

  const isRunning = state === 'running' || state === 'connecting';
  
  const scrollViewRef = React.useRef<ScrollView>(null);

  useEffect(() => {
    loadWorkflow();
    return () => {
      cleanup();
    };
  }, [workflowId]);

  useEffect(() => {
    navigation.setOptions({ title: workflowName || 'Mini App' });
  }, [navigation, workflowName]);

  const loadWorkflow = async () => {
    try {
      setIsLoading(true);
      const data = await apiService.getWorkflow(workflowId);
      setWorkflow(data);
    } catch (error) {
      console.error('Failed to load workflow:', error);
      Alert.alert('Error', 'Failed to load mini app');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRun = async () => {
    // Validate inputs
    const missingInputs = inputDefinitions.filter(input => {
      const value = inputValues[input.data.name];
      return value === undefined && input.kind !== 'boolean';
    });

    if (missingInputs.length > 0) {
      Alert.alert(
        'Missing Inputs', 
        `Please fill in the following fields:\n${missingInputs.map(i => i.data.label).join(', ')}`
      );
      return;
    }

    // Normalize inputs
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

  if (isLoading) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.text} />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading...</Text>
      </View>
    );
  }

  if (!workflow) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: colors.background }]}>
        <Text style={[styles.errorText, { color: colors.error }]}>Failed to load workflow</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView 
        ref={scrollViewRef}
        style={styles.scrollView} 
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Inputs</Text>
          {inputDefinitions.length === 0 ? (
            <Text style={[styles.noInputsText, { color: colors.textSecondary }]}>This mini app has no inputs</Text>
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
            styles.runButton, 
            { backgroundColor: colors.primary },
            isRunning && styles.runButtonDisabled
          ]}
          onPress={handleRun}
          disabled={isRunning}
        >
          {isRunning ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons name="play" size={20} color="#fff" style={{ marginRight: 8 }} />
              <Text style={styles.runButtonText}>Run Mini App</Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Execution Status & Logs - Only show while running */}
        {isRunning && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Execution</Text>
            {statusMessage && (
               <Text style={[styles.statusText, { color: colors.primary }]}>{statusMessage}</Text>
            )}
            <View style={[styles.terminalContainer, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
               <ScrollView 
                  style={styles.terminalScroll} 
                  nestedScrollEnabled
                  onContentSizeChange={(w, h) => {
                    scrollViewRef.current?.scrollTo({ y: 100000, animated: true }); 
                  }}
               >
                  {logs.map((log, index) => (
                     <Text key={index} style={[styles.terminalText, { color: colors.text }]}>
                       <Text style={[styles.terminalPrompt, { color: colors.primary }]}>{'> '}</Text>
                       {log}
                     </Text>
                  ))}
               </ScrollView>
            </View>
          </View>
        )}

        {/* Results Section - Only show when finished */}
        {!isRunning && runResults && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Results</Text>
            
            <MiniAppResults 
              results={(() => {
                if (!runResults) {return [];}
                if (Array.isArray(runResults)) {
                   return runResults.map((r, i) => ({
                      id: `res-${i}`,
                      nodeId: 'unknown',
                      nodeName: 'Output',
                      outputName: `Output ${i+1}`,
                      outputType: typeof r === 'string' ? 'string' : 'unknown',
                      value: r,
                      receivedAt: Date.now()
                   })) as MiniAppResult[];
                }
                if (typeof runResults === 'object') {
                  return Object.entries(runResults).map(([key, val], i) => ({
                    id: `res-${i}`,
                    nodeId: key,
                    nodeName: key,
                    outputName: 'Output',
                    outputType: typeof val === 'string' ? 'string' : 'unknown',
                    value: val,
                    receivedAt: Date.now()
                  })) as MiniAppResult[];
                }
                return [{
                   id: 'res-single',
                   nodeId: 'output',
                   nodeName: 'Output',
                   outputName: 'Result',
                   outputType: typeof runResults,
                   value: runResults,
                   receivedAt: Date.now()
                }] as MiniAppResult[];
              })()} 
            />
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
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 16,
  },
  runButton: {
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 24,
  },
  runButtonDisabled: {
    opacity: 0.6,
  },
  runButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
  },
  errorText: {
  },
  noInputsText: {
    fontSize: 16,
    fontStyle: 'italic',
  },
  terminalContainer: {
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    height: 200,
  },
  terminalScroll: {
    flex: 1,
  },
  terminalText: {
    fontFamily: 'Menlo',
    fontSize: 12,
    marginBottom: 4,
  },
  terminalPrompt: {
    fontWeight: 'bold',
  },
});
