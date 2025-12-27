import React from 'react';
import { View, Text, Switch, StyleSheet } from 'react-native';
import { PropertyProps } from './PropertyInput';
import { useTheme } from '../../hooks/useTheme';

const BoolProperty: React.FC<PropertyProps> = ({ definition, value, onChange }) => {
  const { colors } = useTheme();
  
  return (
    <View style={styles.container}>
      <View style={[styles.switchContainer, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
        <View style={styles.switchLabel}>
          <Text style={[styles.label, { color: colors.text }]}>{definition.data.label}</Text>
          {definition.data.description ? (
            <Text style={[styles.description, { color: colors.textSecondary }]}>{definition.data.description}</Text>
          ) : null}
        </View>
        <Switch
          value={!!value}
          onValueChange={onChange}
          trackColor={{ false: colors.border, true: colors.primary }}
          thumbColor={value ? '#FFFFFF' : '#f4f3f4'}
        />
      </View>
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
  switchContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  switchLabel: {
    flex: 1,
    marginRight: 12,
  },
});

export default BoolProperty;
