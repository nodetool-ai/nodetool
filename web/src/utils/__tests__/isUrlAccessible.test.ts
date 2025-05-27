import { isUrlAccessible } from '../isUrlAccessible';
import log from 'loglevel';

describe('isUrlAccessible', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
    jest.spyOn(log, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    (fetch as jest.Mock).mockReset();
    (log.error as jest.Mock).mockRestore();
  });

  it('returns true for successful HEAD request', async () => {
    (fetch as jest.Mock).mockResolvedValue({ ok: true });
    const result = await isUrlAccessible('https://example.com');
    expect(fetch).toHaveBeenCalledWith('https://example.com', { method: 'HEAD' });
    expect(result).toBe(true);
  });

  it('logs error and returns false when fetch throws', async () => {
    (fetch as jest.Mock).mockRejectedValue(new Error('fail'));
    const result = await isUrlAccessible('https://bad.com');
    expect(result).toBe(false);
    expect(log.error).toHaveBeenCalled();
  });
});
