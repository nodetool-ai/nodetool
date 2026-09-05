import { usePanelStore } from '../PanelStore';

describe('PanelStore', () => {
  const initialState = usePanelStore.getState();
  const { minSize, maxSize } = initialState.panel;
  // Store MIN_PANEL_SIZE — the usable minimum restored when reopening.
  const minPanelSize = 160;

  afterEach(() => {
    usePanelStore.setState(initialState, true);
  });

  test('setSize clamps values', () => {
    usePanelStore.getState().setSize(0);
    expect(usePanelStore.getState().panel.panelSize).toBe(minSize);

    usePanelStore.getState().setSize(2000);
    expect(usePanelStore.getState().panel.panelSize).toBe(maxSize);
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
        panelSize: minSize,
        isVisible: false,
        activeView: 'workflows'
      }
    }, true);

    usePanelStore.getState().handleViewChange('workflows');
    const panel = usePanelStore.getState().panel;
    expect(panel.panelSize).toBeGreaterThanOrEqual(minPanelSize);
    expect(panel.isVisible).toBe(true);
  });
});
