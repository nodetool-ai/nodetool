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

export default function ChatScreen({ navigation, route }: Props) {
  const status = useChatStore(state => state.status);
  const error = useChatStore(state => state.error);
  const statusMessage = useChatStore(state => state.statusMessage);
  const currentThreadId = useChatStore(state => state.currentThreadId);
  const connect = useChatStore(state => state.connect);
  const createNewThread = useChatStore(state => state.createNewThread);
  const loadThreadFromServer = useChatStore(state => state.loadThreadFromServer);
  const getCurrentMessages = useChatStore(state => state.getCurrentMessages);
  const selectedModel = useChatStore(state => state.selectedModel);
  const sendMessage = useChatStore(state => state.sendMessage);
  const stopGeneration = useChatStore(state => state.stopGeneration);
  const agentMode = useChatStore(state => state.agentMode);
  const helpMode = useChatStore(state => state.helpMode);
  const selectedCollections = useChatStore(state => state.selectedCollections);
  const setAgentMode = useChatStore(state => state.setAgentMode);
  const setHelpMode = useChatStore(state => state.setHelpMode);
  const setSelectedCollections = useChatStore(state => state.setSelectedCollections);

  const { colors, mode } = useTheme();

  const messages = getCurrentMessages();
  const requestedThreadId = route.params?.threadId;

  useEffect(() => {
    const initializeChat = async () => {
      try {
        await connect();
        if (requestedThreadId) {
          if (requestedThreadId !== currentThreadId) {
            await loadThreadFromServer(requestedThreadId);
          }
        } else if (!currentThreadId) {
          await createNewThread();
        }
      } catch (err) {
        console.error('Failed to connect to chat:', err);
      }
    };

    initializeChat();
  }, [connect, currentThreadId, createNewThread, loadThreadFromServer, requestedThreadId]);

  const handleNewChat = useCallback(async () => {
    try {
      await createNewThread();
    } catch (err) {
      console.error('Failed to create new thread:', err);
    }
  }, [createNewThread]);

  const handleOpenThreads = useCallback(() => {
    navigation.navigate('Threads');
  }, [navigation]);

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
            onPress={handleOpenThreads}
            style={styles.headerButton}
            activeOpacity={0.7}
            accessibilityLabel="View past conversations"
          >
            <Ionicons name="time-outline" size={22} color={colors.text} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleNewChat}
            style={styles.headerButton}
            activeOpacity={0.7}
            accessibilityLabel="Start new conversation"
          >
            <Ionicons name="add-circle-outline" size={24} color={colors.text} />
          </TouchableOpacity>
        </View>
      ),
    });
  }, [navigation, handleNewChat, handleOpenThreads, selectedModel, colors.text, colors.primary, colors.primaryMuted]);

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
        agentMode={agentMode}
        helpMode={helpMode}
        selectedCollections={selectedCollections}
        onToggleAgentMode={setAgentMode}
        onToggleHelpMode={setHelpMode}
        onChangeCollections={setSelectedCollections}
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
