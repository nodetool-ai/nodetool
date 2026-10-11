import { fetchWithTimeout } from './fetchWithTimeout';

/** A fetch that only settles when its signal aborts. */
function hangingFetch(): jest.Mock {
  return jest.fn(
    (_url: string, init: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => {
          reject(new Error('Aborted'));
        });
      })
  );
}

describe('fetchWithTimeout', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.useRealTimers();
  });

  it('aborts the request once the timeout elapses', async () => {
    jest.useFakeTimers();
    global.fetch = hangingFetch();

    const pending = fetchWithTimeout('https://host/x', {}, 1000);
    jest.advanceTimersByTime(1000);

    await expect(pending).rejects.toThrow('Aborted');
  });

  it('aborts the request when the caller aborts its own signal', async () => {
    global.fetch = hangingFetch();
    const caller = new AbortController();

    const pending = fetchWithTimeout('https://host/x', { signal: caller.signal }, 60_000);
    caller.abort();

    await expect(pending).rejects.toThrow('Aborted');
  });

  it('passes the response through when it arrives in time', async () => {
    const response = { ok: true, status: 200 } as Response;
    global.fetch = jest.fn().mockResolvedValue(response);

    await expect(fetchWithTimeout('https://host/x', { method: 'POST' })).resolves.toBe(response);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://host/x',
      expect.objectContaining({ method: 'POST', signal: expect.any(Object) })
    );
  });
});
