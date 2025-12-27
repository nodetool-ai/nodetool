/**
 * Chat screen for the mobile app.
 * Manages WebSocket connection and displays the chat interface.
 */

import React, { useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Text,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { ChatView } from '../components/chat';
import { useChatStore } from '../stores/ChatStore';

type Props = NativeStackScreenProps<RootStackParamList, 'Chat'>;

export default function ChatScreen({ navigation }: Props) {
  const {
    status,
    error,
    statusMessage,
    currentThreadId,
    connect,
    disconnect,
    sendMessage,
    stopGeneration,
    createNewThread,
    getCurrentMessages,
  } = useChatStore();

  const messages = getCurrentMessages();

  // Connect on mount
  useEffect(() => {
    const initializeChat = async () => {
      try {
        await connect();
        // Create initial thread if none exists
        if (!currentThreadId) {
          await createNewThread();
        }
      } catch (err) {
        console.error('Failed to connect to chat:', err);
      }
    };

    initializeChat();

    // Cleanup on unmount
    return () => {
      // Don't disconnect on unmount to keep connection alive
      // disconnect();
    };
  }, [connect, currentThreadId, createNewThread]);

  // Handle new chat
  const handleNewChat = useCallback(async () => {
    try {
      await createNewThread();
    } catch (err) {
      console.error('Failed to create new thread:', err);
    }
  }, [createNewThread]);

  // Configure header with New Chat button
  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={handleNewChat}
          style={styles.headerButton}
          activeOpacity={0.7}
        >
          <Text style={styles.headerButtonText}>New Chat</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation, handleNewChat]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000000" />
      <ChatView
        status={status}
        messages={messages}
        onSendMessage={sendMessage}
        onStop={stopGeneration}
        error={error}
        statusMessage={statusMessage}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  headerButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  headerButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
  },
});
