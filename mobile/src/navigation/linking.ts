import { LinkingOptions } from '@react-navigation/native';
import * as Linking from 'expo-linking';
import * as Notifications from 'expo-notifications';
import { RootStackParamList } from './types';
import { isNonEmptyString, isRecord } from '../utils/typePredicates';

/**
 * Reads the `url` a notification payload carries. Notification data is
 * attacker-adjacent free-form JSON, so anything that is not a string is
 * treated as "no link".
 */
const urlFromNotificationData = (data: unknown): string | null => {
  if (!isRecord(data)) {
    return null;
  }
  const url = (data as Record<string, unknown>).url;
  return isNonEmptyString(url) ? url : null;
};

const urlFromNotificationResponse = (
  response: Notifications.NotificationResponse | null
): string | null =>
  urlFromNotificationData(response?.notification.request.content.data);

/**
 * Deep-link configuration for the root stack.
 *
 * Paths are stable public surface — a `nodetool://job/<id>` URL is what the
 * job-finished notification puts in its payload, so renaming one breaks
 * already-delivered notifications.
 *
 * Auth: `App.tsx` mounts only `Login` while logged out. A link that resolves
 * to any other screen then produces a state the stack router cannot rehydrate;
 * it drops the unknown routes and the user stays on `Login` rather than
 * crashing. The link itself is consumed at that point — after signing in the
 * user lands on the normal home screen, not the linked target.
 */
export const linking: LinkingOptions<RootStackParamList> = {
  prefixes: [Linking.createURL('/'), 'nodetool://'],

  config: {
    screens: {
      Login: 'login',
      WorkflowsList: '',
      GraphEditor: 'workflow/:workflowId?',
      Chat: 'chat/:threadId?',
      Threads: 'threads',
      Documents: 'documents',
      Apps: 'apps',
      App: 'app/:applicationId',
      // Specific document kinds first — `document/:kind/:id` would otherwise
      // swallow all of them.
      StoryboardEditor: 'document/storyboard/:id',
      ScriptEditor: 'document/script/:id',
      JsScriptEditor: 'document/jsscript/:id',
      TimelineViewer: 'document/timeline/:id',
      SketchViewer: 'document/sketch/:id',
      DocumentViewer: 'document/:kind/:id',
      Assets: 'assets',
      AssetViewer: 'asset/:assetId',
      Jobs: 'jobs',
      Triggers: 'triggers',
      JobDetail: 'job/:jobId',
      Collections: 'collections',
      Settings: 'settings',
      Secrets: 'settings/secrets',
      LanguageModelSelection: 'settings/models',
    },
  },

  /**
   * Cold start: a real launch URL wins; otherwise fall back to the
   * notification the user tapped to open the app.
   */
  async getInitialURL(): Promise<string | null> {
    const url = await Linking.getInitialURL();
    if (url) {
      return url;
    }
    const response = await Notifications.getLastNotificationResponseAsync();
    return urlFromNotificationResponse(response);
  },

  /** Warm start: OS links and notification taps both feed the same listener. */
  subscribe(listener: (url: string) => void): () => void {
    const urlSubscription = Linking.addEventListener('url', ({ url }) => {
      listener(url);
    });

    const notificationSubscription =
      Notifications.addNotificationResponseReceivedListener((response) => {
        const url = urlFromNotificationResponse(response);
        if (url) {
          listener(url);
        }
      });

    return () => {
      urlSubscription.remove();
      notificationSubscription.remove();
    };
  },
};

export default linking;
