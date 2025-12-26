import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { MiniAppResult } from '../../types/miniapp';
import { OutputRenderer } from '../outputs/OutputRenderer';

type MiniAppResultsProps = {
  results: MiniAppResult[];
  onClear?: () => void;
};

export const MiniAppResults: React.FC<MiniAppResultsProps> = ({ results, onClear }) => {
  if (results.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No results</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>
          {results.length} {results.length === 1 ? 'result' : 'results'}
        </Text>
        {onClear && (
          <TouchableOpacity onPress={onClear} style={styles.clearButton}>
            <Text style={styles.clearButtonText}>Clear</Text>
          </TouchableOpacity>
        )}
      </View>
      
      <View style={styles.list}>
        {results.map((result) => (
          <View key={result.id} style={styles.card}>
            {/* Optional: Show label/node name if useful */}
            {/* <Text style={styles.nodeName}>{result.nodeName || 'Output'}</Text> */}
            
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
    backgroundColor: 'rgba(255, 255, 255, 0.5)', 
    borderRadius: 12,
    padding: 16,
    // rough glassmorphism/card style
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 14,
    color: '#666',
    fontWeight: '600',
  },
  clearButton: {
    padding: 4,
  },
  clearButtonText: {
    color: '#007AFF',
    fontSize: 14,
  },
  emptyContainer: {
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    marginVertical: 10,
  },
  emptyText: {
    color: '#999',
    fontSize: 14,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  list: {
    gap: 12,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#eee',
  },
  nodeName: {
    fontSize: 12,
    color: '#999',
    marginBottom: 4,
  }
});
