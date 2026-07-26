/**
 * Tests for TriggersScreen — the four load states are distinct, and the
 * arm/disarm control is the kill switch, so it must reach the right
 * registration id.
 */

import React from 'react';
import { Alert } from 'react-native';
import { render, screen, fireEvent } from '@testing-library/react-native';

import TriggersScreen, { mergeTriggerRows, formatInterval, type TriggerRow } from '../TriggersScreen';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

type QueryResult = {
  data?: unknown;
  isLoading: boolean;
  isRefetching: boolean;
  error: { message: string } | null;
  refetch: () => void;
};

const idle = { isLoading: false, isRefetching: false, error: null, refetch: jest.fn() };

const mockState: {
  running: QueryResult;
  workflows: QueryResult;
  byWorkflow: QueryResult[];
} = {
  running: { ...idle, data: { triggers: [] } },
  workflows: { ...idle, data: { workflows: [] } },
  byWorkflow: [],
};

const mockStartMutate = jest.fn();
const mockStopMutate = jest.fn();

jest.mock('../../trpc/client', () => ({
  trpc: {
    useUtils: () => ({
      jobs: { triggersRunning: { invalidate: jest.fn() } },
      triggers: { listByWorkflow: { invalidate: jest.fn() } },
    }),
    useQueries: () => mockState.byWorkflow,
    jobs: {
      triggersRunning: { useQuery: () => mockState.running },
      triggerStart: { useMutation: () => ({ mutate: mockStartMutate }) },
      triggerStop: { useMutation: () => ({ mutate: mockStopMutate }) },
    },
    workflows: { list: { useQuery: () => mockState.workflows } },
  },
}));

const navigation = { navigate: jest.fn(), setOptions: jest.fn(), goBack: jest.fn() };

function renderScreen() {
  return render(<TriggersScreen navigation={navigation as never} />);
}

const inFiveMinutes = new Date(Date.now() + 5 * 60_000).toISOString();

const scheduleTrigger = {
  id: 'reg-schedule',
  workflow_id: 'wf-1',
  node_id: 'node-sched',
  kind: 'schedule',
  enabled: true,
  last_fired_at: new Date(Date.now() - 2 * 60_000).toISOString(),
  last_error: null,
  next_fire_at: inFiveMinutes,
  interval_seconds: 900,
};

const webhookTrigger = {
  id: 'reg-webhook',
  workflow_id: 'wf-2',
  node_id: 'node-hook',
  kind: 'webhook',
  enabled: false,
  last_fired_at: null,
  last_error: null,
};

const brokenTrigger = {
  id: 'reg-broken',
  workflow_id: 'wf-2',
  node_id: 'node-broken',
  kind: 'schedule',
  enabled: true,
  last_fired_at: new Date(Date.now() - 3 * 3_600_000).toISOString(),
  last_error: 'Provider returned 500',
};

function loadedWith(triggers: unknown[]) {
  mockState.running = {
    ...idle,
    data: { triggers: triggers.filter((t) => (t as { enabled: boolean }).enabled) },
  };
  mockState.workflows = {
    ...idle,
    data: {
      workflows: [
        { id: 'wf-1', name: 'Fox Painter' },
        { id: 'wf-2', name: 'Inbox Sorter' },
      ],
    },
  };
  mockState.byWorkflow = [
    { ...idle, data: { triggers: triggers.filter((t) => (t as { workflow_id: string }).workflow_id === 'wf-1') } },
    { ...idle, data: { triggers: triggers.filter((t) => (t as { workflow_id: string }).workflow_id === 'wf-2') } },
  ];
}

describe('TriggersScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    loadedWith([]);
  });

  it('shows a loading state that is not the empty state', () => {
    mockState.running = { ...idle, isLoading: true, data: undefined };
    renderScreen();

    expect(screen.getByText('Loading triggers...')).toBeTruthy();
    expect(screen.queryByText('No triggers yet')).toBeNull();
  });

  it('shows the server error instead of pretending there are no triggers', () => {
    mockState.running = { ...idle, error: { message: 'connection refused' }, data: undefined };
    renderScreen();

    expect(screen.getByText('Could not load triggers')).toBeTruthy();
    expect(screen.getByText('connection refused')).toBeTruthy();
    expect(screen.queryByText('No triggers yet')).toBeNull();
    expect(screen.getByLabelText('Retry loading triggers')).toBeTruthy();
  });

  it('shows an empty state once the load succeeds with nothing armed', () => {
    renderScreen();

    expect(screen.getByText('No triggers yet')).toBeTruthy();
    expect(screen.queryByText('Loading triggers...')).toBeNull();
  });

  it('renders kind, state, last fire, next fire, and interval', () => {
    loadedWith([scheduleTrigger, webhookTrigger]);
    renderScreen();

    expect(screen.getByText('Fox Painter')).toBeTruthy();
    expect(screen.getByText('Schedule')).toBeTruthy();
    expect(screen.getByText('Armed')).toBeTruthy();
    expect(screen.getByText('Fired 2m ago')).toBeTruthy();
    expect(screen.getByText('Next in 5m')).toBeTruthy();
    expect(screen.getByText('every 15m')).toBeTruthy();

    expect(screen.getByText('Inbox Sorter')).toBeTruthy();
    expect(screen.getByText('Webhook')).toBeTruthy();
    expect(screen.getByText('Disarmed')).toBeTruthy();
    expect(screen.getByText('Never fired')).toBeTruthy();
  });

  it('surfaces a broken trigger with its error and a failing count', () => {
    loadedWith([scheduleTrigger, brokenTrigger]);
    renderScreen();

    expect(screen.getByText('Failing')).toBeTruthy();
    expect(screen.getByText('Provider returned 500')).toBeTruthy();
    expect(screen.getByText('2 armed of 2 · 1 failing')).toBeTruthy();
  });

  it('says a trigger stopped itself, and how to restart it', () => {
    loadedWith([
      {
        ...brokenTrigger,
        enabled: false,
        disabled_reason: 'failures',
        consecutive_failures: 5,
      },
    ]);
    renderScreen();

    expect(screen.getByText('Stopped')).toBeTruthy();
    expect(
      screen.getByText('Disabled after 5 consecutive failures. Arm it again to retry.'),
    ).toBeTruthy();
  });

  it('disarms an armed trigger only after confirmation', () => {
    jest.spyOn(Alert, 'alert');
    loadedWith([scheduleTrigger]);
    renderScreen();

    fireEvent.press(screen.getByLabelText('Disarm schedule trigger on Fox Painter'));
    expect(mockStopMutate).not.toHaveBeenCalled();

    const buttons = jest.mocked(Alert.alert).mock.calls[0][2];
    buttons?.[1]?.onPress?.();
    expect(mockStopMutate).toHaveBeenCalledWith({ id: 'reg-schedule' });
  });

  it('arms a disarmed trigger without a confirmation prompt', () => {
    jest.spyOn(Alert, 'alert');
    loadedWith([webhookTrigger]);
    renderScreen();

    fireEvent.press(screen.getByLabelText('Arm webhook trigger on Inbox Sorter'));

    expect(mockStartMutate).toHaveBeenCalledWith({ id: 'reg-webhook' });
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('opens the job list narrowed to the trigger\'s workflow', () => {
    loadedWith([scheduleTrigger]);
    renderScreen();

    fireEvent.press(screen.getByLabelText('View runs of Fox Painter'));

    expect(navigation.navigate).toHaveBeenCalledWith('Jobs', { workflowId: 'wf-1' });
  });

  it('warns when part of the fan-out failed rather than silently dropping rows', () => {
    loadedWith([scheduleTrigger]);
    mockState.byWorkflow = [
      ...mockState.byWorkflow,
      { ...idle, error: { message: 'timeout' }, data: undefined },
    ];
    renderScreen();

    expect(
      screen.getByText('Some workflows could not be checked. The list may be incomplete.'),
    ).toBeTruthy();
  });
});

describe('mergeTriggerRows', () => {
  const row = (over: Partial<TriggerRow> & { id: string }): TriggerRow => ({
    workflow_id: 'wf-1',
    node_id: 'n',
    kind: 'schedule',
    enabled: true,
    last_fired_at: null,
    last_error: null,
    ...over,
  });

  it('prefers the per-workflow row, which carries the schedule fields', () => {
    const merged = mergeTriggerRows(
      [row({ id: 'a' })],
      [row({ id: 'a', next_fire_at: '2026-07-26T12:00:00.000Z', interval_seconds: 60 })],
    );

    expect(merged).toHaveLength(1);
    expect(merged[0].interval_seconds).toBe(60);
  });

  it('keeps a running row the per-workflow fan-out never returned', () => {
    const merged = mergeTriggerRows([row({ id: 'only-running' })], []);

    expect(merged.map((r) => r.id)).toEqual(['only-running']);
  });

  it('sorts broken first, then armed, then most recently fired', () => {
    const merged = mergeTriggerRows(
      [],
      [
        row({ id: 'quiet', enabled: false }),
        row({ id: 'recent', last_fired_at: '2026-07-26T10:00:00.000Z' }),
        row({ id: 'older', last_fired_at: '2026-07-25T10:00:00.000Z' }),
        row({ id: 'broken', last_error: 'boom' }),
      ],
    );

    expect(merged.map((r) => r.id)).toEqual(['broken', 'recent', 'older', 'quiet']);
  });
});

describe('formatInterval', () => {
  it('drops intervals a non-schedule trigger does not have', () => {
    expect(formatInterval(null)).toBeNull();
    expect(formatInterval(undefined)).toBeNull();
    expect(formatInterval(0)).toBeNull();
  });

  it('scales the unit to the interval', () => {
    expect(formatInterval(30)).toBe('every 30s');
    expect(formatInterval(1800)).toBe('every 30m');
    expect(formatInterval(7200)).toBe('every 2h');
    expect(formatInterval(172800)).toBe('every 2d');
  });
});
