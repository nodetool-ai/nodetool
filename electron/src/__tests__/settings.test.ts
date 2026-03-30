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

  test('autoUpdatesEnabled defaults to false when not set', async () => {
    const { readSettings } = await import('../settings');
    const settings = readSettings();
    // Auto-updates should default to false (opt-in behavior)
    expect(settings.autoUpdatesEnabled).toBeUndefined();
    // When checking the setting, undefined should be treated as false
    expect(settings.autoUpdatesEnabled === true).toBe(false);
  });

  test('autoUpdatesEnabled can be set to true', async () => {
    const { updateSetting, readSettings } = await import('../settings');
    
    // Enable auto-updates
    updateSetting('autoUpdatesEnabled', true);
    
    // Re-import to clear cache
    jest.resetModules();
    const { readSettings: readSettingsAgain } = await import('../settings');
    const settings = readSettingsAgain();
    
    expect(settings.autoUpdatesEnabled).toBe(true);
  });

  test('autoUpdatesEnabled can be toggled on and off', async () => {
    const settingsDir = path.join(tempDir, '.config', 'nodetool');
    fs.mkdirSync(settingsDir, { recursive: true });
    const settingsPath = path.join(settingsDir, 'settings.yaml');
    
    const { updateSetting } = await import('../settings');
    
    // Enable auto-updates
    updateSetting('autoUpdatesEnabled', true);
    let contents = yaml.load(fs.readFileSync(settingsPath, 'utf8')) as any;
    expect(contents.autoUpdatesEnabled).toBe(true);
    
    // Disable auto-updates
    updateSetting('autoUpdatesEnabled', false);
    contents = yaml.load(fs.readFileSync(settingsPath, 'utf8')) as any;
    expect(contents.autoUpdatesEnabled).toBe(false);
  });

  test('readSettingsAsync returns empty object when missing', async () => {
    const { readSettingsAsync } = await import('../settings');
    const result = await readSettingsAsync();
    expect(result).toEqual({});
  });

  test('readSettingsAsync loads existing yaml', async () => {
    const settingsDir = path.join(tempDir, '.config', 'nodetool');
    fs.mkdirSync(settingsDir, { recursive: true });
    const settingsPath = path.join(settingsDir, 'settings.yaml');
    fs.writeFileSync(settingsPath, yaml.dump({ foo: 'async' }), 'utf8');

    const { readSettingsAsync } = await import('../settings');
    const result = await readSettingsAsync();
    expect(result).toEqual({ foo: 'async' });
  });

  test('model service startup settings default from MODEL_BACKEND', async () => {
    const { updateSettings, getModelServiceStartupSettings } = await import('../settings');
    updateSettings({ MODEL_BACKEND: 'llama_cpp' });
    const startup = getModelServiceStartupSettings();
    expect(startup).toEqual({
      startOllamaOnStartup: false,
      startLlamaCppOnStartup: true,
    });
  });

  test('updateModelServiceStartupSettings persists explicit startup settings', async () => {
    const { updateModelServiceStartupSettings, readSettings } = await import('../settings');
    const updated = updateModelServiceStartupSettings({
      startOllamaOnStartup: false,
      startLlamaCppOnStartup: true,
    });
    expect(updated).toEqual({
      startOllamaOnStartup: false,
      startLlamaCppOnStartup: true,
    });
    const settings = readSettings();
    expect(settings.START_OLLAMA_ON_STARTUP).toBe(false);
    expect(settings.START_LLAMA_CPP_ON_STARTUP).toBe(true);
  });
});
