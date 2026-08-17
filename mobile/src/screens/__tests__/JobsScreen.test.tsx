/**
 * Tests for JobsScreen — job rows open the detail screen, and the cancel
 * button inside a row must not double as a row tap.
 */

import { Alert } from 'react-native';
import { render, screen, fireEvent } from '@testing-library/react-native';

import JobsScreen from '../JobsScreen';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockCancelMutate = jest.fn();

const mockJobs = [
  {
    id: 'job-running',
    status: 'running',
    workflow_id: 'wf-1',
    job_type: 'workflow',
    started_at: '2026-07-26T10:00:00.000Z',
    finished_at: null,
    error: null,
    cost: null,
  },
  {
    id: 'job-done',
    status: 'completed',
    workflow_id: 'wf-1',
    job_type: 'workflow',
    started_at: '2026-07-26T09:00:00.000Z',
    finished_at: '2026-07-26T09:00:30.000Z',
    error: null,
    cost: 0.5,
  },
];

jest.mock('../../trpc/client', () => ({
  trpc: {
    useUtils: () => ({ jobs: { list: { invalidate: jest.fn() } } }),
    jobs: {
      list: {
        useQuery: () => ({
          data: { jobs: mockJobs },
          isLoading: false,
          isRefetching: false,
          error: null,
          refetch: jest.fn(),
        }),
      },
      cancel: { useMutation: () => ({ mutate: mockCancelMutate }) },
    },
    workflows: {
      list: {
        useQuery: () => ({ data: { workflows: [{ id: 'wf-1', name: 'Fox Painter' }] } }),
      },
    },
  },
}));

const navigation = { navigate: jest.fn(), setOptions: jest.fn(), goBack: jest.fn() };

function renderScreen() {
  return render(<JobsScreen navigation={navigation as never} />);
}

describe('JobsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('opens the job detail screen when a row is tapped', () => {
    renderScreen();

    fireEvent.press(screen.getAllByLabelText('Open job Fox Painter')[1]);

    expect(navigation.navigate).toHaveBeenCalledWith('JobDetail', { jobId: 'job-done' });
  });

  it('keeps the cancel button working without opening the job', () => {
    jest.spyOn(Alert, 'alert');
    renderScreen();

    fireEvent.press(screen.getByLabelText('Cancel job'));

    expect(navigation.navigate).not.toHaveBeenCalled();

    const buttons = jest.mocked(Alert.alert).mock.calls[0][2];
    buttons?.[1]?.onPress?.();
    expect(mockCancelMutate).toHaveBeenCalledWith({ id: 'job-running' });
  });
});
