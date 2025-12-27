/**
 * ThreadItem component for displaying a single thread in the thread list.
 */

import React, { useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Thread } from '../../../types';
import { useTheme } from '../../../hooks/useTheme';

export interface ThreadItemProps {
  thread: Thread;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}

/**
 * Format a relative time string from a date.
 */
function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 7) {
    return date.toLocaleDateString();
  } else if (diffDays > 0) {
    return `${diffDays}d ago`;
  } else if (diffHours > 0) {
    return `${diffHours}h ago`;
  } else if (diffMinutes > 0) {
    return `${diffMinutes}m ago`;
  } else {
    return 'Just now';
  }
}

export const ThreadItem: React.FC<ThreadItemProps> = ({
  thread,
  isSelected,
  onSelect,
  onDelete,
}) => {
  const { colors } = useTheme();

  const handleDelete = useCallback(() => {
    Alert.alert(
      'Delete Conversation',
      'Are you sure you want to delete this conversation?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: onDelete },
      ]
    );
  }, [onDelete]);

  const updatedAt = thread.updated_at || thread.created_at;
  const relativeTime = updatedAt ? formatRelativeTime(updatedAt) : '';

  return (
    <TouchableOpacity
      style={[
        styles.container,
        { backgroundColor: isSelected ? colors.primary + '20' : colors.surface },
        isSelected && { borderLeftColor: colors.primary, borderLeftWidth: 3 },
      ]}
      onPress={onSelect}
      activeOpacity={0.7}
      testID={`thread-item-${thread.id}`}
    >
      <View style={styles.content}>
        <Text
          style={[styles.title, { color: colors.text }]}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {thread.title || 'New conversation'}
        </Text>
        {relativeTime && (
          <Text style={[styles.date, { color: colors.textSecondary }]}>
            {relativeTime}
          </Text>
        )}
      </View>
      <TouchableOpacity
        style={styles.deleteButton}
        onPress={handleDelete}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        testID={`delete-thread-${thread.id}`}
      >
        <Ionicons name="trash-outline" size={18} color={colors.error} />
      </TouchableOpacity>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  content: {
    flex: 1,
    marginRight: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 2,
  },
  date: {
    fontSize: 12,
  },
  deleteButton: {
    padding: 8,
  },
});

export default ThreadItem;
