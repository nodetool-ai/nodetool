/**
 * Thread list screen for managing conversation threads.
 */

import React, { useEffect, useCallback } from 'react';
import {
  SafeAreaView,
  StyleSheet,
  StatusBar,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { ThreadList } from '../components/chat';
import { useChatStore } from '../stores/ChatStore';
import { useTheme } from '../hooks/useTheme';

type Props = NativeStackScreenProps<RootStackParamList, 'ThreadList'>;

export default function ThreadListScreen({ navigation }: Props) {
  const {
    threads,
    currentThreadId,
    isLoadingThreads,
    threadsLoaded,
    fetchThreads,
    createNewThread,
    switchThread,
    deleteThread,
    getThreadList,
  } = useChatStore();
  const { colors, mode } = useTheme();

  // Fetch threads on mount if not loaded
  useEffect(() => {
    if (!threadsLoaded) {
      fetchThreads();
    }
  }, [threadsLoaded, fetchThreads]);

  const handleSelectThread = useCallback((threadId: string) => {
    switchThread(threadId);
    navigation.navigate('Chat');
  }, [switchThread, navigation]);

  const handleNewThread = useCallback(async () => {
    await createNewThread();
    navigation.navigate('Chat');
  }, [createNewThread, navigation]);

  const handleDeleteThread = useCallback(async (threadId: string) => {
    try {
      await deleteThread(threadId);
    } catch (error) {
      console.error('Failed to delete thread:', error);
    }
  }, [deleteThread]);

  const handleRefresh = useCallback(() => {
    fetchThreads();
  }, [fetchThreads]);

  const threadList = getThreadList();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={mode === 'dark' ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
      <ThreadList
        threads={threadList}
        currentThreadId={currentThreadId}
        isLoading={isLoadingThreads}
        onSelectThread={handleSelectThread}
        onDeleteThread={handleDeleteThread}
        onNewThread={handleNewThread}
        onRefresh={handleRefresh}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
