import { useDataFlowAnimationStore, DEFAULT_SETTINGS } from '../DataFlowAnimationStore';

describe('DataFlowAnimationStore', () => {
  const initialState = useDataFlowAnimationStore.getState();

  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
    // Reset store state
    useDataFlowAnimationStore.setState({
      workflowStates: {},
      settings: { ...DEFAULT_SETTINGS },
    });
  });

  afterEach(() => {
    useDataFlowAnimationStore.setState(initialState, true);
    localStorage.clear();
  });

  describe('Initial State', () => {
    test('has correct default settings', () => {
      const settings = useDataFlowAnimationStore.getState().settings;
      expect(settings.enabled).toBe(true);
      expect(settings.animationSpeed).toBe(3);
      expect(settings.showDataLabels).toBe(false);
      expect(settings.particleSize).toBe(6);
    });

    test('has empty workflow states', () => {
      const workflowStates = useDataFlowAnimationStore.getState().workflowStates;
      expect(workflowStates).toEqual({});
    });
  });

  describe('Workflow State Management', () => {
    test('setWorkflowRunning creates workflow state if not exists', () => {
      useDataFlowAnimationStore.getState().setWorkflowRunning('workflow-1', true);
      
      const workflowState = useDataFlowAnimationStore.getState().getWorkflowState('workflow-1');
      expect(workflowState).toBeDefined();
      expect(workflowState?.workflowId).toBe('workflow-1');
      expect(workflowState?.isRunning).toBe(true);
      expect(workflowState?.enabled).toBe(true);
      expect(workflowState?.animations).toEqual({});
    });

    test('setWorkflowRunning updates existing workflow state', () => {
      useDataFlowAnimationStore.getState().setWorkflowRunning('workflow-1', true);
      useDataFlowAnimationStore.getState().setWorkflowRunning('workflow-1', false);
      
      const workflowState = useDataFlowAnimationStore.getState().getWorkflowState('workflow-1');
      expect(workflowState?.isRunning).toBe(false);
    });

    test('setWorkflowEnabled updates enabled state', () => {
      useDataFlowAnimationStore.getState().setWorkflowEnabled('workflow-1', false);
      
      const workflowState = useDataFlowAnimationStore.getState().getWorkflowState('workflow-1');
      expect(workflowState?.enabled).toBe(false);
    });

    test('multiple workflow states are independent', () => {
      useDataFlowAnimationStore.getState().setWorkflowRunning('workflow-1', true);
      useDataFlowAnimationStore.getState().setWorkflowRunning('workflow-2', false);
      useDataFlowAnimationStore.getState().setWorkflowEnabled('workflow-2', false);
      
      const state1 = useDataFlowAnimationStore.getState().getWorkflowState('workflow-1');
      const state2 = useDataFlowAnimationStore.getState().getWorkflowState('workflow-2');
      
      expect(state1?.isRunning).toBe(true);
      expect(state1?.enabled).toBe(true);
      expect(state2?.isRunning).toBe(false);
      expect(state2?.enabled).toBe(false);
    });
  });

  describe('Edge Animation Management', () => {
    beforeEach(() => {
      // Setup workflow as running and enabled
      useDataFlowAnimationStore.getState().setWorkflowRunning('workflow-1', true);
      useDataFlowAnimationStore.getState().setWorkflowEnabled('workflow-1', true);
    });

    test('startEdgeAnimation creates animation', () => {
      useDataFlowAnimationStore.getState().startEdgeAnimation('workflow-1', 'edge-1');
      
      const animation = useDataFlowAnimationStore.getState().getEdgeAnimation('workflow-1', 'edge-1');
      expect(animation).toBeDefined();
      expect(animation?.edgeId).toBe('edge-1');
      expect(animation?.workflowId).toBe('workflow-1');
      expect(animation?.progress).toBe(0);
      expect(animation?.duration).toBeGreaterThan(0);
    });

    test('startEdgeAnimation with custom color and label', () => {
      useDataFlowAnimationStore.getState().startEdgeAnimation(
        'workflow-1',
        'edge-1',
        '#FF0000',
        'image'
      );
      
      const animation = useDataFlowAnimationStore.getState().getEdgeAnimation('workflow-1', 'edge-1');
      expect(animation?.color).toBe('#FF0000');
      expect(animation?.dataLabel).toBe('image');
    });

    test('startEdgeAnimation does not create animation when disabled', () => {
      useDataFlowAnimationStore.getState().updateSettings({ enabled: false });
      useDataFlowAnimationStore.getState().startEdgeAnimation('workflow-1', 'edge-1');
      
      const animation = useDataFlowAnimationStore.getState().getEdgeAnimation('workflow-1', 'edge-1');
      expect(animation).toBeUndefined();
    });

    test('startEdgeAnimation does not create animation when workflow not running', () => {
      useDataFlowAnimationStore.getState().setWorkflowRunning('workflow-1', false);
      useDataFlowAnimationStore.getState().startEdgeAnimation('workflow-1', 'edge-1');
      
      const animation = useDataFlowAnimationStore.getState().getEdgeAnimation('workflow-1', 'edge-1');
      expect(animation).toBeUndefined();
    });

    test('startEdgeAnimation does not create animation when workflow disabled', () => {
      useDataFlowAnimationStore.getState().setWorkflowEnabled('workflow-1', false);
      useDataFlowAnimationStore.getState().startEdgeAnimation('workflow-1', 'edge-1');
      
      const animation = useDataFlowAnimationStore.getState().getEdgeAnimation('workflow-1', 'edge-1');
      expect(animation).toBeUndefined();
    });

    test('updateEdgeAnimation updates progress', () => {
      useDataFlowAnimationStore.getState().startEdgeAnimation('workflow-1', 'edge-1');
      useDataFlowAnimationStore.getState().updateEdgeAnimation('workflow-1', 'edge-1', 0.5);
      
      const animation = useDataFlowAnimationStore.getState().getEdgeAnimation('workflow-1', 'edge-1');
      expect(animation?.progress).toBe(0.5);
    });

    test('completeEdgeAnimation removes animation', () => {
      useDataFlowAnimationStore.getState().startEdgeAnimation('workflow-1', 'edge-1');
      useDataFlowAnimationStore.getState().completeEdgeAnimation('workflow-1', 'edge-1');
      
      const animation = useDataFlowAnimationStore.getState().getEdgeAnimation('workflow-1', 'edge-1');
      expect(animation).toBeUndefined();
    });

    test('clearWorkflowAnimations removes all animations for workflow', () => {
      useDataFlowAnimationStore.getState().startEdgeAnimation('workflow-1', 'edge-1');
      useDataFlowAnimationStore.getState().startEdgeAnimation('workflow-1', 'edge-2');
      useDataFlowAnimationStore.getState().clearWorkflowAnimations('workflow-1');
      
      const workflowState = useDataFlowAnimationStore.getState().getWorkflowState('workflow-1');
      expect(workflowState?.animations).toEqual({});
    });

    test('multiple animations can exist simultaneously', () => {
      useDataFlowAnimationStore.getState().startEdgeAnimation('workflow-1', 'edge-1', '#FF0000');
      useDataFlowAnimationStore.getState().startEdgeAnimation('workflow-1', 'edge-2', '#00FF00');
      
      const animation1 = useDataFlowAnimationStore.getState().getEdgeAnimation('workflow-1', 'edge-1');
      const animation2 = useDataFlowAnimationStore.getState().getEdgeAnimation('workflow-1', 'edge-2');
      
      expect(animation1?.color).toBe('#FF0000');
      expect(animation2?.color).toBe('#00FF00');
    });
  });

  describe('Settings Management', () => {
    test('updateSettings updates single setting', () => {
      useDataFlowAnimationStore.getState().updateSettings({ animationSpeed: 5 });
      
      const settings = useDataFlowAnimationStore.getState().settings;
      expect(settings.animationSpeed).toBe(5);
      expect(settings.enabled).toBe(DEFAULT_SETTINGS.enabled); // Other settings unchanged
    });

    test('updateSettings updates multiple settings', () => {
      useDataFlowAnimationStore.getState().updateSettings({
        animationSpeed: 1,
        showDataLabels: true,
        particleSize: 12,
      });
      
      const settings = useDataFlowAnimationStore.getState().settings;
      expect(settings.animationSpeed).toBe(1);
      expect(settings.showDataLabels).toBe(true);
      expect(settings.particleSize).toBe(12);
      expect(settings.enabled).toBe(DEFAULT_SETTINGS.enabled);
    });

    test('resetSettings restores defaults', () => {
      useDataFlowAnimationStore.getState().updateSettings({
        enabled: false,
        animationSpeed: 5,
        showDataLabels: true,
        particleSize: 12,
      });
      
      useDataFlowAnimationStore.getState().resetSettings();
      
      const settings = useDataFlowAnimationStore.getState().settings;
      expect(settings).toEqual(DEFAULT_SETTINGS);
    });
  });

  describe('Getters', () => {
    test('getWorkflowState returns undefined for non-existent workflow', () => {
      const state = useDataFlowAnimationStore.getState().getWorkflowState('non-existent');
      expect(state).toBeUndefined();
    });

    test('getEdgeAnimation returns undefined for non-existent animation', () => {
      useDataFlowAnimationStore.getState().setWorkflowRunning('workflow-1', true);
      
      const animation = useDataFlowAnimationStore.getState().getEdgeAnimation('workflow-1', 'non-existent');
      expect(animation).toBeUndefined();
    });
  });

  describe('Edge Animation Key Generation', () => {
    test('animations from different workflows are independent', () => {
      useDataFlowAnimationStore.getState().setWorkflowRunning('workflow-1', true);
      useDataFlowAnimationStore.getState().setWorkflowRunning('workflow-2', true);
      
      useDataFlowAnimationStore.getState().startEdgeAnimation('workflow-1', 'edge-1', '#FF0000');
      useDataFlowAnimationStore.getState().startEdgeAnimation('workflow-2', 'edge-1', '#00FF00');
      
      const animation1 = useDataFlowAnimationStore.getState().getEdgeAnimation('workflow-1', 'edge-1');
      const animation2 = useDataFlowAnimationStore.getState().getEdgeAnimation('workflow-2', 'edge-1');
      
      // Same edge ID but different workflows should have independent animations
      expect(animation1?.color).toBe('#FF0000');
      expect(animation2?.color).toBe('#00FF00');
      expect(animation1).not.toBe(animation2);
    });
  });
});
