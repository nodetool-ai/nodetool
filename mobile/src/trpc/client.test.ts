import { hostRewriteFetch } from './client';
import { useAuthStore } from '../stores/AuthStore';

jest.mock('../services/apiHost', () => ({
  getApiHost: jest.fn().mockReturnValue('https://new-host'),
}));

jest.mock('../stores/AuthStore', () => ({
  useAuthStore: { getState: jest.fn() },
}));

const getState = useAuthStore.getState as jest.Mock;
const refreshSession = jest.fn();
const handleSessionExpired = jest.fn();
const mockFetch = jest.fn();
let token = 'old';

function response(status: number): Response {
  // SAFETY: hostRewriteFetch reads only `status` off the response.
  return { status, ok: status < 400 } as Response;
}

describe('hostRewriteFetch', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    token = 'old';
    global.fetch = mockFetch;
    getState.mockImplementation(() => ({
      session: { access_token: token },
      refreshSession,
      handleSessionExpired,
    }));
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('sends to the current host with a timeout signal', async () => {
    mockFetch.mockResolvedValue(response(200));

    await hostRewriteFetch('https://old-host/trpc/workflows.list?batch=1', {
      method: 'POST',
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://new-host/trpc/workflows.list?batch=1',
      expect.objectContaining({ method: 'POST', signal: expect.any(Object) })
    );
  });

  it('aborts a request that never answers', async () => {
    jest.useFakeTimers();
    mockFetch.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new Error('Aborted')));
        })
    );

    const pending = hostRewriteFetch('https://old-host/trpc/x', {});
    jest.advanceTimersByTime(30_000);

    await expect(pending).rejects.toThrow('Aborted');
    jest.useRealTimers();
  });

  it('leaves the session alone on a 403', async () => {
    mockFetch.mockResolvedValue(response(403));

    const result = await hostRewriteFetch('https://old-host/trpc/x', {});

    expect(result.status).toBe(403);
    expect(refreshSession).not.toHaveBeenCalled();
    expect(handleSessionExpired).not.toHaveBeenCalled();
  });

  it('refreshes once on a 401 and resends with the new token', async () => {
    refreshSession.mockImplementation(async () => {
      token = 'new';
      return true;
    });
    mockFetch.mockResolvedValueOnce(response(401)).mockResolvedValueOnce(response(200));

    const result = await hostRewriteFetch('https://old-host/trpc/x', {
      method: 'POST',
      body: '{}',
      headers: { Authorization: 'Bearer old' },
    });

    expect(result.status).toBe(200);
    expect(refreshSession).toHaveBeenCalledTimes(1);
    const retried = mockFetch.mock.calls[1][1] as RequestInit;
    expect(new Headers(retried.headers).get('Authorization')).toBe('Bearer new');
    expect(retried.body).toBe('{}');
  });

  it('returns the 401 without resending when the refresh fails', async () => {
    refreshSession.mockResolvedValue(false);
    mockFetch.mockResolvedValue(response(401));

    const result = await hostRewriteFetch('https://old-host/trpc/x', {});

    expect(result.status).toBe(401);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
