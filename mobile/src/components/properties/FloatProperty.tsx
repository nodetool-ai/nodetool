import React from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { PropertyProps } from './PropertyInput';

const FloatProperty: React.FC<PropertyProps> = ({ definition, value, onChange }) => {
  const handleChange = (text: string) => {
    if (text === '') {
      onChange(undefined);
    } else {
      // Allow intermediate states like "1."
      if (text.endsWith('.') || text === '-') {
          // Pass raw text if needed, but simplistic approach here parses immediately 
          // or we could manage local state if we want better UX. 
          // For now, let's keep it simple and just parse what we can.
          // Or better: pass the raw string up if local state management allows, 
          // but our types say 'value' is 'any' so we try to keep it number.
          // A robust float input usually needs local state.
      }
      
      const parsed = parseFloat(text);
      onChange(isNaN(parsed) ? undefined : parsed);
    }
  };

  // Improved float handling with local state
  const [localValue, setLocalValue] = React.useState(value !== undefined ? String(value) : '');
  
  // Sync if external value changes significantly
  React.useEffect(() => {
      const parsedLocal = parseFloat(localValue);
      if (value !== undefined && value !== parsedLocal) {
          setLocalValue(String(value));
      }
  }, [value]);

  const onTextChange = (text: string) => {
      setLocalValue(text);
      if (text === '' || text === '-') {
          onChange(undefined);
          return;
      }
      const parsed = parseFloat(text);
      if (!isNaN(parsed)) {
          onChange(parsed);
      }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{definition.data.label}</Text>
      {definition.data.description ? (
        <Text style={styles.description}>{definition.data.description}</Text>
      ) : null}
      <TextInput
        style={styles.input}
        value={localValue}
        onChangeText={onTextChange}
        placeholder="0.0"
        keyboardType="numeric" 
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
  },
});

export default FloatProperty;
