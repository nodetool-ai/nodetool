import { setupWorkflowShortcuts, registerWorkflowShortcut } from '../shortcuts';
import { globalShortcut } from 'electron';
import { fetchWorkflows } from '../api';
import { runWorkflow } from '../workflowExecution';

// Mock dependencies
jest.mock('../api');
jest.mock('../workflowExecution');

describe('Shortcuts', () => {
  const mockGlobalShortcut = globalShortcut as jest.Mocked<typeof globalShortcut>;
  const mockFetchWorkflows = fetchWorkflows as jest.MockedFunction<typeof fetchWorkflows>;
  const mockRunWorkflow = runWorkflow as jest.MockedFunction<typeof runWorkflow>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('registerWorkflowShortcut', () => {
    const mockWorkflow = {
      id: '1',
      name: 'Test Workflow',
      settings: {
        shortcut: 'CommandOrControl+Shift+T'
      }
    };

    it('should register shortcut for workflow with settings', async () => {
      mockGlobalShortcut.register.mockReturnValue(true);

      await registerWorkflowShortcut(mockWorkflow);

      expect(mockGlobalShortcut.unregister).toHaveBeenCalledWith('CommandOrControl+Shift+T');
      expect(mockGlobalShortcut.register).toHaveBeenCalledWith(
        'CommandOrControl+Shift+T',
        expect.any(Function)
      );
    });

    it('should execute workflow when shortcut is triggered', async () => {
      let shortcutCallback: () => void = () => {};
      mockGlobalShortcut.register.mockImplementation((shortcut, callback) => {
        shortcutCallback = callback;
        return true;
      });

      await registerWorkflowShortcut(mockWorkflow);

      // Simulate shortcut trigger
      shortcutCallback();

      expect(mockRunWorkflow).toHaveBeenCalledWith(mockWorkflow);
    });

    it('should not register shortcut if workflow has no shortcut setting', async () => {
      const workflowWithoutShortcut = {
        id: '1',
        name: 'Test Workflow',
        settings: {}
      };

      await registerWorkflowShortcut(workflowWithoutShortcut);

      expect(mockGlobalShortcut.register).not.toHaveBeenCalled();
      expect(mockGlobalShortcut.unregister).not.toHaveBeenCalled();
    });

    it('should not register shortcut if workflow has no settings', async () => {
      const workflowWithoutSettings = {
        id: '1',
        name: 'Test Workflow'
      };

      await registerWorkflowShortcut(workflowWithoutSettings);

      expect(mockGlobalShortcut.register).not.toHaveBeenCalled();
      expect(mockGlobalShortcut.unregister).not.toHaveBeenCalled();
    });

    it('should handle registration failure', async () => {
      mockGlobalShortcut.register.mockReturnValue(false);

      await registerWorkflowShortcut(mockWorkflow);

      expect(mockGlobalShortcut.register).toHaveBeenCalled();
    });

    it('should handle errors during registration', async () => {
      mockGlobalShortcut.register.mockImplementation(() => {
        throw new Error('Registration error');
      });

      // Should not throw
      await expect(registerWorkflowShortcut(mockWorkflow)).resolves.toBeUndefined();
    });
  });

  describe('setupWorkflowShortcuts', () => {
    it('should set up shortcuts for all workflows', async () => {
      const mockWorkflows = [
        {
          id: '1',
          name: 'Workflow 1',
          settings: { shortcut: 'CommandOrControl+1' }
        },
        {
          id: '2',
          name: 'Workflow 2',
          settings: { shortcut: 'CommandOrControl+2' }
        }
      ];

      mockFetchWorkflows.mockResolvedValue(mockWorkflows);
      mockGlobalShortcut.register.mockReturnValue(true);

      await setupWorkflowShortcuts();

      expect(mockFetchWorkflows).toHaveBeenCalled();
      expect(mockGlobalShortcut.register).toHaveBeenCalledTimes(2);
      expect(mockGlobalShortcut.register).toHaveBeenCalledWith(
        'CommandOrControl+1',
        expect.any(Function)
      );
      expect(mockGlobalShortcut.register).toHaveBeenCalledWith(
        'CommandOrControl+2',
        expect.any(Function)
      );
    });

    it('should handle empty workflows array', async () => {
      mockFetchWorkflows.mockResolvedValue([]);

      await setupWorkflowShortcuts();

      expect(mockFetchWorkflows).toHaveBeenCalled();
      expect(mockGlobalShortcut.register).not.toHaveBeenCalled();
    });

    it('should handle fetchWorkflows error', async () => {
      mockFetchWorkflows.mockRejectedValue(new Error('Fetch error'));

      // Should not throw
      await expect(setupWorkflowShortcuts()).resolves.toBeUndefined();
    });

    it('should handle workflows without shortcuts', async () => {
      const mockWorkflows = [
        {
          id: '1',
          name: 'Workflow 1'
        },
        {
          id: '2',
          name: 'Workflow 2',
          settings: {}
        }
      ];

      mockFetchWorkflows.mockResolvedValue(mockWorkflows);

      await setupWorkflowShortcuts();

      expect(mockFetchWorkflows).toHaveBeenCalled();
      expect(mockGlobalShortcut.register).not.toHaveBeenCalled();
    });
  });
});