import { usePanelStore } from '../PanelStore';

describe('PanelStore', () => {
  const initialState = usePanelStore.getState();
  const { minWidth, maxWidth, defaultWidth } = initialState.panel;
  const minPanelSize = defaultWidth - 100;

  afterEach(() => {
    usePanelStore.setState(initialState, true);
  });

  test('setSize clamps values', () => {
    usePanelStore.getState().setSize(0);
    expect(usePanelStore.getState().panel.panelSize).toBe(minWidth);

    usePanelStore.getState().setSize(2000);
    expect(usePanelStore.getState().panel.panelSize).toBe(maxWidth);
  });

  test('handleViewChange toggles visibility for same view', () => {
    usePanelStore.getState().handleViewChange('assets');
    expect(usePanelStore.getState().panel.activeView).toBe('assets');
    expect(usePanelStore.getState().panel.isVisible).toBe(true);

    usePanelStore.getState().handleViewChange('assets');
    expect(usePanelStore.getState().panel.isVisible).toBe(false);
  });

  test('collapsed panel expands when reopened', () => {
    usePanelStore.setState({
      ...usePanelStore.getState(),
      panel: {
        ...usePanelStore.getState().panel,
        panelSize: minWidth,
        isVisible: false,
        activeView: 'workflowGrid'
      }
    }, true);

    usePanelStore.getState().handleViewChange('workflowGrid');
    const panel = usePanelStore.getState().panel;
    expect(panel.panelSize).toBeGreaterThanOrEqual(minPanelSize);
    expect(panel.isVisible).toBe(true);
  });
});
