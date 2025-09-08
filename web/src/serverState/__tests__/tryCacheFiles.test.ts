import { tryCacheFiles, tryCacheRepos } from '../tryCacheFiles';
import { client } from '../../stores/ApiClient';

jest.mock('../../stores/ApiClient', () => ({
  client: {
    POST: jest.fn()
  }
}));

describe('tryCacheFiles', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('successfully caches files and returns data', async () => {
    (client.POST as jest.Mock).mockResolvedValue({ data: { ok: true }, error: null });

    const files = ['file1', 'file2'];
    const result = await tryCacheFiles(files as any);

    expect(client.POST).toHaveBeenCalledWith('/api/models/huggingface/try_cache_files', { body: files });
    expect(result).toEqual({ ok: true });
  });

  it('throws error with descriptive message when API fails', async () => {
    (client.POST as jest.Mock).mockResolvedValue({ data: null, error: 'fail' });
    await expect(tryCacheFiles(['file'] as any)).rejects.toThrow('Failed to check if file is cached: fail');
  });
});

describe('tryCacheRepos', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('successfully caches repos and returns data', async () => {
    (client.POST as jest.Mock).mockResolvedValue({ data: { ok: true }, error: null });
    const repos = ['repo1'];
    const result = await tryCacheRepos(repos);
    expect(client.POST).toHaveBeenCalledWith('/api/models/huggingface/try_cache_repos', { body: repos });
    expect(result).toEqual({ ok: true });
  });

  it('throws error with descriptive message when API fails', async () => {
    (client.POST as jest.Mock).mockResolvedValue({ data: null, error: 'boom' });
    await expect(tryCacheRepos(['repo1'])).rejects.toThrow('Failed to check if repo is cached: boom');
  });
});
