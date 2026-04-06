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
  const status = useChatStore(state => state.status);
  const error = useChatStore(state => state.error);
  const statusMessage = useChatStore(state => state.statusMessage);
  const currentThreadId = useChatStore(state => state.currentThreadId);
  const connect = useChatStore(state => state.connect);
  const createNewThread = useChatStore(state => state.createNewThread);
  const getCurrentMessages = useChatStore(state => state.getCurrentMessages);
  const selectedModel = useChatStore(state => state.selectedModel);
  const sendMessage = useChatStore(state => state.sendMessage);
  const stopGeneration = useChatStore(state => state.stopGeneration);

  const { colors, mode } = useTheme();

  const messages = getCurrentMessages();

  useEffect(() => {
    const initializeChat = async () => {
      try {
        await connect();
        if (!currentThreadId) {
          await createNewThread();
        }
      } catch (err) {
        console.error('Failed to connect to chat:', err);
      }
    };

    initializeChat();
  }, [connect, currentThreadId, createNewThread]);

  const handleNewChat = useCallback(async () => {
    try {
      await createNewThread();
    } catch (err) {
      console.error('Failed to create new thread:', err);
    }
  }, [createNewThread]);

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity
            onPress={() => navigation.navigate('LanguageModelSelection')}
            style={[styles.modelButton, { backgroundColor: colors.primaryMuted }]}
            activeOpacity={0.7}
          >
            <Text style={[styles.modelButtonText, { color: colors.primary }]} numberOfLines={1}>
              {selectedModel ? selectedModel.name : 'Model'}
            </Text>
            <Ionicons name="chevron-down-outline" size={13} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleNewChat}
            style={styles.headerButton}
            activeOpacity={0.7}
          >
            <Ionicons name="add-circle-outline" size={24} color={colors.text} />
          </TouchableOpacity>
        </View>
      ),
    });
  }, [navigation, handleNewChat, selectedModel, colors.text, colors.primary, colors.primaryMuted]);

  const handleRefresh = useCallback(async () => {
    try {
      await connect();
    } catch (err) {
      console.error('Failed to reconnect:', err);
    }
  }, [connect]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={mode === 'dark' ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
      <ChatView
        status={status}
        messages={messages}
        onSendMessage={sendMessage}
        onStop={stopGeneration}
        onRefresh={handleRefresh}
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
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  modelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginRight: 4,
    maxWidth: 160,
  },
  modelButtonText: {
    fontSize: 14,
    fontWeight: '600',
    marginRight: 3,
  },
});
