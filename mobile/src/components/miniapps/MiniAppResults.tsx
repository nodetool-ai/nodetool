import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { MiniAppResult } from '../../types/miniapp';
import { OutputRenderer } from '../outputs/OutputRenderer';
import { useTheme } from '../../hooks/useTheme';

type MiniAppResultsProps = {
  results: MiniAppResult[];
  onClear?: () => void;
};

export const MiniAppResults: React.FC<MiniAppResultsProps> = ({ results, onClear }) => {
  const { colors } = useTheme();

  if (results.length === 0) {
    return (
      <View style={[styles.emptyContainer, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
        <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No results</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.textSecondary }]}>
          {results.length} {results.length === 1 ? 'result' : 'results'}
        </Text>
        {onClear && (
          <TouchableOpacity onPress={onClear} style={styles.clearButton}>
            <Text style={[styles.clearButtonText, { color: colors.primary }]}>Clear</Text>
          </TouchableOpacity>
        )}
      </View>
      
      <View style={styles.list}>
        {results.map((result) => (
          <View key={result.id} style={[styles.card, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <OutputRenderer value={result.value} />
          </View>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 16,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
  },
  clearButton: {
    padding: 4,
  },
  clearButtonText: {
    fontSize: 14,
  },
  emptyContainer: {
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    marginVertical: 10,
    borderWidth: 1,
  },
  emptyText: {
    fontSize: 14,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  list: {
    gap: 12,
  },
  card: {
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
  },
});
