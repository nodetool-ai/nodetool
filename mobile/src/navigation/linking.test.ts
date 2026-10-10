import type { EmitterSubscription } from 'react-native';
import * as Linking from 'expo-linking';
import * as Notifications from 'expo-notifications';
import { getStateFromPath } from '@react-navigation/native';
import { linking } from './linking';
import type { MainTabParamList, RootStackParamList } from './types';

type Screens = NonNullable<NonNullable<typeof linking.config>['screens']>;

const mockedLinking = Linking as jest.Mocked<typeof Linking>;

/** `linking.subscribe` only calls `.remove()`; `EmitterSubscription` is wider. */
const urlSubscription = (remove: () => void): EmitterSubscription => {
  const partial: Pick<EmitterSubscription, 'remove'> = { remove };
  // SAFETY: nothing under test reads any other member of the subscription.
  return partial as EmitterSubscription;
};
const mockedNotifications = Notifications as jest.Mocked<typeof Notifications>;

const notificationResponse = (
  data: Record<string, unknown>
): Notifications.NotificationResponse => ({
  actionIdentifier: Notifications.DEFAULT_ACTION_IDENTIFIER,
  notification: {
    date: 0,
    request: {
      identifier: 'req-1',
      content: {
        title: null,
        subtitle: null,
        body: null,
        data,
        categoryIdentifier: null,
        sound: null,
        launchImageName: null,
        badge: null,
        attachments: [],
        threadIdentifier: null,
      },
      trigger: null,
    },
  },
});

/** Resolve a path the way NavigationContainer does, then read the leaf route. */
const routeForPath = (path: string) => {
  const state = getStateFromPath(path, linking.config);
  if (!state) {
    throw new Error(`no state for path: ${path}`);
  }
  let route = state.routes[state.routes.length - 1];
  while (route.state?.routes) {
    route = route.state.routes[route.state.routes.length - 1];
  }
  return { name: route.name, params: route.params };
};

describe('linking', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedLinking.getInitialURL.mockResolvedValue(null);
    mockedNotifications.getLastNotificationResponseAsync.mockResolvedValue(null);
    mockedLinking.addEventListener.mockReturnValue(urlSubscription(jest.fn()));
    mockedNotifications.addNotificationResponseReceivedListener.mockReturnValue(
      { remove: jest.fn() }
    );
  });

  it('includes the app scheme and the Expo-generated prefix', () => {
    // The expo-linking mock renders createURL('/') as 'nodetool:///'.
    expect(linking.prefixes).toEqual(['nodetool:///', 'nodetool://']);
  });

  it('maps every route in the param list', () => {
    // Tab routes live one level down, under `Main`.
    const leafNames = (screens: Screens): string[] =>
      Object.entries(screens).flatMap(([name, entry]) =>
        typeof entry === 'object' && entry !== null && 'screens' in entry && entry.screens
          ? leafNames(entry.screens as Screens)
          : [name]
      );
    const screens = linking.config?.screens as Screens;
    // A folder is only ever pushed from the Assets tab, so it has no path.
    const expected: (Exclude<keyof RootStackParamList, 'Main' | 'AssetFolder'> | keyof MainTabParamList)[] = [
      'Login',
      'Chat',
      'Threads',
      'Documents',
      'Apps',
      'App',
      'StoryboardEditor',
      'TimelineViewer',
      'SketchViewer',
      'Assets',
      'AssetViewer',
      'Jobs',
      'JobDetail',
      'Settings',
      'LanguageModelSelection',
    ];
    expect(leafNames(screens).sort()).toEqual([...expected].sort());
  });

  describe('path resolution', () => {
    it('routes job/:jobId to JobDetail', () => {
      expect(routeForPath('/job/job-42')).toEqual({
        name: 'JobDetail',
        params: { jobId: 'job-42' },
      });
    });

    it('keeps the tabs under a pushed screen so Back has somewhere to go', () => {
      const state = getStateFromPath('/job/job-42', linking.config);
      expect(state?.routes.map((route) => route.name)).toEqual(['Main', 'JobDetail']);
    });

    it('routes the tab paths into the tab navigator', () => {
      const state = getStateFromPath('/jobs', linking.config);
      expect(state?.routes[0].name).toBe('Main');
      expect(routeForPath('/jobs').name).toBe('Jobs');
      expect(routeForPath('/documents').name).toBe('Documents');
    });

    it('routes asset/:assetId to AssetViewer', () => {
      expect(routeForPath('/asset/a1')).toEqual({
        name: 'AssetViewer',
        params: { assetId: 'a1' },
      });
    });

    it('routes chat with and without a thread id', () => {
      expect(routeForPath('/chat').name).toBe('Chat');
      expect(routeForPath('/chat/t1')).toEqual({
        name: 'Chat',
        params: { threadId: 't1' },
      });
    });

    it('routes the kept document kinds to their screens', () => {
      expect(routeForPath('/document/storyboard/d1').name).toBe('StoryboardEditor');
      expect(routeForPath('/document/timeline/d1').name).toBe('TimelineViewer');
      expect(routeForPath('/document/sketch/d1').name).toBe('SketchViewer');
    });

    it('routes the root to Apps and app/:applicationId to a single app', () => {
      expect(routeForPath('/').name).toBe('Apps');
      expect(routeForPath('/apps').name).toBe('Apps');
      expect(routeForPath('/app/a1')).toEqual({
        name: 'App',
        params: { applicationId: 'a1' },
      });
    });

    it('routes the plain settings path', () => {
      expect(routeForPath('/settings').name).toBe('Settings');
    });
  });

  describe('getInitialURL', () => {
    it('returns the launch URL when there is one', async () => {
      mockedLinking.getInitialURL.mockResolvedValue('nodetool://jobs');
      await expect(linking.getInitialURL?.()).resolves.toBe('nodetool://jobs');
      expect(
        mockedNotifications.getLastNotificationResponseAsync
      ).not.toHaveBeenCalled();
    });

    it('falls back to the tapped notification URL', async () => {
      mockedNotifications.getLastNotificationResponseAsync.mockResolvedValue(
        notificationResponse({ url: 'nodetool://job/job-7' })
      );
      await expect(linking.getInitialURL?.()).resolves.toBe('nodetool://job/job-7');
    });

    it('returns null when neither source has a URL', async () => {
      await expect(linking.getInitialURL?.()).resolves.toBeNull();
    });

    it('ignores a non-string url in the notification payload', async () => {
      mockedNotifications.getLastNotificationResponseAsync.mockResolvedValue(
        notificationResponse({ url: 42 })
      );
      await expect(linking.getInitialURL?.()).resolves.toBeNull();
    });
  });

  describe('subscribe', () => {
    it('forwards OS url events', () => {
      const listener = jest.fn();
      linking.subscribe?.(listener);

      const handler = mockedLinking.addEventListener.mock.calls[0][1];
      handler({ url: 'nodetool://threads' });

      expect(listener).toHaveBeenCalledWith('nodetool://threads');
    });

    it('forwards notification taps and skips payloads without a url', () => {
      const listener = jest.fn();
      linking.subscribe?.(listener);

      const handler =
        mockedNotifications.addNotificationResponseReceivedListener.mock.calls[0][0];
      handler(notificationResponse({ url: 'nodetool://job/job-9' }));
      handler(notificationResponse({ jobId: 'job-9' }));

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith('nodetool://job/job-9');
    });

    it('removes both subscriptions on cleanup', () => {
      const removeUrl = jest.fn();
      const removeNotification = jest.fn();
      mockedLinking.addEventListener.mockReturnValue(urlSubscription(removeUrl));
      mockedNotifications.addNotificationResponseReceivedListener.mockReturnValue(
        { remove: removeNotification }
      );

      linking.subscribe?.(jest.fn())?.();

      expect(removeUrl).toHaveBeenCalledTimes(1);
      expect(removeNotification).toHaveBeenCalledTimes(1);
    });
  });
});
