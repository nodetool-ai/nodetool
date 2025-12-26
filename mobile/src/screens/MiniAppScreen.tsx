import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Switch,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { apiService } from '../services/api';
import { Workflow, MiniAppResult } from '../types/miniapp';
import { RootStackParamList } from '../navigation/types';
import { useWorkflowRunner } from '../stores/WorkflowRunner';
import { useMiniAppInputs } from '../hooks/useMiniAppInputs';
import { PropertyRenderer } from '../components/properties';
import { MiniAppResults } from '../components/miniapps/MiniAppResults';

type MiniAppScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'MiniApp'>;
  route: RouteProp<RootStackParamList, 'MiniApp'>;
};

export default function MiniAppScreen({ navigation, route }: MiniAppScreenProps) {
  const { workflowId, workflowName } = route.params;
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
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
  const { inputDefinitions, inputValues, updateInputValue, setInputValues } = useMiniAppInputs(workflow);

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

    // Normalize inputs (logic ported from web MiniAppPage.tsx)
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
          // Clamp and round if necessary
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
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  if (!workflow) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>Failed to load workflow</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Inputs</Text>
          {inputDefinitions.length === 0 ? (
            <Text style={styles.noInputsText}>This mini app has no inputs</Text>
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
          style={[styles.runButton, isRunning && styles.runButtonDisabled]}
          onPress={handleRun}
          disabled={isRunning}
        >
          {isRunning ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.runButtonText}>▶ Run</Text>
          )}
        </TouchableOpacity>

        {/* Execution Status & Logs - Only show while running */}
        {isRunning && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Execution</Text>
            {statusMessage && (
               <Text style={styles.statusText}>{statusMessage}</Text>
            )}
            <View style={styles.terminalContainer}>
               <ScrollView 
                  style={styles.terminalScroll} 
                  nestedScrollEnabled
                  onContentSizeChange={(w, h) => {
                    // Auto-scroll to bottom
                    scrollViewRef.current?.scrollTo({ y: h, animated: true }); 
                  }}
                  ref={scrollViewRef}
               >
                  {logs.map((log, index) => (
                     <Text key={index} style={styles.terminalText}>
                       <Text style={styles.terminalPrompt}>{'> '}</Text>
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
            <Text style={styles.sectionTitle}>Results</Text>
            
            <MiniAppResults 
              results={(() => {
                if (!runResults) return [];
                if (Array.isArray(runResults)) {
                   // If it's an array of results
                   return runResults.map((r, i) => ({
                      id: `res-${i}`,
                      nodeId: 'unknown', // metadata not avail in raw results
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
                // Primitive value
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
    backgroundColor: '#f5f5f5',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
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
    color: '#333',
  },
  inputContainer: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 6,
    color: '#333',
  },
  description: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    fontSize: 16,
  },
  switchContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  switchLabel: {
    flex: 1,
    marginRight: 12,
  },
  runButton: {
    backgroundColor: '#007AFF',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 24,
  },
  runButtonDisabled: {
    opacity: 0.6,
  },
  runButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  resultsContainer: {
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    maxHeight: 300,
  },
  resultsText: {
    fontFamily: 'monospace',
    fontSize: 12,
    color: '#333',
  },
  logText: {
    fontFamily: 'monospace',
    fontSize: 10,
    color: '#666',
    marginBottom: 2,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    color: '#007AFF',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  errorText: {
    color: '#ff3b30',
  },
  noInputsText: {
    fontSize: 16,
    color: '#666',
    fontStyle: 'italic',
  },
  divider: {
    height: 1,
    backgroundColor: '#eee',
    marginVertical: 8,
  },
  terminalContainer: {
    backgroundColor: '#1E1E1E',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#333',
    height: 200,
  },
  terminalScroll: {
    flex: 1,
  },
  terminalText: {
    fontFamily: 'Menlo', // or monospace
    fontSize: 12,
    color: '#A9B7C6',
    marginBottom: 4,
  },
  terminalPrompt: {
    color: '#9876AA',
  },
  resultTitle: {
    fontWeight: '600',
    fontSize: 12,
    marginBottom: 4,
    color: '#333',
  }
});
