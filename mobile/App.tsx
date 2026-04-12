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
import AssetsScreen from './src/screens/AssetsScreen';
import AssetViewerScreen from './src/screens/AssetViewerScreen';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { apiService } from './src/services/api';
import { useTheme } from './src/hooks/useTheme';
import { SafeAreaProvider } from 'react-native-safe-area-context';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  const { colors, isDark } = useTheme();
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const initialize = async () => {
      try {
        await apiService.loadApiHost();
      } catch (error) {
        console.error('Failed to load API host:', error);
      } finally {
        setIsReady(true);
      }
    };
    initialize();
  }, []);

  if (!isReady) {
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
            initialRouteName="MiniAppsList"
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
