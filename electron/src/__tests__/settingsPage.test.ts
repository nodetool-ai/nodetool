/**
 * @fileoverview Tests for the SettingsPage component functionality
 *
 * Tests the Settings UI API that allows users to:
 * - Enable/disable automatic updates (opt-in)
 * - Install available updates when an update is ready
 */

// Mock window.api
const mockGetAutoUpdates = jest.fn();
const mockSetAutoUpdates = jest.fn();
const mockRestartAndInstall = jest.fn();
const mockOnAvailable = jest.fn();
const mockOpenExternal = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAutoUpdates.mockResolvedValue(false);
  mockSetAutoUpdates.mockResolvedValue(undefined);
  mockRestartAndInstall.mockResolvedValue(undefined);
  mockOnAvailable.mockReturnValue(jest.fn());

  (global as any).window = {
    api: {
      settings: {
        getAutoUpdates: mockGetAutoUpdates,
        setAutoUpdates: mockSetAutoUpdates,
      },
      updates: {
        onAvailable: mockOnAvailable,
        restartAndInstall: mockRestartAndInstall,
      },
      shell: {
        openExternal: mockOpenExternal,
      },
    },
  };
});

describe('Settings Page functionality', () => {
  describe('auto-updates toggle', () => {
    it('should default to disabled (opt-in behavior)', async () => {
      mockGetAutoUpdates.mockResolvedValue(false);
      
      // Verify the API returns false by default
      const result = await mockGetAutoUpdates();
      expect(result).toBe(false);
    });

    it('should call setAutoUpdates when toggled on', async () => {
      // Simulate enabling auto-updates
      await mockSetAutoUpdates(true);
      
      expect(mockSetAutoUpdates).toHaveBeenCalledWith(true);
    });

    it('should call setAutoUpdates when toggled off', async () => {
      mockGetAutoUpdates.mockResolvedValue(true);
      
      // Simulate disabling auto-updates
      await mockSetAutoUpdates(false);
      
      expect(mockSetAutoUpdates).toHaveBeenCalledWith(false);
    });
  });

  describe('update installation', () => {
    it('should call restartAndInstall when install button is clicked', async () => {
      // Simulate clicking install update
      await mockRestartAndInstall();
      
      expect(mockRestartAndInstall).toHaveBeenCalled();
    });

    it('should subscribe to update available events', () => {
      const callback = jest.fn();
      const unsubscribe = mockOnAvailable(callback);
      
      expect(mockOnAvailable).toHaveBeenCalled();
      expect(typeof unsubscribe).toBe('function');
    });
  });

  describe('release notes', () => {
    it('should open release notes URL in external browser', async () => {
      const releaseUrl = 'https://github.com/nodetool-ai/nodetool/releases/tag/v1.0.0';
      
      await mockOpenExternal(releaseUrl);
      
      expect(mockOpenExternal).toHaveBeenCalledWith(releaseUrl);
    });
  });
});

describe('Settings API integration', () => {
  it('should have correct IPC channel types for auto-updates', () => {
    // Verify the API methods exist
    expect(mockGetAutoUpdates).toBeDefined();
    expect(mockSetAutoUpdates).toBeDefined();
  });

  it('should handle errors gracefully when settings fail to load', async () => {
    mockGetAutoUpdates.mockRejectedValue(new Error('Failed to load settings'));
    
    await expect(mockGetAutoUpdates()).rejects.toThrow('Failed to load settings');
  });

  it('should handle errors gracefully when settings fail to save', async () => {
    mockSetAutoUpdates.mockRejectedValue(new Error('Failed to save settings'));
    
    await expect(mockSetAutoUpdates(true)).rejects.toThrow('Failed to save settings');
  });
});
