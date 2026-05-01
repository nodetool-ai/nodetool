import { tryCacheFiles, tryCacheRepos } from '../tryCacheFiles';
import { trpc } from '../../lib/trpc';

jest.mock('../../lib/trpc', () => ({
  trpc: {
    models: {
      huggingfaceTryCacheFiles: { mutate: jest.fn() },
      huggingfaceTryCacheRepos: { mutate: jest.fn() }
    }
  }
}));

describe('tryCacheFiles', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('successfully caches files and returns data', async () => {
    (trpc.models.huggingfaceTryCacheFiles.mutate as jest.Mock).mockResolvedValue({ ok: true });

    const files = ['file1', 'file2'];
    const result = await tryCacheFiles(files as any);

    expect(trpc.models.huggingfaceTryCacheFiles.mutate).toHaveBeenCalledWith(files);
    expect(result).toEqual({ ok: true });
  });

  it('throws error with descriptive message when API fails', async () => {
    (trpc.models.huggingfaceTryCacheFiles.mutate as jest.Mock).mockRejectedValue(new Error('fail'));
    await expect(tryCacheFiles(['file'] as any)).rejects.toThrow('fail');
  });
});

describe('tryCacheRepos', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('successfully caches repos and returns data', async () => {
    (trpc.models.huggingfaceTryCacheRepos.mutate as jest.Mock).mockResolvedValue({ ok: true });
    const repos = ['repo1'];
    const result = await tryCacheRepos(repos);
    expect(trpc.models.huggingfaceTryCacheRepos.mutate).toHaveBeenCalledWith(repos);
    expect(result).toEqual({ ok: true });
  });

  it('throws error with descriptive message when API fails', async () => {
    (trpc.models.huggingfaceTryCacheRepos.mutate as jest.Mock).mockRejectedValue(new Error('boom'));
    await expect(tryCacheRepos(['repo1'])).rejects.toThrow('boom');
  });
});
