/**
 * Tests for JobDetailScreen — the surface that makes a job's output reachable.
 *
 * tRPC and the WebSocket singleton are mocked so the screen's two modes can be
 * driven directly: a running job folding live messages, and a finished job
 * that has no stored output to show.
 */

import React from 'react';
import { Alert } from 'react-native';
import { act, render, screen, fireEvent } from '@testing-library/react-native';

import JobDetailScreen from '../JobDetailScreen';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

type Job = {
  id: string;
  status: string;
  workflow_id: string;
  job_type: string;
  started_at: string | null;
  finished_at: string | null;
  error: string | null;
  cost: number | null;
};

let mockJobData: Job | null;
const mockRefetchJob = jest.fn();
const mockCancelMutate = jest.fn();

jest.mock('../../trpc/client', () => ({
  trpc: {
    // Output media resolves an `asset://` locator through `assets.get`.
    assets: { get: { useQuery: () => ({ data: undefined, isLoading: false }) } },
    useQueries: () => [],
    useUtils: () => ({
      jobs: { get: { invalidate: jest.fn() }, list: { invalidate: jest.fn() } },
    }),
    jobs: {
      get: {
        useQuery: () => ({
          data: mockJobData,
          isLoading: false,
          error: null,
          refetch: mockRefetchJob,
        }),
      },
      cancel: {
        useMutation: () => ({ mutate: mockCancelMutate }),
      },
    },
    workflows: {
      get: {
        useQuery: () => ({ data: { id: 'wf-1', name: 'Fox Painter' }, isLoading: false, error: null }),
      },
    },
  },
}));

type Handler = (message: Record<string, unknown>) => void;

const mockUnsubscribe = jest.fn();
const mockSubscribe = jest.fn<() => void, [string, Handler]>();
const mockSend = jest.fn<Promise<void>, [Record<string, unknown>]>();

jest.mock('../../services/WebSocketService', () => ({
  webSocketService: {
    subscribe: (key: string, handler: Handler) => mockSubscribe(key, handler),
    send: (message: Record<string, unknown>) => mockSend(message),
  },
}));

const navigation = { setOptions: jest.fn(), navigate: jest.fn(), goBack: jest.fn() };
const route = { key: 'JobDetail-1', name: 'JobDetail' as const, params: { jobId: 'job-1' } };

function renderScreen() {
  return render(
    <JobDetailScreen navigation={navigation as never} route={route as never} />
  );
}

function emit(message: Record<string, unknown>) {
  const handler = mockSubscribe.mock.calls[0][1];
  act(() => { handler(message); });
}

const runningJob: Job = {
  id: 'job-1',
  status: 'running',
  workflow_id: 'wf-1',
  job_type: 'workflow',
  started_at: '2026-07-26T10:00:00.000Z',
  finished_at: null,
  error: null,
  cost: null,
};

describe('JobDetailScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSubscribe.mockReturnValue(mockUnsubscribe);
    mockSend.mockResolvedValue(undefined);
    mockJobData = { ...runningJob };
  });

  it('titles the header with the workflow name', () => {
    renderScreen();
    expect(navigation.setOptions).toHaveBeenCalledWith({ title: 'Fox Painter' });
  });

  it('subscribes to the running job and asks the server to replay its state', () => {
    renderScreen();

    expect(mockSubscribe).toHaveBeenCalledWith('job-1', expect.any(Function));
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        command: 'reconnect_job',
        data: { job_id: 'job-1', workflow_id: 'wf-1' },
      })
    );
  });

  it('renders output streamed from the running job', () => {
    renderScreen();

    expect(screen.getByText(/Waiting for output/)).toBeTruthy();

    emit({ type: 'output_update', job_id: 'job-1', node_id: 'n1', node_name: 'Total', value: 42 });

    expect(screen.getByText('Total')).toBeTruthy();
    expect(screen.getByText('42')).toBeTruthy();
  });

  it('folds node results and node errors from node_update', () => {
    renderScreen();

    emit({
      type: 'node_update',
      job_id: 'job-1',
      node_id: 'n1',
      node_name: 'Adder',
      status: 'completed',
      result: 7,
    });
    emit({
      type: 'node_update',
      job_id: 'job-1',
      node_id: 'n2',
      node_name: 'Broken',
      status: 'error',
      error: 'kaboom',
    });

    expect(screen.getByText('7')).toBeTruthy();
    expect(screen.getByText('Broken: kaboom')).toBeTruthy();
  });

  it('shows the job error reported by job_update', () => {
    renderScreen();

    emit({ type: 'job_update', job_id: 'job-1', status: 'failed', error: 'provider down' });

    expect(screen.getByText('provider down')).toBeTruthy();
    expect(mockRefetchJob).toHaveBeenCalled();
  });

  it('unsubscribes when the screen goes away', () => {
    const view = renderScreen();
    view.unmount();
    expect(mockUnsubscribe).toHaveBeenCalled();
  });

  it('cancels a running job', () => {
    jest.spyOn(Alert, 'alert');
    renderScreen();

    fireEvent.press(screen.getByLabelText('Cancel job'));

    const buttons = jest.mocked(Alert.alert).mock.calls[0][2];
    buttons?.[1]?.onPress?.();
    expect(mockCancelMutate).toHaveBeenCalledWith({ id: 'job-1' });
  });

  it('says plainly that a finished job has no stored output', () => {
    mockJobData = {
      ...runningJob,
      status: 'completed',
      finished_at: '2026-07-26T10:01:00.000Z',
      cost: 0.0123,
    };
    renderScreen();

    expect(mockSubscribe).not.toHaveBeenCalled();
    expect(screen.getByText(/No stored output/)).toBeTruthy();
    expect(screen.getByText('$0.0123')).toBeTruthy();
    expect(screen.queryByLabelText('Cancel job')).toBeNull();
  });
});
