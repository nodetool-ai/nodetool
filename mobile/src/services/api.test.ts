/**
 * Tests for ApiService.request() and uploadAsset() — covers the ApiError type,
 * the request timeout, and the retry behaviour (5xx / network errors retried,
 * 4xx failing fast). `fetch` is mocked globally.
 */

import { apiService, ApiError } from './api';

// apiHost is consulted for the base URL; pin it so URLs are deterministic.
jest.mock('./apiHost', () => ({
  getApiHost: jest.fn().mockReturnValue('http://localhost:7777'),
  loadApiHost: jest.fn().mockResolvedValue('http://localhost:7777'),
  saveApiHost: jest.fn().mockResolvedValue(undefined),
  setCachedApiHost: jest.fn(),
}));

// No session → no Authorization header. uploadAsset dynamically imports this.
jest.mock('../stores/AuthStore', () => ({
  useAuthStore: {
    getState: jest.fn().mockReturnValue({ session: null }),
  },
}));

// The tRPC client is never exercised by these tests, but api.ts imports it.
jest.mock('../trpc/client', () => ({
  createMobileTRPCClient: jest.fn(),
}));

interface MockResponseInit {
  ok: boolean;
  status: number;
  json?: unknown;
  text?: string;
}

function mockResponse({ ok, status, json, text }: MockResponseInit): Response {
  return {
    ok,
    status,
    json: jest.fn().mockResolvedValue(json ?? {}),
    text: jest.fn().mockResolvedValue(text ?? ''),
  } as unknown as Response;
}

const mockFetch = jest.fn();

describe('ApiService request (via getNodeMetadata)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  it('returns parsed JSON on success', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({ ok: true, status: 200, json: [{ node_type: 'a' }] })
    );

    const result = await apiService.getNodeMetadata();

    expect(result).toEqual([{ node_type: 'a' }]);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:7777/api/nodes/metadata',
      expect.objectContaining({ signal: expect.any(Object) })
    );
  });

  it('throws ApiError on a 4xx and does NOT retry', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({ ok: false, status: 404, text: 'not found' })
    );

    await expect(apiService.getNodeMetadata()).rejects.toBeInstanceOf(ApiError);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('exposes the status and body on the ApiError', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({ ok: false, status: 400, text: 'bad input' })
    );

    await expect(apiService.getNodeMetadata()).rejects.toMatchObject({
      status: 400,
      body: 'bad input',
    });
  });

  it('retries a 5xx and succeeds on a later attempt', async () => {
    mockFetch
      .mockResolvedValueOnce(mockResponse({ ok: false, status: 503, text: 'down' }))
      .mockResolvedValueOnce(mockResponse({ ok: true, status: 200, json: [{ ok: 1 }] }));

    const result = await apiService.getNodeMetadata();

    expect(result).toEqual([{ ok: 1 }]);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('retries a network error and succeeds', async () => {
    mockFetch
      .mockRejectedValueOnce(new TypeError('Network request failed'))
      .mockResolvedValueOnce(mockResponse({ ok: true, status: 200, json: [] }));

    const result = await apiService.getNodeMetadata();

    expect(result).toEqual([]);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('gives up after exhausting retries on persistent 5xx', async () => {
    mockFetch.mockResolvedValue(
      mockResponse({ ok: false, status: 500, text: 'boom' })
    );

    await expect(apiService.getNodeMetadata()).rejects.toBeInstanceOf(ApiError);
    // initial attempt + MAX_RETRIES (2) = 3 calls
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });
});

describe('ApiService.uploadAsset', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  it('does NOT set a Content-Type header (preserves the multipart boundary)', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({ ok: true, status: 200, json: { id: 'asset-1' } })
    );

    await apiService.uploadAsset({
      uri: 'file:///tmp/x.png',
      name: 'x.png',
      contentType: 'image/png',
      parentId: 'root',
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [, init] = mockFetch.mock.calls[0];
    const headers = init.headers as Record<string, string>;
    const headerKeys = Object.keys(headers).map((k) => k.toLowerCase());
    expect(headerKeys).not.toContain('content-type');
  });

  it('posts FormData to the assets endpoint', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({ ok: true, status: 200, json: { id: 'asset-2' } })
    );

    const result = await apiService.uploadAsset({
      uri: 'file:///tmp/y.png',
      name: 'y.png',
      contentType: 'image/png',
      parentId: 'root',
    });

    expect(result).toEqual({ id: 'asset-2' });
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('http://localhost:7777/api/assets');
    expect(init.method).toBe('POST');
    expect(init.body).toBeInstanceOf(FormData);
  });

  it('throws ApiError when the upload fails', async () => {
    mockFetch.mockResolvedValueOnce(
      mockResponse({ ok: false, status: 413, text: 'too large' })
    );

    await expect(
      apiService.uploadAsset({
        uri: 'file:///tmp/big.png',
        name: 'big.png',
        contentType: 'image/png',
        parentId: 'root',
      })
    ).rejects.toMatchObject({ status: 413 });
  });
});
