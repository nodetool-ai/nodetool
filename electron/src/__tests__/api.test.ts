import { fetchWorkflows } from '../api';
import { serverState } from '../state';

const mockWorkflowsQuery = jest.fn();
const mockHttpBatchLink = jest.fn();

jest.mock('@trpc/client', () => ({
  createTRPCClient: jest.fn(() => ({
    workflows: {
      list: {
        query: mockWorkflowsQuery
      }
    }
  })),
  httpBatchLink: (...args: unknown[]) => mockHttpBatchLink(...args)
}));

describe('API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    serverState.serverPort = 7777;
  });

  describe('fetchWorkflows', () => {
    it('should fetch workflows successfully', async () => {
      const mockWorkflows = [
        { id: '1', name: 'Workflow 1' },
        { id: '2', name: 'Workflow 2' }
      ];

      mockWorkflowsQuery.mockResolvedValueOnce({ workflows: mockWorkflows });

      const result = await fetchWorkflows();

      expect(result).toEqual(mockWorkflows);
      expect(mockHttpBatchLink).toHaveBeenCalledWith(expect.objectContaining({
        url: 'http://127.0.0.1:7777/trpc'
      }));
    });

    it('should use custom server port when set', async () => {
      serverState.serverPort = 9000;

      mockWorkflowsQuery.mockResolvedValueOnce({ workflows: [] });

      await fetchWorkflows();

      expect(mockHttpBatchLink).toHaveBeenCalledWith(expect.objectContaining({
        url: 'http://127.0.0.1:9000/trpc'
      }));
    });

    it('should handle HTTP errors', async () => {
      mockWorkflowsQuery.mockRejectedValueOnce(new Error('Not found'));

      const result = await fetchWorkflows();

      expect(result).toEqual([]);
    });

    it('should handle network errors', async () => {
      mockWorkflowsQuery.mockRejectedValueOnce(new Error('Network error'));

      const result = await fetchWorkflows();

      expect(result).toEqual([]);
    });

    it('should handle missing workflows in response', async () => {
      mockWorkflowsQuery.mockResolvedValueOnce({});

      const result = await fetchWorkflows();

      expect(result).toEqual([]);
    });
  });
});
