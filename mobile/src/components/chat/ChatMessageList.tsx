/**
 * Message list component for chat.
 * Displays messages with auto-scroll behavior.
 */

import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  ListRenderItemInfo,
  RefreshControl,
} from 'react-native';
import { Message } from '../../types';
import { MessageView } from './MessageView';
import { LoadingIndicator } from './LoadingIndicator';
import { AgentExecutionView } from './AgentExecutionView';
import { useTheme } from '../../hooks/useTheme';

/**
 * An item in the rendered list: either a regular chat message or a grouped
 * agent-execution bundle (all agent_execution messages sharing the same
 * agent_execution_id). Grouping is done once up-front so the execution tree
 * sees the full message series and the FlatList only renders one row per
 * execution.
 */
type ListItem =
  | { kind: 'message'; message: Message; key: string }
  | { kind: 'agent_execution'; messages: Message[]; key: string };

interface ChatMessageListProps {
  messages: Message[];
  isLoading: boolean;
  isStreaming: boolean;
  onRefresh?: () => Promise<void>;
}

export const ChatMessageList: React.FC<ChatMessageListProps> = ({
  messages,
  isLoading,
  isStreaming,
  onRefresh,
}) => {
  const flatListRef = useRef<FlatList<ListItem>>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const isNearBottomRef = useRef(true);
  const { colors } = useTheme();

  const handleRefresh = useCallback(async () => {
    if (!onRefresh) return;
    setIsRefreshing(true);
    await onRefresh();
    setIsRefreshing(false);
  }, [onRefresh]);

  // Auto-scroll to bottom when new messages arrive (only if near bottom)
  useEffect(() => {
    if (messages.length > 0 && flatListRef.current && isNearBottomRef.current) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages.length]);

  // Scroll during streaming (without animation to avoid jank)
  useEffect(() => {
    if (isStreaming && flatListRef.current && isNearBottomRef.current) {
      flatListRef.current?.scrollToEnd({ animated: false });
    }
  }, [isStreaming, messages]);

  const handleScroll = useCallback((event: any) => {
    const { contentOffset, layoutMeasurement, contentSize } = event.nativeEvent;
    const distanceFromBottom = contentSize.height - layoutMeasurement.height - contentOffset.y;
    isNearBottomRef.current = distanceFromBottom < 150;
  }, []);

  const listItems = useMemo<ListItem[]>(() => {
    const items: ListItem[] = [];
    const seenAgentKeys = new Set<string>();
    const agentGroups = new Map<string, Message[]>();

    // First pass: group agent_execution messages by agent_execution_id.
    for (const msg of messages) {
      if (msg.role !== 'agent_execution') { continue; }
      const key =
        (msg as Message & { agent_execution_id?: string | null })
          .agent_execution_id || '__ungrouped__';
      const list = agentGroups.get(key) || [];
      list.push(msg);
      agentGroups.set(key, list);
    }

    // Second pass: preserve message order but render each agent group once.
    messages.forEach((msg, index) => {
      if (msg.role === 'agent_execution') {
        const groupKey =
          (msg as Message & { agent_execution_id?: string | null })
            .agent_execution_id || '__ungrouped__';
        if (seenAgentKeys.has(groupKey)) { return; }
        seenAgentKeys.add(groupKey);
        items.push({
          kind: 'agent_execution',
          messages: agentGroups.get(groupKey) ?? [msg],
          key: `agent-${groupKey}-${index}`,
        });
        return;
      }

      // Tool messages are internal; they are surfaced through execution
      // trees / tool-call cards rather than as standalone bubbles.
      if (msg.role === 'tool' || msg.role === 'system') { return; }

      items.push({
        kind: 'message',
        message: msg,
        key: msg.id || `message-${index}`,
      });
    });

    return items;
  }, [messages]);

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<ListItem>) => {
      if (item.kind === 'agent_execution') {
        return <AgentExecutionView messages={item.messages} />;
      }
      return <MessageView message={item.message} />;
    },
    []
  );

  const keyExtractor = useCallback((item: ListItem) => item.key, []);

  const renderFooter = useCallback(() => {
    if (isLoading && !isStreaming) {
      return (
        <View style={styles.loadingContainer}>
          <LoadingIndicator />
        </View>
      );
    }
    return null;
  }, [isLoading, isStreaming]);

  return (
    <FlatList
      ref={flatListRef}
      data={listItems}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={true}
      ListFooterComponent={renderFooter}
      onScroll={handleScroll}
      scrollEventThrottle={100}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        ) : undefined
      }
      // Performance optimizations
      removeClippedSubviews={true}
      maxToRenderPerBatch={10}
      windowSize={15}
      initialNumToRender={15}
      onContentSizeChange={() => {
        if (messages.length > 0 && isNearBottomRef.current) {
          flatListRef.current?.scrollToEnd({ animated: true });
        }
      }}
    />
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  contentContainer: {
    paddingTop: 8,
    paddingBottom: 8,
  },
  loadingContainer: {
    paddingVertical: 16,
    alignItems: 'center',
  },
});

export default ChatMessageList;
