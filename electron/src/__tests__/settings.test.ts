import fs from 'fs';
import path from 'path';
import os from 'os';
import yaml from 'js-yaml';

let tempDir: string;
const originalPlatform = process.platform;
const originalHomedir = os.homedir;

function setPlatform(platform: NodeJS.Platform) {
  Object.defineProperty(process, 'platform', { value: platform });
}

beforeEach(() => {
  jest.resetModules();
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'settings-test-'));
  jest.spyOn(os, 'homedir').mockReturnValue(tempDir);
  setPlatform('linux');
});

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
  (os.homedir as jest.Mock).mockRestore();
  setPlatform(originalPlatform as NodeJS.Platform);
});

describe('settings module', () => {
  test('getAppConfigPath creates config path', async () => {
    const { getAppConfigPath } = await import('../settings');
    const result = getAppConfigPath('file.txt');
    expect(result).toBe(path.join(tempDir, '.config', 'nodetool', 'file.txt'));
    expect(fs.existsSync(path.dirname(result))).toBe(true);
  });

  test('readSettings returns empty object when missing', async () => {
    const { readSettings } = await import('../settings');
    const result = readSettings();
    expect(result).toEqual({});
  });

  test('readSettings loads existing yaml', async () => {
    const settingsDir = path.join(tempDir, '.config', 'nodetool');
    fs.mkdirSync(settingsDir, { recursive: true });
    const settingsPath = path.join(settingsDir, 'settings.yaml');
    fs.writeFileSync(settingsPath, yaml.dump({ foo: 'bar' }), 'utf8');

    const { readSettings } = await import('../settings');
    const result = readSettings();
    expect(result).toEqual({ foo: 'bar' });
  });

  test('updateSetting updates a single key', async () => {
    const settingsDir = path.join(tempDir, '.config', 'nodetool');
    fs.mkdirSync(settingsDir, { recursive: true });
    const settingsPath = path.join(settingsDir, 'settings.yaml');
    fs.writeFileSync(settingsPath, yaml.dump({ foo: 'bar' }), 'utf8');

    const { updateSetting } = await import('../settings');
    const result = updateSetting('foo', 'baz');
    expect(result).toEqual({ foo: 'baz' });
    const contents = yaml.load(fs.readFileSync(settingsPath, 'utf8')) as any;
    expect(contents).toEqual({ foo: 'baz' });
  });

  test('updateSettings merges keys', async () => {
    const { updateSettings } = await import('../settings');
    updateSettings({ alpha: 1 });
    const settingsPath = path.join(tempDir, '.config', 'nodetool', 'settings.yaml');
    const contents = yaml.load(fs.readFileSync(settingsPath, 'utf8')) as any;
    expect(contents).toEqual({ alpha: 1 });
  });
});
