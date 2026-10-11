import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { CompositeNavigationProp, NavigatorScreenParams, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

/**
 * The tab bar: the companion's five top-level surfaces. Settings is reached
 * from the gear on the Apps header.
 */
export type MainTabParamList = {
  /** Browse the apps hosted on the server. The home tab after login. */
  Apps: undefined;
  Chat: { threadId?: string } | undefined;
  /** Browse timelines, sketches, and storyboards in one list. */
  Documents: undefined;
  /** Job history, optionally narrowed to one workflow. */
  Jobs: { workflowId?: string } | undefined;
  Assets: undefined;
};

/**
 * The root stack: the tabs as one `Main` route, and every screen pushed above
 * them. A pushed screen reaches a tab through `Main`, as in
 * `navigate('Main', { screen: 'Chat' })`.
 */
export type RootStackParamList = {
  Main: NavigatorScreenParams<MainTabParamList> | undefined;
  Login: undefined;
  Settings: undefined;
  LanguageModelSelection: undefined;
  /** One asset folder, pushed over the Assets tab. */
  AssetFolder: {
    parentId: string;
    folderName?: string;
  };
  AssetViewer: {
    assetId: string;
  };
  /** One app. `name` seeds the header before the load resolves. */
  App: {
    applicationId: string;
    name?: string;
  };
  /** Storyboard editor. `name` seeds the header before the load resolves. */
  StoryboardEditor: {
    id: string;
    name?: string;
  };
  /** Read-only timeline. */
  TimelineViewer: {
    id: string;
    name?: string;
  };
  /** Read-only sketch: composited layers plus their generation status. */
  SketchViewer: {
    id: string;
    name?: string;
  };
  /** One job: status, timing, cost, error, and its outputs. */
  JobDetail: { jobId: string };
  Threads: undefined;
};

/**
 * A tab screen's `navigation`: its own tab navigator first, so `navigate`
 * switches tabs, then the root stack, so it can push any screen above the bar.
 */
export type TabScreenNavigationProp<T extends keyof MainTabParamList> = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, T>,
  NativeStackNavigationProp<RootStackParamList>
>;

export type TabScreenRouteProp<T extends keyof MainTabParamList> = RouteProp<MainTabParamList, T>;
