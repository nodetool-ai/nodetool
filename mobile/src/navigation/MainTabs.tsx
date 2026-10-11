/**
 * The tab bar: Apps, Chat, Documents, Jobs and Assets, the companion's five
 * top-level surfaces. Each tab is one screen; anything opened from a tab is
 * pushed on the root stack above the bar, so detail screens get the full
 * height and a back button.
 */
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MainTabParamList } from './types';
import { useTheme } from '../hooks/useTheme';
import { FONT_SIZE, FONT_WEIGHT } from '../utils/tokens';
import { withScreenBoundary } from '../components/ErrorBoundary';
import AppsScreenBase from '../screens/AppsScreen';
import ChatScreenBase from '../screens/ChatScreen';
import DocumentsScreenBase from '../screens/DocumentsScreen';
import JobsScreenBase from '../screens/JobsScreen';
import AssetsScreenBase from '../screens/AssetsScreen';

const Tab = createBottomTabNavigator<MainTabParamList>();

const AppsScreen = withScreenBoundary(AppsScreenBase, 'Apps');
const ChatScreen = withScreenBoundary(ChatScreenBase, 'Chat');
const DocumentsScreen = withScreenBoundary(DocumentsScreenBase, 'Documents');
const JobsScreen = withScreenBoundary(JobsScreenBase, 'Jobs');
const AssetsScreen = withScreenBoundary(AssetsScreenBase, 'Assets');

type IconName = keyof typeof Ionicons.glyphMap;

/** Outline when idle, filled when selected, the iOS and Material convention. */
const TAB_ICONS: Record<keyof MainTabParamList, [IconName, IconName]> = {
  Apps: ['grid-outline', 'grid'],
  Chat: ['chatbubble-ellipses-outline', 'chatbubble-ellipses'],
  Documents: ['documents-outline', 'documents'],
  Jobs: ['pulse-outline', 'pulse'],
  Assets: ['images-outline', 'images'],
};

const TAB_BAR_HEIGHT = 52;

export function MainTabs() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Tab.Navigator
      initialRouteName="Apps"
      screenOptions={({ route }) => ({
        headerStyle: {
          backgroundColor: colors.surfaceHeader,
          borderBottomColor: colors.borderLight,
          borderBottomWidth: StyleSheet.hairlineWidth,
          elevation: 0,
          shadowOpacity: 0,
        },
        headerTintColor: colors.text,
        // A tab root is a place, not a step, so its title sits left and large.
        headerTitleAlign: 'left',
        headerTitleStyle: {
          fontSize: FONT_SIZE.title,
          fontWeight: FONT_WEIGHT.bold,
          letterSpacing: -0.4,
        },
        sceneStyle: { backgroundColor: colors.background },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textTertiary,
        tabBarStyle: {
          // Three points over the UIKit default, so an 11pt label clears the
          // icon box without clipping its descenders.
          height: TAB_BAR_HEIGHT + insets.bottom,
          backgroundColor: colors.surfaceHeader,
          borderTopColor: colors.borderLight,
          borderTopWidth: StyleSheet.hairlineWidth,
          elevation: 0,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          lineHeight: 13,
          fontWeight: FONT_WEIGHT.medium,
        },
        // Android resizes the window for the keyboard, which would lift the
        // bar above it and squeeze the chat composer.
        tabBarHideOnKeyboard: true,
        tabBarIcon: ({ focused, color, size }) => {
          const [idle, selected] = TAB_ICONS[route.name];
          return <Ionicons name={focused ? selected : idle} size={size - 2} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Apps" component={AppsScreen} options={{ title: 'Apps' }} />
      <Tab.Screen name="Chat" component={ChatScreen} options={{ title: 'Chat' }} />
      <Tab.Screen name="Documents" component={DocumentsScreen} options={{ title: 'Documents' }} />
      <Tab.Screen name="Jobs" component={JobsScreen} options={{ title: 'Jobs' }} />
      <Tab.Screen name="Assets" component={AssetsScreen} options={{ title: 'Assets' }} />
    </Tab.Navigator>
  );
}

export default MainTabs;
