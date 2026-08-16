import type { PermissionStatus } from 'expo-modules-core';
import * as Notifications from 'expo-notifications';
import { AppState, Platform } from 'react-native';

import {
  initNotifications,
  jobDeepLink,
  notifyRunFinished,
  __resetNotificationsForTests,
} from './notifications';

const mockNotifications = Notifications as jest.Mocked<typeof Notifications>;

/** Pretend the app is backgrounded (the case where a notification is useful). */
function setAppState(state: 'active' | 'background'): void {
  Object.defineProperty(AppState, 'currentState', {
    value: state,
    configurable: true,
    writable: true,
  });
}

/**
 * `PermissionStatus` is a string enum in `expo-modules-core`, but importing it
 * as a value loads Expo's native EventEmitter, which has no host under Jest.
 */
// SAFETY: these are the enum's own member values.
const GRANTED_STATUS = 'granted' as PermissionStatus;
const DENIED_STATUS = 'denied' as PermissionStatus;

/** A full `NotificationPermissionsStatus`, so the doubles need no assertion. */
const permissionStatus = (
  granted: boolean,
  canAskAgain: boolean
): Notifications.NotificationPermissionsStatus => ({
  granted,
  canAskAgain,
  status: granted ? GRANTED_STATUS : DENIED_STATUS,
  expires: 'never',
});

describe('notifications', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetNotificationsForTests();
    setAppState('background');
    mockNotifications.getPermissionsAsync.mockResolvedValue(
      permissionStatus(true, true)
    );
    mockNotifications.requestPermissionsAsync.mockResolvedValue(
      permissionStatus(true, true)
    );
  });

  afterEach(() => {
    Platform.OS = 'ios';
  });

  it('builds a nodetool:// deep link for a job', () => {
    expect(jobDeepLink('abc123')).toBe('nodetool://job/abc123');
  });

  it('installs the handler and does not re-request permission on repeat init', async () => {
    await initNotifications();
    await initNotifications();

    expect(mockNotifications.setNotificationHandler).toHaveBeenCalledTimes(1);
    expect(mockNotifications.getPermissionsAsync).toHaveBeenCalledTimes(1);
  });

  it('requests permission only when not already granted', async () => {
    mockNotifications.getPermissionsAsync.mockResolvedValue(
      permissionStatus(false, true)
    );

    await initNotifications();

    expect(mockNotifications.requestPermissionsAsync).toHaveBeenCalled();
  });

  it('creates the Android channel on Android only', async () => {
    Platform.OS = 'android';
    await initNotifications();
    expect(mockNotifications.setNotificationChannelAsync).toHaveBeenCalledWith(
      'runs',
      expect.objectContaining({ name: 'Workflow runs' })
    );

    __resetNotificationsForTests();
    jest.clearAllMocks();
    Platform.OS = 'ios';
    await initNotifications();
    expect(mockNotifications.setNotificationChannelAsync).not.toHaveBeenCalled();
  });

  it('never throws when the native module fails', async () => {
    mockNotifications.getPermissionsAsync.mockRejectedValue(new Error('no native module'));

    await expect(initNotifications()).resolves.toBeUndefined();

    await notifyRunFinished({ jobId: 'j1', outcome: 'completed' });
    expect(mockNotifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('schedules an immediate notification carrying the deep link', async () => {
    await initNotifications();

    await notifyRunFinished({
      jobId: 'job-9',
      workflowName: 'Summarize',
      outcome: 'completed',
    });

    expect(mockNotifications.scheduleNotificationAsync).toHaveBeenCalledWith({
      content: {
        title: 'Summarize finished',
        body: 'The run completed successfully.',
        data: { url: 'nodetool://job/job-9', jobId: 'job-9' },
      },
      trigger: null,
    });
  });

  it('puts the error text in the body of a failed run', async () => {
    await initNotifications();

    await notifyRunFinished({
      jobId: 'job-9',
      workflowName: 'Summarize',
      outcome: 'failed',
      error: 'node blew up',
    });

    const arg = mockNotifications.scheduleNotificationAsync.mock.calls[0][0];
    expect(arg.content.title).toBe('Summarize failed');
    expect(arg.content.body).toBe('node blew up');
  });

  it('falls back to a generic title when no workflow name is given', async () => {
    await initNotifications();

    await notifyRunFinished({ jobId: 'job-9', outcome: 'cancelled' });

    const arg = mockNotifications.scheduleNotificationAsync.mock.calls[0][0];
    expect(arg.content.title).toBe('Workflow cancelled');
  });

  it('suppresses the notification while the app is in the foreground', async () => {
    await initNotifications();
    setAppState('active');

    await notifyRunFinished({ jobId: 'job-9', outcome: 'completed' });

    expect(mockNotifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('does nothing when permission was denied', async () => {
    mockNotifications.getPermissionsAsync.mockResolvedValue(
      permissionStatus(false, false)
    );

    await initNotifications();
    await notifyRunFinished({ jobId: 'job-9', outcome: 'completed' });

    expect(mockNotifications.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(mockNotifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('does not reject when scheduling fails', async () => {
    await initNotifications();
    mockNotifications.scheduleNotificationAsync.mockRejectedValue(new Error('tray full'));

    await expect(
      notifyRunFinished({ jobId: 'job-9', outcome: 'completed' })
    ).resolves.toBeUndefined();
  });
});
