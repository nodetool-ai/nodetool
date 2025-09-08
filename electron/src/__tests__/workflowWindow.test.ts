import { BrowserWindow, Menu, app } from 'electron';
import { createWorkflowWindow, isWorkflowWindow, baseUrl } from '../workflowWindow';

jest.mock('electron', () => {
  const mockBrowserWindow = jest.fn().mockImplementation(() => ({
    id: 1,
    setBackgroundColor: jest.fn(),
    loadURL: jest.fn(),
    on: jest.fn(),
  }));
  return {
    BrowserWindow: Object.assign(mockBrowserWindow, { getAllWindows: jest.fn() }),
    Menu: { setApplicationMenu: jest.fn() },
    app: { isPackaged: false },
    screen: {},
  };
});

describe('workflowWindow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates and tracks workflow window', () => {
    const win = createWorkflowWindow('123');

    expect(Menu.setApplicationMenu).toHaveBeenCalledWith(null);
    expect(BrowserWindow).toHaveBeenCalled();
    expect(win.setBackgroundColor).toHaveBeenCalledWith('#111111');
    expect(win.loadURL).toHaveBeenCalledWith(`${baseUrl}?workflow_id=123`);
    expect(isWorkflowWindow(win)).toBe(true);

    const closedHandler = (win.on as jest.Mock).mock.calls.find(([e]) => e === 'closed')[1];
    closedHandler();
    expect(isWorkflowWindow(win)).toBe(false);
  });

  it('returns false for unknown windows', () => {
    expect(isWorkflowWindow({ id: 99 } as any)).toBe(false);
  });
});
