import { useWorkflowRunner } from '../../stores/WorkflowRunner';

describe('WorkflowRunner store', () => {
  const initialState = useWorkflowRunner.getState();

  afterEach(() => {
    useWorkflowRunner.setState(initialState, true);
    jest.useRealTimers();
  });

  test('addNotification and removeNotification manage notifications', () => {
    jest.useFakeTimers();
    useWorkflowRunner.getState().addNotification({ type: 'error', content: 'oops' });
    expect(useWorkflowRunner.getState().notifications).toHaveLength(1);
    const id = useWorkflowRunner.getState().notifications[0].id;

    // advance timers to trigger auto removal (10s for error)
    jest.advanceTimersByTime(10000);
    expect(useWorkflowRunner.getState().notifications).toHaveLength(0);

    // add another and remove manually
    useWorkflowRunner.getState().addNotification({ type: 'info', content: 'info' });
    const id2 = useWorkflowRunner.getState().notifications[0].id;
    useWorkflowRunner.getState().removeNotification(id2);
    expect(useWorkflowRunner.getState().notifications).toHaveLength(0);
  });
});
