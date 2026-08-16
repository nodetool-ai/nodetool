import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator, Text, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RootStackParamList } from './src/navigation/types';
import WorkflowsListScreen from './src/screens/WorkflowsListScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import ChatScreen from './src/screens/ChatScreen';
import LanguageModelSelectionScreen from './src/screens/LanguageModelSelectionScreen';
import GraphEditorScreen from './src/screens/GraphEditorScreen';
import LoginScreen from './src/screens/LoginScreen';
import AssetsScreen from './src/screens/AssetsScreen';
import AssetViewerScreen from './src/screens/AssetViewerScreen';
import DocumentsScreen from './src/screens/DocumentsScreen';
import AppsScreen from './src/screens/AppsScreen';
import AppScreen from './src/screens/AppScreen';
import DocumentViewerScreen from './src/screens/DocumentViewerScreen';
import ScriptEditorScreen from './src/screens/ScriptEditorScreen';
import JsScriptEditorScreen from './src/screens/JsScriptEditorScreen';
import StoryboardEditorScreen from './src/screens/StoryboardEditorScreen';
import TimelineViewerScreen from './src/screens/TimelineViewerScreen';
import SketchViewerScreen from './src/screens/SketchViewerScreen';
import SecretsScreen from './src/screens/SecretsScreen';
import CollectionsScreen from './src/screens/CollectionsScreen';
import JobsScreen from './src/screens/JobsScreen';
import JobDetailScreen from './src/screens/JobDetailScreen';
import TriggersScreen from './src/screens/TriggersScreen';
import ThreadsScreen from './src/screens/ThreadsScreen';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { OfflineBanner } from './src/components/OfflineBanner';
import { apiService } from './src/services/api';
import { initNotifications } from './src/services/notifications';
import { useTheme } from './src/hooks/useTheme';
import { useReducedMotion } from './src/hooks/useReducedMotion';
import { useAppLifecycle } from './src/hooks/useAppLifecycle';
import { useAuthStore } from './src/stores/AuthStore';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { TRPCProvider } from './src/trpc/Provider';
import { linking } from './src/navigation/linking';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  const { colors, isDark } = useTheme();
  const reduceMotion = useReducedMotion();
  // Attaches the shared AppState subscription the sockets listen on.
  useAppLifecycle();
  const [isReady, setIsReady] = useState(false);
  const authState = useAuthStore((s) => s.state);
  const initializeAuth = useAuthStore((s) => s.initialize);
  const cleanupAuth = useAuthStore((s) => s.cleanup);

  useEffect(() => {
    const initialize = async () => {
      try {
        await apiService.loadApiHost();
        await initNotifications();
        await initializeAuth();
      } catch (error) {
        console.error('Failed to initialize app:', error);
      } finally {
        setIsReady(true);
      }
    };
    initialize();
    return () => {
      cleanupAuth();
    };
  }, [initializeAuth, cleanupAuth]);

  const isAuthResolving = !isReady || authState === 'init' || authState === 'loading';
  const isLoggedIn = authState === 'logged_in';

  if (isAuthResolving) {
    return (
      <View style={[splashStyles.container, { backgroundColor: colors.background }]}>
        <View style={[splashStyles.iconWrap, { backgroundColor: colors.primaryMuted }]}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
        <Text style={[splashStyles.text, { color: colors.textSecondary }]}>Loading...</Text>
      </View>
    );
  }

  return (
    <ErrorBoundary>
      <TRPCProvider>
      <SafeAreaProvider>
        <View style={splashStyles.root}>
        {/*
          Linking is attached only once logged in. Logged out, the navigator
          holds just the Login screen, so a nodetool:// link would resolve to
          route names that aren't mounted — React Navigation drops it and the
          link is consumed. Withholding the config leaves the launch URL (and
          the last notification response) unread until the navigator remounts
          with the real screens, at which point getInitialURL picks it up.
        */}
        <NavigationContainer linking={isLoggedIn ? linking : undefined}>
          <StatusBar style={isDark ? 'light' : 'dark'} />
          <Stack.Navigator
            screenOptions={{
              headerStyle: {
                backgroundColor: colors.surfaceHeader,
              },
              headerTintColor: colors.text,
              headerTitleStyle: {
                fontWeight: '700',
                fontSize: 17,
              },
              headerShadowVisible: false,
              headerBackTitle: '',
              contentStyle: {
                backgroundColor: colors.background,
              },
              animation: reduceMotion ? 'none' : 'slide_from_right',
            }}
          >
            {isLoggedIn ? (
              <>
                <Stack.Screen
                  name="WorkflowsList"
                  component={WorkflowsListScreen}
                  options={{ headerShown: false }}
                />
                <Stack.Screen
                  name="Settings"
                  component={SettingsScreen}
                  options={{ title: 'Settings' }}
                />
                <Stack.Screen
                  name="Chat"
                  component={ChatScreen}
                  options={{
                    title: 'Chat',
                  }}
                />
                <Stack.Screen
                  name="GraphEditor"
                  component={GraphEditorScreen}
                  options={{ title: 'Workflow Editor' }}
                />
                <Stack.Screen
                  name="LanguageModelSelection"
                  component={LanguageModelSelectionScreen}
                  options={{ title: 'Select Provider' }}
                />
                <Stack.Screen
                  name="Assets"
                  component={AssetsScreen}
                  options={{ title: 'Assets' }}
                />
                <Stack.Screen
                  name="AssetViewer"
                  component={AssetViewerScreen}
                  options={{ title: 'Asset' }}
                />
                <Stack.Screen
                  name="Documents"
                  component={DocumentsScreen}
                  options={{ title: 'Documents' }}
                />
                <Stack.Screen
                  name="Apps"
                  component={AppsScreen}
                  options={{ title: 'Apps' }}
                />
                <Stack.Screen
                  name="App"
                  component={AppScreen}
                  options={{ title: 'App' }}
                />
                <Stack.Screen
                  name="StoryboardEditor"
                  component={StoryboardEditorScreen}
                  options={{ title: 'Storyboard' }}
                />
                <Stack.Screen
                  name="ScriptEditor"
                  component={ScriptEditorScreen}
                  options={{ title: 'Script' }}
                />
                <Stack.Screen
                  name="JsScriptEditor"
                  component={JsScriptEditorScreen}
                  options={{ title: 'JS Script' }}
                />
                <Stack.Screen
                  name="TimelineViewer"
                  component={TimelineViewerScreen}
                  options={{ title: 'Timeline' }}
                />
                <Stack.Screen
                  name="SketchViewer"
                  component={SketchViewerScreen}
                  options={{ title: 'Sketch' }}
                />
                <Stack.Screen
                  name="DocumentViewer"
                  component={DocumentViewerScreen}
                  options={{ title: 'Document' }}
                />
                <Stack.Screen
                  name="Secrets"
                  component={SecretsScreen}
                  options={{ title: 'API Keys' }}
                />
                <Stack.Screen
                  name="Collections"
                  component={CollectionsScreen}
                  options={{ title: 'Collections' }}
                />
                <Stack.Screen
                  name="Jobs"
                  component={JobsScreen}
                  options={{ title: 'Jobs' }}
                />
                <Stack.Screen
                  name="Triggers"
                  component={TriggersScreen}
                  options={{ title: 'Triggers' }}
                />
                <Stack.Screen
                  name="JobDetail"
                  component={JobDetailScreen}
                  options={{ title: 'Job' }}
                />
                <Stack.Screen
                  name="Threads"
                  component={ThreadsScreen}
                  options={{ title: 'Conversations' }}
                />
              </>
            ) : (
              <Stack.Screen
                name="Login"
                component={LoginScreen}
                options={{ headerShown: false }}
              />
            )}
          </Stack.Navigator>
        </NavigationContainer>
        <OfflineBanner />
        </View>
      </SafeAreaProvider>
      </TRPCProvider>
    </ErrorBoundary>
  );
}

const splashStyles = StyleSheet.create({
  root: {
    flex: 1,
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  text: {
    fontSize: 15,
  },
});
