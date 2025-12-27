/**
 * ThreadList component for displaying all conversation threads.
 */

import React from 'react';
import {
  View,
  FlatList,
  Text,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { Thread } from '../../../types';
import { useTheme } from '../../../hooks/useTheme';
import { ThreadItem } from './ThreadItem';
import { NewChatButton } from './NewChatButton';

export interface ThreadListProps {
  threads: Thread[];
  currentThreadId: string | null;
  isLoading: boolean;
  onSelectThread: (threadId: string) => void;
  onDeleteThread: (threadId: string) => void;
  onNewThread: () => void;
  onRefresh?: () => void;
}

/**
 * Empty state component when no threads exist.
 */
const EmptyThreadList: React.FC = () => {
  const { colors } = useTheme();
  
  return (
    <View style={styles.emptyContainer} testID="empty-thread-list">
      <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
        No conversations yet
      </Text>
      <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
        Start a new chat to begin
      </Text>
    </View>
  );
};

export const ThreadList: React.FC<ThreadListProps> = ({
  threads,
  currentThreadId,
  isLoading,
  onSelectThread,
  onDeleteThread,
  onNewThread,
  onRefresh,
}) => {
  const { colors } = useTheme();

  const renderItem = ({ item }: { item: Thread }) => (
    <ThreadItem
      thread={item}
      isSelected={item.id === currentThreadId}
      onSelect={() => onSelectThread(item.id)}
      onDelete={() => onDeleteThread(item.id)}
    />
  );

  const keyExtractor = (item: Thread) => item.id;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]} testID="thread-list">
      <NewChatButton onPress={onNewThread} />
      {threads.length === 0 && !isLoading ? (
        <EmptyThreadList />
      ) : (
        <FlatList
          data={threads}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.listContent}
          refreshControl={
            onRefresh ? (
              <RefreshControl
                refreshing={isLoading}
                onRefresh={onRefresh}
                tintColor={colors.primary}
              />
            ) : undefined
          }
          showsVerticalScrollIndicator={false}
          testID="thread-list-flatlist"
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContent: {
    flexGrow: 1,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '500',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    textAlign: 'center',
  },
});

export default ThreadList;
