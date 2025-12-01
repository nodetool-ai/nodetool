import { fetchWorkflows, startPeriodicHealthCheck, stopPeriodicHealthCheck, isConnected } from '../api';
import { serverState } from '../state';

// Mock the fetch global
global.fetch = jest.fn();
const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;

// Mock timers for setInterval/clearInterval
jest.useFakeTimers();

describe('API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
    // Reset server state
    serverState.serverPort = 7777;
  });

  afterEach(() => {
    stopPeriodicHealthCheck();
    jest.clearAllTimers();
  });

  describe('fetchWorkflows', () => {
    it('should fetch workflows successfully', async () => {
      const mockWorkflows = [
        { id: '1', name: 'Workflow 1' },
        { id: '2', name: 'Workflow 2' }
      ];
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({ workflows: mockWorkflows })
      } as any);

      const result = await fetchWorkflows();

      expect(result).toEqual(mockWorkflows);
      expect(mockFetch).toHaveBeenCalledWith('http://127.0.0.1:7777/api/workflows/', {
        method: 'GET',
        headers: {
          Accept: 'application/json'
        }
      });
    });

    it('should use custom server port when set', async () => {
      serverState.serverPort = 9000;
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({ workflows: [] })
      } as any);

      await fetchWorkflows();

      expect(mockFetch).toHaveBeenCalledWith('http://127.0.0.1:9000/api/workflows/', {
        method: 'GET',
        headers: {
          Accept: 'application/json'
        }
      });
    });

    it('should handle HTTP errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404
      } as any);

      const result = await fetchWorkflows();

      expect(result).toEqual([]);
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await fetchWorkflows();

      expect(result).toEqual([]);
    });

    it('should handle missing workflows in response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({})
      } as any);

      const result = await fetchWorkflows();

      expect(result).toEqual([]);
    });
  });

  describe('health check', () => {
    it('should start periodic health check and call onStatusChange', async () => {
      const onStatusChange = jest.fn();
      
      // Mock successful health check
      mockFetch.mockResolvedValue({
        ok: true
      } as any);

      startPeriodicHealthCheck(onStatusChange);

      // Advance timers to trigger initial check
      await jest.advanceTimersByTimeAsync(0);

      expect(mockFetch).toHaveBeenCalledWith('http://127.0.0.1:7777/health/');
      expect(onStatusChange).toHaveBeenCalledWith(true);
    });

    it('should use custom server port for health check', async () => {
      serverState.serverPort = 9000;
      
      mockFetch.mockResolvedValue({
        ok: true
      } as any);

      startPeriodicHealthCheck();
      await jest.advanceTimersByTimeAsync(0);

      expect(mockFetch).toHaveBeenCalledWith('http://127.0.0.1:9000/health/');
    });

    it('should handle health check failures', async () => {
      const onStatusChange = jest.fn();
      
      // Mock failed health check
      mockFetch.mockRejectedValue(new Error('Connection refused'));

      startPeriodicHealthCheck(onStatusChange);
      await jest.advanceTimersByTimeAsync(0);

      expect(onStatusChange).toHaveBeenCalledWith(false);
    });

    it('should only call onStatusChange when status changes', async () => {
      const onStatusChange = jest.fn();
      
      // Mock successful health check
      mockFetch.mockResolvedValue({
        ok: true
      } as any);

      startPeriodicHealthCheck(onStatusChange);
      
      // Run initial health check
      await jest.advanceTimersByTimeAsync(0);
      
      // Run second health check
      jest.advanceTimersByTime(10000);
      await jest.advanceTimersByTimeAsync(0);

      // Should only be called once since status didn't change
      expect(onStatusChange).toHaveBeenCalledTimes(1);
    });

    it('should clear previous timer when starting new health check', () => {
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
      
      startPeriodicHealthCheck();
      startPeriodicHealthCheck(); // Start again

      expect(clearIntervalSpy).toHaveBeenCalled();
    });

    it('should stop periodic health check', () => {
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
      
      startPeriodicHealthCheck();
      stopPeriodicHealthCheck();

      expect(clearIntervalSpy).toHaveBeenCalled();
    });

    it('should handle stopping health check when no timer is active', () => {
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
      
      stopPeriodicHealthCheck(); // Stop without starting

      expect(clearIntervalSpy).not.toHaveBeenCalled();
    });
  });

  describe('isConnected variable', () => {
    it('should expose isConnected variable', () => {
      expect(typeof isConnected).toBe('boolean');
    });
  });
});