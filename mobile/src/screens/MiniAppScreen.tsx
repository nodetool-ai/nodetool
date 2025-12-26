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
import { Workflow, MiniAppInputDefinition, MiniAppInputKind } from '../types/miniapp';
import { RootStackParamList } from '../navigation/types';

type MiniAppScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'MiniApp'>;
  route: RouteProp<RootStackParamList, 'MiniApp'>;
};

export default function MiniAppScreen({ navigation, route }: MiniAppScreenProps) {
  const { workflowId, workflowName } = route.params;
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [inputValues, setInputValues] = useState<Record<string, any>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState<string>('');

  useEffect(() => {
    loadWorkflow();
  }, [workflowId]);

  useEffect(() => {
    navigation.setOptions({ title: workflowName || 'Mini App' });
  }, [navigation, workflowName]);

  const loadWorkflow = async () => {
    try {
      setIsLoading(true);
      const data = await apiService.getWorkflow(workflowId);
      setWorkflow(data);
      initializeInputs(data);
    } catch (error) {
      console.error('Failed to load workflow:', error);
      Alert.alert('Error', 'Failed to load mini app');
    } finally {
      setIsLoading(false);
    }
  };

  const initializeInputs = (wf: Workflow) => {
    const inputs = extractInputDefinitions(wf);
    const initialValues: Record<string, any> = {};
    
    inputs.forEach((input) => {
      const key = input.data.name;
      if (input.data.value !== undefined) {
        initialValues[key] = input.data.value;
      } else if (input.kind === 'boolean') {
        initialValues[key] = false;
      } else if (input.kind === 'integer' || input.kind === 'float') {
        initialValues[key] = input.data.min || 0;
      } else {
        initialValues[key] = '';
      }
    });
    
    setInputValues(initialValues);
  };

  const extractInputDefinitions = (wf: Workflow): MiniAppInputDefinition[] => {
    if (!wf.graph?.nodes) {
      return [];
    }

    const inputNodes = wf.graph.nodes.filter(
      (node) => node.type === 'nodetool.input.TextInput' || 
               node.type === 'nodetool.input.IntegerInput' ||
               node.type === 'nodetool.input.FloatInput' ||
               node.type === 'nodetool.input.BooleanInput'
    );

    return inputNodes.map((node) => {
      let kind: MiniAppInputKind = 'string';
      if (node.type.includes('Integer')) {
        kind = 'integer';
      } else if (node.type.includes('Float')) {
        kind = 'float';
      } else if (node.type.includes('Boolean')) {
        kind = 'boolean';
      }

      return {
        nodeId: node.id,
        nodeType: node.type,
        kind,
        data: {
          name: (node.data.name as string) || node.id,
          label: (node.data.label as string) || (node.data.name as string) || 'Input',
          description: (node.data.description as string) || '',
          min: node.data.min as number | undefined,
          max: node.data.max as number | undefined,
          value: node.data.value,
        },
      };
    });
  };

  const handleRun = async () => {
    // Validate inputs before running
    const inputs = extractInputDefinitions(workflow!);
    const missingInputs = inputs.filter(input => {
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

    try {
      setIsRunning(true);
      setResults('Running workflow...');
      
      const response = await apiService.runWorkflow(workflowId, inputValues);
      setResults(JSON.stringify(response, null, 2));
      Alert.alert('Success', 'Workflow completed successfully');
    } catch (error) {
      console.error('Failed to run workflow:', error);
      setResults('Error: Failed to run workflow');
      Alert.alert('Error', 'Failed to run workflow. Please try again.');
    } finally {
      setIsRunning(false);
    }
  };

  const renderInput = (input: MiniAppInputDefinition) => {
    const key = input.data.name;
    const value = inputValues[key];

    if (input.kind === 'boolean') {
      return (
        <View key={key} style={styles.inputContainer}>
          <View style={styles.switchContainer}>
            <View style={styles.switchLabel}>
              <Text style={styles.label}>{input.data.label}</Text>
              {input.data.description && (
                <Text style={styles.description}>{input.data.description}</Text>
              )}
            </View>
            <Switch
              value={value}
              onValueChange={(newValue) => 
                setInputValues({ ...inputValues, [key]: newValue })
              }
              trackColor={{ false: '#767577', true: '#81b0ff' }}
              thumbColor={value ? '#007AFF' : '#f4f3f4'}
            />
          </View>
        </View>
      );
    }

    return (
      <View key={key} style={styles.inputContainer}>
        <Text style={styles.label}>{input.data.label}</Text>
        {input.data.description && (
          <Text style={styles.description}>{input.data.description}</Text>
        )}
        <TextInput
          style={styles.input}
          value={String(value ?? '')}
          onChangeText={(text) => {
            let newValue: any;
            if (input.kind === 'integer') {
              if (text === '') {
                newValue = undefined;
              } else {
                const parsed = parseInt(text, 10);
                newValue = isNaN(parsed) ? undefined : parsed;
              }
            } else if (input.kind === 'float') {
              if (text === '') {
                newValue = undefined;
              } else {
                const parsed = parseFloat(text);
                newValue = isNaN(parsed) ? undefined : parsed;
              }
            } else {
              newValue = text;
            }
            setInputValues({ ...inputValues, [key]: newValue });
          }}
          placeholder={`Enter ${input.data.label.toLowerCase()}`}
          keyboardType={
            input.kind === 'integer' || input.kind === 'float' 
              ? 'numeric' 
              : 'default'
          }
        />
      </View>
    );
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

  const inputs = extractInputDefinitions(workflow);

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Inputs</Text>
          {inputs.length === 0 ? (
            <Text style={styles.noInputsText}>This mini app has no inputs</Text>
          ) : (
            inputs.map(renderInput)
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

        {results && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Results</Text>
            <ScrollView style={styles.resultsContainer} nestedScrollEnabled>
              <Text style={styles.resultsText}>{results}</Text>
            </ScrollView>
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
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  errorText: {
    fontSize: 18,
    color: '#ff3b30',
  },
  noInputsText: {
    fontSize: 16,
    color: '#666',
    fontStyle: 'italic',
  },
});
