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
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { ChatView } from '../components/chat';
import { useChatStore } from '../stores/ChatStore';
import { useTheme } from '../hooks/useTheme';

type Props = NativeStackScreenProps<RootStackParamList, 'Chat'>;

export default function ChatScreen({ navigation }: Props) {
  const {
    status,
    error,
    statusMessage,
    currentThreadId,
    connect,
    createNewThread,
    getCurrentMessages,
    selectedModel,
    sendMessage,
    stopGeneration,
  } = useChatStore();
  const { colors, mode } = useTheme();

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
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity
            onPress={() => navigation.navigate('LanguageModelSelection')}
            style={[styles.headerButton, { marginRight: 0, flexDirection: 'row', alignItems: 'center' }]}
            activeOpacity={0.7}
          >
            <Text style={[styles.headerButtonText, { color: colors.text, marginRight: 2 }]}>
              {selectedModel ? selectedModel.name : 'Model'}
            </Text>
            <Ionicons name="chevron-down-outline" size={14} color={colors.text} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleNewChat}
            style={styles.headerButton}
            activeOpacity={0.7}
          >
            <Ionicons name="add-outline" size={28} color={colors.text} />
          </TouchableOpacity>
        </View>
      ),
    });
  }, [navigation, handleNewChat, selectedModel, colors.text]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={mode === 'dark' ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
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
  },
  headerButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  headerButtonText: {
    fontSize: 16,
    fontWeight: '500',
  },
});
