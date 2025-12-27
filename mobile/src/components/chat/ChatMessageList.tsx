/**
 * Message list component for chat.
 * Displays messages with auto-scroll behavior.
 */

import React, { useRef, useEffect } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  ListRenderItemInfo,
} from 'react-native';
import { Message } from '../../types';
import { MessageView } from './MessageView';
import { LoadingIndicator } from './LoadingIndicator';

interface ChatMessageListProps {
  messages: Message[];
  isLoading: boolean;
  isStreaming: boolean;
}

export const ChatMessageList: React.FC<ChatMessageListProps> = ({
  messages,
  isLoading,
  isStreaming,
}) => {
  const flatListRef = useRef<FlatList<Message>>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messages.length > 0 && flatListRef.current) {
      // Small delay to ensure layout is complete
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages.length]);

  // Also scroll when content changes (streaming)
  useEffect(() => {
    if (isStreaming && flatListRef.current) {
      flatListRef.current?.scrollToEnd({ animated: false });
    }
  }, [isStreaming, messages]);

  const renderMessage = ({ item, index }: ListRenderItemInfo<Message>) => {
    return <MessageView key={item.id || `msg-${index}`} message={item} />;
  };

  const keyExtractor = (item: Message, index: number) => {
    return item.id || `message-${index}`;
  };

  const renderFooter = () => {
    if (isLoading && !isStreaming) {
      return (
        <View style={styles.loadingContainer}>
          <LoadingIndicator />
        </View>
      );
    }
    return null;
  };

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
      // Performance optimizations
      removeClippedSubviews={true}
      maxToRenderPerBatch={10}
      windowSize={10}
      initialNumToRender={15}
      // Prevent scroll jumping when new messages arrive
      onContentSizeChange={() => {
        if (messages.length > 0) {
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
