/**
 * Local notifications for long-running work.
 *
 * Workflow runs and agent turns outlive the user's attention: they start one,
 * lock the phone, and the job keeps going server-side. This module is the
 * single seam between "something finished" and the OS notification tray, so
 * call sites (stores, services) never touch `expo-notifications` directly.
 *
 * Two invariants every export upholds:
 * - Nothing here throws into the caller. A denied permission, a missing native
 *   module, or a scheduling failure degrades to a logged no-op.
 * - Every notification carries `data.url` — a `nodetool://` deep link to the
 *   thing it refers to — so tapping it lands on the right screen.
 */
import * as Notifications from 'expo-notifications';
import { AppState, Platform } from 'react-native';

import { reportError } from './errorReporting';

const ANDROID_CHANNEL_ID = 'runs';

/** Deep-link scheme consumed by the navigation linking config. */
const DEEP_LINK_SCHEME = 'nodetool://';

/** Build the deep link for a job detail screen, e.g. `nodetool://job/abc123`. */
export function jobDeepLink(jobId: string): string {
  return `${DEEP_LINK_SCHEME}job/${encodeURIComponent(jobId)}`;
}

export interface RunFinishedNotification {
  /** Job id the run belongs to — drives the deep link. */
  jobId: string;
  /** Human-readable workflow name shown in the title. */
  workflowName?: string;
  /** Terminal outcome of the run. */
  outcome: 'completed' | 'failed' | 'cancelled';
  /** Failure detail, shown in the body when present. */
  error?: string;
}

let initialized = false;
let permissionGranted = false;

/** True while the app is on screen — a run the user is watching needs no push. */
function isForeground(): boolean {
  return AppState.currentState === 'active';
}

async function ensurePermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) {
    return true;
  }
  if (current.canAskAgain === false) {
    // The user already said no for good; re-prompting is a no-op at best.
    return false;
  }
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted === true;
}

/**
 * Set the foreground presentation handler, ask for permission, and create the
 * Android channel. Safe to call repeatedly; never throws.
 */
export async function initNotifications(): Promise<void> {
  if (initialized) {
    return;
  }
  initialized = true;

  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });

    permissionGranted = await ensurePermission();

    if (permissionGranted && Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
        name: 'Workflow runs',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }
  } catch (error) {
    reportError(error, { source: 'notifications.init' });
  }
}

function describe(run: RunFinishedNotification) {
  const name = run.workflowName?.trim() || 'Workflow';
  switch (run.outcome) {
    case 'completed':
      return { title: `${name} finished`, body: 'The run completed successfully.' };
    case 'cancelled':
      return { title: `${name} cancelled`, body: 'The run was cancelled.' };
    case 'failed':
      return {
        title: `${name} failed`,
        body: run.error?.trim() || 'The run failed.',
      };
  }
}

/**
 * Post an immediate local notification for a run that reached a terminal state.
 * Suppressed while the app is in the foreground (the user is already watching)
 * and when notification permission was never granted.
 */
export async function notifyRunFinished(run: RunFinishedNotification): Promise<void> {
  if (!permissionGranted || isForeground()) {
    return;
  }

  const { title, body } = describe(run);

  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: { url: jobDeepLink(run.jobId), jobId: run.jobId },
      },
      trigger: null,
    });
  } catch (error) {
    reportError(error, { source: 'notifications.notifyRunFinished' });
  }
}

/** Test-only: reset module state between tests. */
export function __resetNotificationsForTests(): void {
  initialized = false;
  permissionGranted = false;
}
