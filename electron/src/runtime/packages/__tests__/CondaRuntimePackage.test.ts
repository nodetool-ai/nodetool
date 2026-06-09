import { CondaRuntimePackage } from '../CondaRuntimePackage';
import type { RuntimeContext } from '../types';

jest.mock('../../../utils', () => ({
  fileExists: jest.fn(),
}));

const { fileExists } = jest.requireMock('../../../utils') as { fileExists: jest.Mock };

const makeCtx = (overrides?: Partial<RuntimeContext>): RuntimeContext => ({
  userDataDir: '/home/testuser/.nodetool',
  condaEnvPath: '/opt/conda/envs/nodetool',
  optionalNodeRoot: '/opt/node',
  platform: 'linux',
  arch: 'x64',
  log: jest.fn(),
  ...overrides,
});

const makePackage = (overrides?: Partial<ConstructorParameters<typeof CondaRuntimePackage>[0]>) =>
  new CondaRuntimePackage({
    id: 'test-pkg',
    name: 'Test Package',
    description: 'A test package',
    category: 'tool',
    versionRange: '>=1.0',
    condaPackages: ['testpkg>=1.0'],
    verifyBinary: 'testbin',
    ...overrides,
  });

describe('CondaRuntimePackage', () => {
  beforeEach(() => {
    fileExists.mockReset();
  });

  describe('constructor', () => {
    it('sets all properties from options', () => {
      const pkg = makePackage({ homepage: 'https://example.com', approxSizeMB: 500 });
      expect(pkg.id).toBe('test-pkg');
      expect(pkg.name).toBe('Test Package');
      expect(pkg.category).toBe('tool');
      expect(pkg.homepage).toBe('https://example.com');
      expect(pkg.approxSizeMB).toBe(500);
    });

    it('defaults extraBinaries to empty object', () => {
      const pkg = makePackage();
      expect(pkg.extraBinaries).toEqual({});
    });
  });

  describe('status', () => {
    it('returns not installed when conda-meta directory is missing', async () => {
      fileExists.mockResolvedValue(false);
      const pkg = makePackage();
      const ctx = makeCtx();
      const status = await pkg.status(ctx);
      expect(status.installed).toBe(false);
      expect(fileExists).toHaveBeenCalledWith(expect.stringContaining('conda-meta'));
    });

    it('returns not installed when verify binary is missing', async () => {
      fileExists.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
      const pkg = makePackage();
      const ctx = makeCtx();
      const status = await pkg.status(ctx);
      expect(status.installed).toBe(false);
    });

    it('returns installed when conda-meta and verify binary exist', async () => {
      fileExists.mockResolvedValue(true);
      const pkg = makePackage();
      const ctx = makeCtx();
      const status = await pkg.status(ctx);
      expect(status.installed).toBe(true);
    });

    it('detects broken install when extra binary is missing', async () => {
      fileExists.mockImplementation(async (p: string) => {
        if (p.includes('extra-tool')) return false;
        return true;
      });
      const pkg = makePackage({
        extraBinaries: { extraTool: 'extra-tool' },
      });
      const ctx = makeCtx();
      const status = await pkg.status(ctx);
      expect(status.installed).toBe(true);
      expect(status.brokenReason).toContain('extra-tool');
    });

    it('uses Library\\bin on Windows', async () => {
      fileExists.mockResolvedValue(true);
      const pkg = makePackage({ windowsBinSubdir: 'Library\\bin' });
      const ctx = makeCtx({ platform: 'win32' });
      await pkg.status(ctx);
      const verifyCall = fileExists.mock.calls[1][0] as string;
      expect(verifyCall).toContain('Library');
      expect(verifyCall).toContain('testbin.exe');
    });

    it('uses bin/ on Linux', async () => {
      fileExists.mockResolvedValue(true);
      const pkg = makePackage();
      const ctx = makeCtx({ platform: 'linux' });
      await pkg.status(ctx);
      const verifyCall = fileExists.mock.calls[1][0] as string;
      expect(verifyCall).toContain('/bin/testbin');
      expect(verifyCall).not.toContain('.exe');
    });
  });

  describe('resolve', () => {
    it('returns null when not installed', async () => {
      fileExists.mockResolvedValue(false);
      const pkg = makePackage();
      const ctx = makeCtx();
      expect(await pkg.resolve(ctx)).toBeNull();
    });

    it('returns binPaths and binaries when installed', async () => {
      fileExists.mockResolvedValue(true);
      const pkg = makePackage({
        extraBinaries: { helper: 'helper-bin' },
      });
      const ctx = makeCtx();
      const resolution = await pkg.resolve(ctx);
      expect(resolution).not.toBeNull();
      expect(resolution!.binPaths).toHaveLength(1);
      expect(resolution!.binPaths![0]).toContain('/bin');
      expect(resolution!.binaries).toHaveProperty('testbin');
      expect(resolution!.binaries).toHaveProperty('helper');
    });
  });
});
