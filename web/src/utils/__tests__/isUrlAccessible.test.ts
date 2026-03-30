/**
 * @jest-environment node
 */

import { isUrlAccessible } from '../isUrlAccessible';

// Mock loglevel
jest.mock('loglevel', () => ({
  default: {
    error: jest.fn(),
    warn: jest.fn(),
  },
  __esModule: true,
}));

// Import loglevel after mocking
import log from 'loglevel';

// Mock global fetch
global.fetch = jest.fn();

describe('isUrlAccessible', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('successful requests', () => {
    it('should return true for successful response (200)', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
      });

      const result = await isUrlAccessible('https://example.com');
      
      expect(result).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith('https://example.com', { method: 'HEAD' });
      expect(log.error).not.toHaveBeenCalled();
    });

    it('should return true for other successful status codes', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 204,
      });

      const result = await isUrlAccessible('https://api.example.com/endpoint');
      
      expect(result).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith('https://api.example.com/endpoint', { method: 'HEAD' });
    });
  });

  describe('failed requests', () => {
    it('should return false for 404 response', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 404,
      });

      const result = await isUrlAccessible('https://example.com/not-found');
      
      expect(result).toBe(false);
      expect(global.fetch).toHaveBeenCalledWith('https://example.com/not-found', { method: 'HEAD' });
      expect(log.error).not.toHaveBeenCalled();
    });

    it('should return false for 500 server error', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 500,
      });

      const result = await isUrlAccessible('https://example.com/error');
      
      expect(result).toBe(false);
      expect(global.fetch).toHaveBeenCalledWith('https://example.com/error', { method: 'HEAD' });
    });

    it('should return false for 403 forbidden', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 403,
      });

      const result = await isUrlAccessible('https://example.com/forbidden');
      
      expect(result).toBe(false);
    });

    it('should return false for 401 unauthorized', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 401,
      });

      const result = await isUrlAccessible('https://example.com/auth');
      
      expect(result).toBe(false);
    });
  });

  describe('network errors', () => {
    it('should return false and log error when fetch throws', async () => {
      const error = new Error('Network error');
      (global.fetch as jest.Mock).mockRejectedValue(error);

      const result = await isUrlAccessible('https://example.com');
      
      expect(result).toBe(false);
      expect(log.error).toHaveBeenCalledWith('isUrlAccessible: Error checking URL:', error);
    });

    it('should handle TypeError from fetch', async () => {
      const error = new TypeError('Failed to fetch');
      (global.fetch as jest.Mock).mockRejectedValue(error);

      const result = await isUrlAccessible('https://invalid-domain-that-does-not-exist-12345.com');

      expect(result).toBe(false);
      expect(log.error).toHaveBeenCalledWith('isUrlAccessible: Error checking URL:', error);
    });

    it('should handle connection refused', async () => {
      const error = new Error('ECONNREFUSED');
      (global.fetch as jest.Mock).mockRejectedValue(error);

      const result = await isUrlAccessible('http://example.com:9999');

      // Use example.com instead of localhost to avoid SSRF protection
      expect(result).toBe(false);
      expect(global.fetch).toHaveBeenCalledWith('http://example.com:9999', { method: 'HEAD' });
    });

    it('should handle timeout errors', async () => {
      const error = new Error('Request timeout');
      (global.fetch as jest.Mock).mockRejectedValue(error);

      const result = await isUrlAccessible('https://slow-server.com');
      
      expect(result).toBe(false);
      expect(log.error).toHaveBeenCalledWith('isUrlAccessible: Error checking URL:', error);
    });
  });

  describe('various URL formats', () => {
    it('should handle HTTP URLs', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
      });

      const result = await isUrlAccessible('http://example.com');
      
      expect(result).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith('http://example.com', { method: 'HEAD' });
    });

    it('should handle HTTPS URLs', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
      });

      const result = await isUrlAccessible('https://secure.example.com');
      
      expect(result).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith('https://secure.example.com', { method: 'HEAD' });
    });

    it('should handle URLs with paths', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
      });

      const result = await isUrlAccessible('https://example.com/api/v1/users');
      
      expect(result).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith('https://example.com/api/v1/users', { method: 'HEAD' });
    });

    it('should handle URLs with query parameters', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
      });

      const result = await isUrlAccessible('https://example.com/search?q=test&page=1');
      
      expect(result).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith('https://example.com/search?q=test&page=1', { method: 'HEAD' });
    });

    it('should handle URLs with fragments', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
      });

      const result = await isUrlAccessible('https://example.com/page#section');
      
      expect(result).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith('https://example.com/page#section', { method: 'HEAD' });
    });

    it('should handle URLs with ports', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
      });

      const result = await isUrlAccessible('https://example.com:8080/api');
      
      expect(result).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith('https://example.com:8080/api', { method: 'HEAD' });
    });
  });

  describe('edge cases', () => {
    it('should handle empty string URL', async () => {
      const result = await isUrlAccessible('');

      // With URL validation, empty strings are rejected before fetch
      expect(result).toBe(false);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should handle malformed URL', async () => {
      const result = await isUrlAccessible('not-a-url');

      // With URL validation, malformed URLs are rejected before fetch
      expect(result).toBe(false);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should handle null response', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(null);

      const result = await isUrlAccessible('https://example.com');

      expect(result).toBe(false);
    });

    it('should handle undefined ok property', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        status: 200,
        ok: undefined,
      });

      const result = await isUrlAccessible('https://example.com');

      // When ok is undefined, the function returns false (not undefined)
      expect(result).toBe(false);
    });
  });

  describe('URL validation security', () => {
    it('should reject localhost URLs', async () => {
      const result = await isUrlAccessible('http://localhost:8080');

      expect(result).toBe(false);
      expect(log.warn).toHaveBeenCalledWith('isUrlAccessible: URL validation failed:', 'http://localhost:8080');
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should reject 127.0.0.1 URLs', async () => {
      const result = await isUrlAccessible('http://127.0.0.1:8080');

      expect(result).toBe(false);
      expect(log.warn).toHaveBeenCalledWith('isUrlAccessible: URL validation failed:', 'http://127.0.0.1:8080');
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should reject private network URLs (192.168.x.x)', async () => {
      const result = await isUrlAccessible('http://192.168.1.1:8080');

      expect(result).toBe(false);
      expect(log.warn).toHaveBeenCalledWith('isUrlAccessible: URL validation failed:', 'http://192.168.1.1:8080');
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should reject javascript: URLs', async () => {
      const result = await isUrlAccessible('javascript:alert(1)');

      expect(result).toBe(false);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should reject data: URLs', async () => {
      const result = await isUrlAccessible('data:text/html,<script>alert(1)</script>');

      expect(result).toBe(false);
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });
});