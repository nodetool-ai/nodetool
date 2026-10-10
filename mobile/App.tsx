import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RootStackParamList } from './src/navigation/types';
import SettingsScreenBase from './src/screens/SettingsScreen';
import LanguageModelSelectionScreenBase from './src/screens/LanguageModelSelectionScreen';
import LoginScreenBase from './src/screens/LoginScreen';
import AssetsScreenBase from './src/screens/AssetsScreen';
import AssetViewerScreenBase from './src/screens/AssetViewerScreen';
import AppScreenBase from './src/screens/AppScreen';
import StoryboardEditorScreenBase from './src/screens/StoryboardEditorScreen';
import TimelineViewerScreenBase from './src/screens/TimelineViewerScreen';
import SketchViewerScreenBase from './src/screens/SketchViewerScreen';
import JobDetailScreenBase from './src/screens/JobDetailScreen';
import ThreadsScreenBase from './src/screens/ThreadsScreen';
import { ErrorBoundary, withScreenBoundary } from './src/components/ErrorBoundary';
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
import { MainTabs } from './src/navigation/MainTabs';
import { BrandMark } from './src/components/BrandMark';
import { FONT_SIZE, FONT_WEIGHT } from './src/utils/tokens';

const Stack = createNativeStackNavigator<RootStackParamList>();

// Each screen gets its own error boundary, so a render error in one leaves
// the header and back navigation working.
const SettingsScreen = withScreenBoundary(SettingsScreenBase, 'Settings');
const LanguageModelSelectionScreen = withScreenBoundary(LanguageModelSelectionScreenBase, 'LanguageModelSelection');
const LoginScreen = withScreenBoundary(LoginScreenBase, 'Login');
const AssetViewerScreen = withScreenBoundary(AssetViewerScreenBase, 'AssetViewer');
const AppScreen = withScreenBoundary(AppScreenBase, 'App');
const StoryboardEditorScreen = withScreenBoundary(StoryboardEditorScreenBase, 'StoryboardEditor');
const TimelineViewerScreen = withScreenBoundary(TimelineViewerScreenBase, 'TimelineViewer');
const SketchViewerScreen = withScreenBoundary(SketchViewerScreenBase, 'SketchViewer');
const JobDetailScreen = withScreenBoundary(JobDetailScreenBase, 'JobDetail');
const ThreadsScreen = withScreenBoundary(ThreadsScreenBase, 'Threads');
const AssetFolderScreen = withScreenBoundary(AssetsScreenBase, 'AssetFolder');


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
        <BrandMark size={72} />
        <ActivityIndicator
          style={splashStyles.spinner}
          color={colors.textSecondary}
          accessibilityLabel="Loading"
        />
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
                fontWeight: FONT_WEIGHT.semibold,
                fontSize: FONT_SIZE.headline,
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
                  name="Main"
                  component={MainTabs}
                  options={{ headerShown: false }}
                />
                <Stack.Screen
                  name="Settings"
                  component={SettingsScreen}
                  options={{ title: 'Settings' }}
                />
                <Stack.Screen
                  name="LanguageModelSelection"
                  component={LanguageModelSelectionScreen}
                  options={{ title: 'Select provider' }}
                />
                <Stack.Screen
                  name="AssetFolder"
                  component={AssetFolderScreen}
                  options={({ route }) => ({ title: route.params.folderName ?? 'Folder' })}
                />
                <Stack.Screen
                  name="AssetViewer"
                  component={AssetViewerScreen}
                  options={{ title: 'Asset' }}
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
  spinner: {
    marginTop: 24,
  },
});
