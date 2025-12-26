import React from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { PropertyProps } from './PropertyInput';

const AudioProperty: React.FC<PropertyProps> = ({ definition, value, onChange }) => {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{definition.data.label} (Audio URL)</Text>
      {definition.data.description ? (
        <Text style={styles.description}>{definition.data.description}</Text>
      ) : null}
      <TextInput
        style={styles.input}
        value={String(value ?? '')}
        onChangeText={onChange}
        placeholder="Enter audio URL"
        autoCapitalize="none"
        autoCorrect={false}
      />
      <Text style={styles.hint}>Audio upload not supported yet. Please provide a URL.</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
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
  hint: {
    marginTop: 4,
    fontSize: 12,
    color: '#999',
  }
});

export default AudioProperty;
