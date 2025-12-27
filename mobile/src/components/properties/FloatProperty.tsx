import React from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { PropertyProps } from './PropertyInput';
import { useTheme } from '../../hooks/useTheme';

const FloatProperty: React.FC<PropertyProps> = ({ definition, value, onChange }) => {
  const { colors } = useTheme();
  
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
      <Text style={[styles.label, { color: colors.text }]}>{definition.data.label}</Text>
      {definition.data.description ? (
        <Text style={[styles.description, { color: colors.textSecondary }]}>{definition.data.description}</Text>
      ) : null}
      <TextInput
        style={[styles.input, { backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.border }]}
        value={localValue}
        onChangeText={onTextChange}
        placeholder="0.0"
        placeholderTextColor={colors.textSecondary}
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
  },
  description: {
    fontSize: 14,
    marginBottom: 8,
  },
  input: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 16,
  },
});

export default FloatProperty;
