import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RootStackParamList } from './src/navigation/types';
import MiniAppsListScreen from './src/screens/MiniAppsListScreen';
import MiniAppScreen from './src/screens/MiniAppScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import ChatScreen from './src/screens/ChatScreen';
import LanguageModelSelectionScreen from './src/screens/LanguageModelSelectionScreen';
import { apiService } from './src/services/api';
import { useTheme } from './src/hooks/useTheme';
import { SafeAreaProvider } from 'react-native-safe-area-context';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  const { colors, isDark } = useTheme();

  useEffect(() => {
    // Load API host on app start
    apiService.loadApiHost();
  }, []);

  return (
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
            fontWeight: 'bold',
          },
          contentStyle: {
            backgroundColor: colors.background,
          },
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
          name="LanguageModelSelection"
          component={LanguageModelSelectionScreen}
          options={{ title: 'Select Provider' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  </SafeAreaProvider>
);
}
