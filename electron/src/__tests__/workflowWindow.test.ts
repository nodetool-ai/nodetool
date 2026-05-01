import { BrowserWindow, Menu, app } from 'electron';
import { createWorkflowWindow, isWorkflowWindow } from '../workflowWindow';

jest.mock('electron', () => {
  const mockBrowserWindow = jest.fn().mockImplementation(() => ({
    id: 1,
    setBackgroundColor: jest.fn(),
    loadURL: jest.fn(),
    on: jest.fn(),
    webContents: {
      on: jest.fn(),
      setWindowOpenHandler: jest.fn(),
    },
  }));
  return {
    BrowserWindow: Object.assign(mockBrowserWindow, { getAllWindows: jest.fn() }),
    Menu: { setApplicationMenu: jest.fn() },
    app: { isPackaged: false },
    screen: {},
    shell: { openExternal: jest.fn() },
    session: {
      defaultSession: {
        setPermissionRequestHandler: jest.fn(),
        setPermissionCheckHandler: jest.fn(),
        webRequest: { onHeadersReceived: jest.fn() },
      },
    },
    dialog: { showErrorBox: jest.fn() },
  };
});

jest.mock('../state', () => ({
  setMainWindow: jest.fn(),
  getMainWindow: jest.fn(),
  serverState: { serverPort: 7777 },
}));

jest.mock('../main', () => ({
  isAppQuitting: false,
}));

jest.mock('../logger', () => ({
  logMessage: jest.fn(),
}));

jest.mock('../devMode', () => ({
  isElectronDevMode: jest.fn().mockReturnValue(false),
  getWebDevServerUrl: jest.fn().mockReturnValue('http://127.0.0.1:3000'),
}));

describe('workflowWindow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates and tracks workflow window', () => {
    const win = createWorkflowWindow('123');

    expect(Menu.setApplicationMenu).toHaveBeenCalledWith(null);
    expect(BrowserWindow).toHaveBeenCalled();
    expect(win.setBackgroundColor).toHaveBeenCalledWith('#111111');
    expect(win.loadURL).toHaveBeenCalledWith('http://127.0.0.1:3000/index.html?workflow_id=123');
    expect(isWorkflowWindow(win)).toBe(true);

    const closedHandler = (win.on as jest.Mock).mock.calls.find(([e]) => e === 'closed')[1];
    closedHandler();
    expect(isWorkflowWindow(win)).toBe(false);
  });

  it('returns false for unknown windows', () => {
    expect(isWorkflowWindow({ id: 99 } as any)).toBe(false);
  });
});
