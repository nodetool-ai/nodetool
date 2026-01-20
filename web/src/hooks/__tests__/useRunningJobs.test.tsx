import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useRunningJobs } from '../useRunningJobs';
import { useAuth } from '../../stores/useAuth';
import { client } from '../../stores/ApiClient';

jest.mock('../../stores/useAuth');

const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;

const mockedClientGET = client.GET as jest.Mock;

jest.mock('../../stores/ApiClient', () => ({
  client: {
    GET: jest.fn()
  }
}));

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  Wrapper.displayName = 'QueryClientWrapper';
  return Wrapper;
};

describe('useRunningJobs', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('when authenticated', () => {
    beforeEach(() => {
      mockUseAuth.mockReturnValue({
        user: { id: 'user-1' },
        state: 'logged_in'
      });
    });

    it('fetches running jobs on mount', async () => {
      const mockJobs = [
        { id: 'job-1', status: 'running', workflow_id: 'wf-1' },
        { id: 'job-2', status: 'queued', workflow_id: 'wf-2' }
      ];

      mockedClientGET.mockResolvedValue({
        data: { jobs: mockJobs },
        error: null
      });

      const { result } = renderHook(() => useRunningJobs(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toBeDefined();
      expect(result.current.data?.length).toBe(2);
    });

    it('filters out completed jobs', async () => {
      const mockJobs = [
        { id: 'job-1', status: 'running', workflow_id: 'wf-1' },
        { id: 'job-2', status: 'completed', workflow_id: 'wf-2' },
        { id: 'job-3', status: 'failed', workflow_id: 'wf-3' }
      ];

      mockedClientGET.mockResolvedValue({
        data: { jobs: mockJobs },
        error: null
      });

      const { result } = renderHook(() => useRunningJobs(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toBeDefined();
      expect(result.current.data?.length).toBe(1);
      expect(result.current.data?.[0].id).toBe('job-1');
    });

    it('handles API error', async () => {
      mockedClientGET.mockResolvedValue({
        data: null,
        error: { message: 'API Error' }
      });

      const { result } = renderHook(() => useRunningJobs(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBeDefined();
    });

    it('returns empty array when no jobs', async () => {
      mockedClientGET.mockResolvedValue({
        data: { jobs: [] },
        error: null
      });

      const { result } = renderHook(() => useRunningJobs(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toEqual([]);
    });

    it('includes suspended and paused jobs', async () => {
      const mockJobs = [
        { id: 'job-1', status: 'running', workflow_id: 'wf-1' },
        { id: 'job-2', status: 'suspended', workflow_id: 'wf-2' },
        { id: 'job-3', status: 'paused', workflow_id: 'wf-3' }
      ];

      mockedClientGET.mockResolvedValue({
        data: { jobs: mockJobs },
        error: null
      });

      const { result } = renderHook(() => useRunningJobs(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toBeDefined();
      expect(result.current.data?.length).toBe(3);
    });
  });

  describe('when not authenticated', () => {
    beforeEach(() => {
      mockUseAuth.mockReturnValue({
        user: null,
        state: 'logged_out'
      });
    });

    it('does not fetch jobs when not authenticated', async () => {
      const { result } = renderHook(() => useRunningJobs(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toBeUndefined();
      expect(mockedClientGET).not.toHaveBeenCalled();
    });
  });

  describe('loading state', () => {
    beforeEach(() => {
      mockUseAuth.mockReturnValue({
        user: { id: 'user-1' },
        state: 'logged_in'
      });

      mockedClientGET.mockImplementation(() => 
        new Promise((resolve) => setTimeout(() => resolve({ data: { jobs: [] }, error: null }), 100))
      );
    });

    it('shows loading state initially', () => {
      const { result } = renderHook(() => useRunningJobs(), { wrapper: createWrapper() });

      expect(result.current.isLoading).toBe(true);
      expect(result.current.data).toBeUndefined();
    });
  });
});
