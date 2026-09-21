import {
  diagnoseServer,
  type ServerDiagnosticResult,
} from './serverDiagnostics';

function response(status: number): Response {
  return new Response(null, { status });
}

function fetchMock(): jest.MockedFunction<typeof fetch> {
  return jest.fn();
}

describe('diagnoseServer', () => {
  it.each([
    [401, 'unauthorized'],
    [403, 'unauthorized'],
  ] as const)('classifies protected HTTP %s as %s', async (status, expected) => {
    const fetchImpl = fetchMock()
      .mockResolvedValueOnce(response(200))
      .mockResolvedValueOnce(response(status));

    await expect(
      diagnoseServer('https://server.example/', fetchImpl)
    ).resolves.toEqual({ status: expected, statusCode: status } satisfies ServerDiagnosticResult);
  });

  it.each([
    [404, 'incompatible'],
    [500, 'incompatible'],
  ] as const)('classifies readiness HTTP %s as %s', async (status, expected) => {
    const fetchImpl = fetchMock().mockResolvedValue(response(status));

    await expect(
      diagnoseServer('https://server.example/', fetchImpl)
    ).resolves.toEqual({ status: expected, statusCode: status } satisfies ServerDiagnosticResult);
  });

  it('classifies successful readiness and workflow probes as ready', async () => {
    const fetchImpl = fetchMock()
      .mockResolvedValueOnce(response(200))
      .mockResolvedValueOnce(response(200));

    await expect(
      diagnoseServer('https://server.example/', fetchImpl)
    ).resolves.toEqual({ status: 'ready', statusCode: 200 });
  });

  it('distinguishes a network failure from a timeout', async () => {
    const networkFetch = fetchMock().mockRejectedValue(new TypeError('offline'));
    await expect(diagnoseServer('https://server.example', networkFetch)).resolves.toEqual({
      status: 'network-error',
    });

    jest.useFakeTimers();
    try {
      const timeoutFetch = fetchMock().mockImplementation((_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const error = new Error('aborted');
            error.name = 'AbortError';
            reject(error);
          });
        })
      );
      const result = diagnoseServer('https://server.example', timeoutFetch, 10);
      jest.advanceTimersByTime(10);

      await expect(result).resolves.toEqual({ status: 'timeout' });
    } finally {
      jest.useRealTimers();
    }
  });

  it('probes without forwarding an authorization header', async () => {
    const fetchImpl = fetchMock()
      .mockResolvedValueOnce(response(200))
      .mockResolvedValueOnce(response(200));

    await diagnoseServer('https://server.example/', fetchImpl);

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://server.example/ready',
      expect.objectContaining({
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: expect.any(AbortSignal),
      })
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      'https://server.example/api/workflows/?limit=1',
      expect.objectContaining({
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: expect.any(AbortSignal),
      })
    );
    const request = fetchImpl.mock.calls[0]?.[1];
    expect(request?.headers).not.toHaveProperty('Authorization');
  });
});
