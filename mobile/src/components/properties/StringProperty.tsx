import React from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { PropertyProps } from './PropertyInput';

const StringProperty: React.FC<PropertyProps> = ({ definition, value, onChange }) => {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{definition.data.label}</Text>
      {definition.data.description ? (
        <Text style={styles.description}>{definition.data.description}</Text>
      ) : null}
      <TextInput
        style={styles.input}
        value={String(value ?? '')}
        onChangeText={onChange}
        placeholder={`Enter ${definition.data.label?.toLowerCase() || 'text'}`}
        multiline
      />
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
    minHeight: 48, 
    textAlignVertical: 'top' // Android alignment
  },
});

export default StringProperty;
