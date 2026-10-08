import { BrowserWindow, Menu, app } from 'electron';
import { serverState } from '../state';
import { createWorkflowWindow } from '../workflowWindow';

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

describe('workflowWindow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates and tracks workflow window', () => {
    const win = createWorkflowWindow('123');

    expect(BrowserWindow).toHaveBeenCalled();
    expect(win.setBackgroundColor).toHaveBeenCalledWith('#111111');
    expect(win.loadURL).toHaveBeenCalledWith('http://127.0.0.1:3000/index.html?workflow_id=123');
  });

  it('leaves the application menu in place', () => {
    createWorkflowWindow('123');

    expect(Menu.setApplicationMenu).not.toHaveBeenCalled();
  });

  it('uses the port the backend selected after the module loaded', () => {
    Object.assign(app, { isPackaged: true });
    serverState.serverPort = 7790;
    try {
      const win = createWorkflowWindow('a b&c');

      expect(win.loadURL).toHaveBeenCalledWith(
        'http://127.0.0.1:7790/apps/index.html?workflow_id=a%20b%26c',
      );
    } finally {
      Object.assign(app, { isPackaged: false });
      serverState.serverPort = 7777;
    }
  });
});
