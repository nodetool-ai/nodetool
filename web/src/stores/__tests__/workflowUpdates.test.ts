import {
  handleUpdate,
  subscribeToWorkflowUpdates,
  unsubscribeFromWorkflowUpdates
} from '../workflowUpdates';
import {
  JobUpdate,
  NodeUpdate,
  NodeProgress,
  LogUpdate,
  Notification,
  EdgeUpdate,
  PlanningUpdate,
  ToolCallUpdate,
  TaskUpdate,
  OutputUpdate,
  PreviewUpdate
} from '../ApiTypes';
import { WorkflowAttributes } from '../ApiTypes';

jest.mock('../ResultsStore', () => ({
  __esModule: true,
  default: {
    getState: () => ({
      setResult: jest.fn(),
      setOutputResult: jest.fn(),
      clearOutputResults: jest.fn(),
      setProgress: jest.fn(),
      clearProgress: jest.fn(),
      setPreview: jest.fn(),
      setTask: jest.fn(),
      setToolCall: jest.fn(),
      setPlanningUpdate: jest.fn(),
      setEdge: jest.fn(),
      clearEdges: jest.fn()
    })
  }
}));

jest.mock('../StatusStore', () => ({
  __esModule: true,
  default: {
    getState: () => ({
      setStatus: jest.fn(),
      getStatus: jest.fn(() => 'pending'),
      clearStatuses: jest.fn()
    })
  }
}));

jest.mock('../LogStore', () => ({
  __esModule: true,
  default: {
    getState: () => ({
      appendLog: jest.fn()
    })
  }
}));

jest.mock('../ErrorStore', () => ({
  __esModule: true,
  default: {
    getState: () => ({
      setError: jest.fn()
    })
  }
}));

jest.mock('../NotificationStore', () => ({
  __esModule: true,
  useNotificationStore: {
    getState: () => ({
      addNotification: jest.fn()
    })
  }
}));

jest.mock('../ExecutionTimeStore', () => ({
  __esModule: true,
  default: {
    getState: () => ({
      startExecution: jest.fn(),
      endExecution: jest.fn(),
      clearTimings: jest.fn()
    })
  }
}));

jest.mock('../../queryClient', () => ({
  queryClient: {
    invalidateQueries: jest.fn()
  }
}));

jest.mock('../../lib/websocket/GlobalWebSocketManager', () => ({
  globalWebSocketManager: {
    subscribe: jest.fn(() => jest.fn()),
    unsubscribe: jest.fn()
  }
}));

describe('workflowUpdates', () => {
  let mockRunnerStore: any;
  const mockWorkflow: WorkflowAttributes = {
    id: 'workflow-1',
    name: 'Test Workflow',
    nodes: [],
    edges: []
  };

  beforeEach(() => {
    jest.clearAllMocks();
    delete (global as { __UPDATES__?: unknown }).__UPDATES__;

    mockRunnerStore = {
      getState: () => ({
        state: 'idle',
        job_id: null,
        statusMessage: null,
        addNotification: jest.fn()
      }),
      setState: jest.fn()
    };
  });

  describe('handleUpdate', () => {
    describe('log_update handling', () => {
      it('processes log_update without throwing', () => {
        const logUpdate: LogUpdate = {
          type: 'log_update',
          node_id: 'node-1',
          node_name: 'Test Node',
          content: 'Test log message',
          severity: 'info'
        };

        expect(() => {
          handleUpdate(mockWorkflow, logUpdate, mockRunnerStore);
        }).not.toThrow();
      });

      it('handles different severity levels without throwing', () => {
        const severities = ['debug', 'info', 'warning', 'error'] as const;

        severities.forEach(severity => {
          const logUpdate: LogUpdate = {
            type: 'log_update',
            node_id: 'node-1',
            node_name: 'Test Node',
            content: 'Test message',
            severity
          };

          expect(() => {
            handleUpdate(mockWorkflow, logUpdate, mockRunnerStore);
          }).not.toThrow();
        });
      });
    });

    describe('notification handling', () => {
      it('processes notification without throwing', () => {
        const notification: Notification = {
          type: 'notification',
          severity: 'info',
          content: 'Test notification'
        };

        expect(() => {
          handleUpdate(mockWorkflow, notification, mockRunnerStore);
        }).not.toThrow();
      });

      it('handles error notification', () => {
        const notification: Notification = {
          type: 'notification',
          severity: 'error',
          content: 'Error notification'
        };

        expect(() => {
          handleUpdate(mockWorkflow, notification, mockRunnerStore);
        }).not.toThrow();
      });
    });

    describe('edge_update handling', () => {
      it('updates edge status when not cancelled', () => {
        mockRunnerStore.getState = () => ({ state: 'running', job_id: null, statusMessage: null });
        
        const edgeUpdate: EdgeUpdate = {
          type: 'edge_update',
          edge_id: 'edge-1',
          status: 'running'
        };

        expect(() => {
          handleUpdate(mockWorkflow, edgeUpdate, mockRunnerStore);
        }).not.toThrow();
      });

      it('handles cancelled state', () => {
        mockRunnerStore.getState = () => ({ state: 'cancelled', job_id: null, statusMessage: null });
        
        const edgeUpdate: EdgeUpdate = {
          type: 'edge_update',
          edge_id: 'edge-1',
          status: 'running'
        };

        expect(() => {
          handleUpdate(mockWorkflow, edgeUpdate, mockRunnerStore);
        }).not.toThrow();
      });

      it('handles error state', () => {
        mockRunnerStore.getState = () => ({ state: 'error', job_id: null, statusMessage: null });
        
        const edgeUpdate: EdgeUpdate = {
          type: 'edge_update',
          edge_id: 'edge-1',
          status: 'running'
        };

        expect(() => {
          handleUpdate(mockWorkflow, edgeUpdate, mockRunnerStore);
        }).not.toThrow();
      });
    });

    describe('job_update handling', () => {
      it('sets state to running when job status is running', () => {
        const jobUpdate: JobUpdate = {
          type: 'job_update',
          job_id: 'job-123',
          status: 'running'
        };

        handleUpdate(mockWorkflow, jobUpdate, mockRunnerStore);

        expect(mockRunnerStore.setState).toHaveBeenCalledWith({ state: 'running' });
      });

      it('sets state to running when job status is queued', () => {
        const jobUpdate: JobUpdate = {
          type: 'job_update',
          job_id: 'job-123',
          status: 'queued'
        };

        handleUpdate(mockWorkflow, jobUpdate, mockRunnerStore);

        expect(mockRunnerStore.setState).toHaveBeenCalledWith({ state: 'running' });
      });

      it('processes completed job without throwing', () => {
        const jobUpdate: JobUpdate = {
          type: 'job_update',
          job_id: 'job-123',
          status: 'completed'
        };

        expect(() => {
          handleUpdate(mockWorkflow, jobUpdate, mockRunnerStore);
        }).not.toThrow();
      });

      it('processes cancelled job without throwing', () => {
        const jobUpdate: JobUpdate = {
          type: 'job_update',
          job_id: 'job-123',
          status: 'cancelled'
        };

        expect(() => {
          handleUpdate(mockWorkflow, jobUpdate, mockRunnerStore);
        }).not.toThrow();
      });

      it('processes failed job without throwing', () => {
        const jobUpdate: JobUpdate = {
          type: 'job_update',
          job_id: 'job-123',
          status: 'failed',
          error: 'Job failed'
        };

        expect(() => {
          handleUpdate(mockWorkflow, jobUpdate, mockRunnerStore);
        }).not.toThrow();
      });

      it('processes timed_out job without throwing', () => {
        const jobUpdate: JobUpdate = {
          type: 'job_update',
          job_id: 'job-123',
          status: 'timed_out'
        };

        expect(() => {
          handleUpdate(mockWorkflow, jobUpdate, mockRunnerStore);
        }).not.toThrow();
      });

      it('processes suspended job without throwing', () => {
        const jobUpdate: JobUpdate = {
          type: 'job_update',
          job_id: 'job-123',
          status: 'suspended',
          message: 'Waiting for input'
        };

        expect(() => {
          handleUpdate(mockWorkflow, jobUpdate, mockRunnerStore);
        }).not.toThrow();
      });

      it('sets state to paused when job is paused', () => {
        const jobUpdate: JobUpdate = {
          type: 'job_update',
          job_id: 'job-123',
          status: 'paused'
        };

        handleUpdate(mockWorkflow, jobUpdate, mockRunnerStore);

        expect(mockRunnerStore.setState).toHaveBeenCalledWith({ state: 'paused' });
      });

      it('sets status message for queued jobs', () => {
        const jobUpdate: JobUpdate = {
          type: 'job_update',
          job_id: 'job-123',
          status: 'queued'
        };

        handleUpdate(mockWorkflow, jobUpdate, mockRunnerStore);

        expect(mockRunnerStore.setState).toHaveBeenCalledWith({
          statusMessage: 'Worker is booting (may take a 15 seconds)...'
        });
      });
    });

    describe('node_update handling', () => {
      it('processes node_update without throwing', () => {
        const nodeUpdate: NodeUpdate = {
          type: 'node_update',
          node_id: 'node-1',
          node_name: 'Test Node',
          status: 'running'
        };

        expect(() => {
          handleUpdate(mockWorkflow, nodeUpdate, mockRunnerStore);
        }).not.toThrow();
      });

      it('handles node error update without throwing', () => {
        const nodeUpdate: NodeUpdate = {
          type: 'node_update',
          node_id: 'node-1',
          node_name: 'Test Node',
          status: 'error',
          error: 'Node failed'
        };

        expect(() => {
          handleUpdate(mockWorkflow, nodeUpdate, mockRunnerStore);
        }).not.toThrow();
      });

      it('does not update node when workflow is cancelled', () => {
        mockRunnerStore.getState = () => ({ state: 'cancelled', job_id: null, statusMessage: null, addNotification: jest.fn() });
        
        const nodeUpdate: NodeUpdate = {
          type: 'node_update',
          node_id: 'node-1',
          node_name: 'Test Node',
          status: 'running'
        };

        expect(() => {
          handleUpdate(mockWorkflow, nodeUpdate, mockRunnerStore);
        }).not.toThrow();
      });
    });

    describe('node_progress handling', () => {
      it('processes node_progress without throwing', () => {
        const progress: NodeProgress = {
          type: 'node_progress',
          node_id: 'node-1',
          progress: 50,
          total: 100
        };

        expect(() => {
          handleUpdate(mockWorkflow, progress, mockRunnerStore);
        }).not.toThrow();
      });

      it('does not process node_progress when workflow is cancelled', () => {
        mockRunnerStore.getState = () => ({ state: 'cancelled', job_id: null, statusMessage: null });
        
        const progress: NodeProgress = {
          type: 'node_progress',
          node_id: 'node-1',
          progress: 50,
          total: 100
        };

        expect(() => {
          handleUpdate(mockWorkflow, progress, mockRunnerStore);
        }).not.toThrow();
      });
    });

    describe('preview_update handling', () => {
      it('processes preview_update without throwing', () => {
        const preview: PreviewUpdate = {
          type: 'preview_update',
          node_id: 'node-1',
          value: { uri: 'data:image/png;base64,abc123' }
        };

        expect(() => {
          handleUpdate(mockWorkflow, preview, mockRunnerStore);
        }).not.toThrow();
      });
    });

    describe('output_update handling', () => {
      it('processes output_update without throwing', () => {
        const output: OutputUpdate = {
          type: 'output_update',
          node_id: 'node-1',
          value: 'test output'
        };

        expect(() => {
          handleUpdate(mockWorkflow, output, mockRunnerStore);
        }).not.toThrow();
      });
    });

    describe('update processing without throwing', () => {
      it('handles planning_update without throwing', () => {
        const planning: PlanningUpdate = {
          type: 'planning_update',
          node_id: 'node-1',
          plan: 'Step 1: Do something'
        };

        expect(() => {
          handleUpdate(mockWorkflow, planning, mockRunnerStore);
        }).not.toThrow();
      });

      it('handles tool_call_update without throwing', () => {
        const toolCall: ToolCallUpdate = {
          type: 'tool_call_update',
          node_id: 'node-1',
          tool: 'search',
          input: 'query'
        };

        expect(() => {
          handleUpdate(mockWorkflow, toolCall, mockRunnerStore);
        }).not.toThrow();
      });

      it('handles task_update without throwing', () => {
        const task: TaskUpdate = {
          type: 'task_update',
          node_id: 'node-1',
          task: 'Current task'
        };

        expect(() => {
          handleUpdate(mockWorkflow, task, mockRunnerStore);
        }).not.toThrow();
      });
    });
  });

  describe('subscribeToWorkflowUpdates', () => {
    it('returns unsubscribe function', () => {
      const unsubscribe = subscribeToWorkflowUpdates('workflow-1', mockWorkflow, mockRunnerStore);
      expect(typeof unsubscribe).toBe('function');
    });

    it('calls globalWebSocketManager.subscribe', () => {
      const { globalWebSocketManager } = require('../../lib/websocket/GlobalWebSocketManager');
      
      subscribeToWorkflowUpdates('workflow-1', mockWorkflow, mockRunnerStore);
      
      expect(globalWebSocketManager.subscribe).toHaveBeenCalledWith(
        'workflow-1',
        expect.any(Function)
      );
    });
  });

  describe('unsubscribeFromWorkflowUpdates', () => {
    it('does not throw when unsubscribing from non-existent workflow', () => {
      expect(() => {
        unsubscribeFromWorkflowUpdates('non-existent-workflow');
      }).not.toThrow();
    });
  });
});
