import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator, Text, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RootStackParamList } from './src/navigation/types';
import MiniAppsListScreen from './src/screens/MiniAppsListScreen';
import MiniAppScreen from './src/screens/MiniAppScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import ChatScreen from './src/screens/ChatScreen';
import LanguageModelSelectionScreen from './src/screens/LanguageModelSelectionScreen';
import GraphEditorScreen from './src/screens/GraphEditorScreen';
import LoginScreen from './src/screens/LoginScreen';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { apiService } from './src/services/api';
import { useTheme } from './src/hooks/useTheme';
import { useAuthStore } from './src/stores/AuthStore';
import { SafeAreaProvider } from 'react-native-safe-area-context';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  const { colors, isDark } = useTheme();
  const [isReady, setIsReady] = useState(false);
  const authState = useAuthStore((s) => s.state);
  const initializeAuth = useAuthStore((s) => s.initialize);
  const cleanupAuth = useAuthStore((s) => s.cleanup);

  useEffect(() => {
    const initialize = async () => {
      try {
        await apiService.loadApiHost();
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
      <SafeAreaProvider>
        <NavigationContainer>
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
              animation: 'slide_from_right',
            }}
          >
            {isLoggedIn ? (
              <>
                <Stack.Screen
                  name="MiniAppsList"
                  component={MiniAppsListScreen}
                  options={{ headerShown: false }}
                />
                <Stack.Screen
                  name="MiniApp"
                  component={MiniAppScreen}
                  options={{ title: 'Mini App' }}
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
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}

const splashStyles = StyleSheet.create({
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
