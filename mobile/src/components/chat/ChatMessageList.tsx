/**
 * Message list component for chat.
 * Displays messages with auto-scroll behavior.
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
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
import { useTheme } from '../../hooks/useTheme';

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
  const flatListRef = useRef<FlatList<Message>>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const isNearBottomRef = useRef(true);
  const { colors } = useTheme();

  const handleRefresh = useCallback(async () => {
    if (!onRefresh) {return;}
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

  const renderMessage = useCallback(({ item, index }: ListRenderItemInfo<Message>) => {
    return <MessageView key={item.id || `msg-${index}`} message={item} />;
  }, []);

  const keyExtractor = useCallback((item: Message, index: number) => {
    return item.id || `message-${index}`;
  }, []);

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
      data={messages}
      renderItem={renderMessage}
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
