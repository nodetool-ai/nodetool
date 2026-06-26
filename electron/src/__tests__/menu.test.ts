describe('buildMenu', () => {
  const mockIpcChannels = () => {
    jest.doMock('../types.d', () => ({
      IpcChannels: {
        MENU_EVENT: 'menu-event',
      },
    }));
  };

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('does nothing when no main window is available', async () => {
    mockIpcChannels();

    const buildFromTemplateMock = jest.fn();
    const setApplicationMenuMock = jest.fn();

    jest.doMock('electron', () => ({
      app: {
        isPackaged: false,
        getPath: jest.fn().mockReturnValue('/mock/userData'),
      },
      Menu: {
        buildFromTemplate: buildFromTemplateMock,
        setApplicationMenu: setApplicationMenuMock,
      },
      shell: {
        openExternal: jest.fn(),
      },
    }));

    jest.doMock('../state', () => ({
      getMainWindow: jest.fn().mockReturnValue(null),
    }));

    jest.doMock('../window', () => ({
      createLogViewerWindow: jest.fn(),
      openSettingsInMainWindow: jest.fn(),
    }));

    const menuModule = await import('../menu');
    menuModule.buildMenu();

    expect(buildFromTemplateMock).not.toHaveBeenCalled();
    expect(setApplicationMenuMock).not.toHaveBeenCalled();
  });

  it('builds menu and wires commands when window exists', async () => {
    mockIpcChannels();

    const sendMock = jest.fn();

    const buildFromTemplateMock = jest
      .fn()
      .mockImplementation((template) => ({ template }));
    const setApplicationMenuMock = jest.fn();
    const openExternalMock = jest.fn().mockResolvedValue(undefined);

    jest.doMock('electron', () => ({
      app: {
        isPackaged: false,
        getPath: jest.fn().mockReturnValue('/mock/userData'),
      },
      Menu: {
        buildFromTemplate: buildFromTemplateMock,
        setApplicationMenu: setApplicationMenuMock,
      },
      shell: {
        openExternal: openExternalMock,
      },
    }));

    jest.doMock('../state', () => ({
      getMainWindow: jest.fn().mockReturnValue({
        webContents: {
          send: sendMock,
        },
      }),
    }));

    jest.doMock('../window', () => ({
      createLogViewerWindow: jest.fn(),
      openSettingsInMainWindow: jest.fn(),
    }));

    const menuModule = await import('../menu');
    menuModule.buildMenu();

    expect(buildFromTemplateMock).toHaveBeenCalledTimes(1);
    const template = buildFromTemplateMock.mock.calls[0][0] as Array<Record<string, any>>;

    // Trigger save command
    const fileMenu = template.find((item) => item.label === 'File');
    const saveItem = fileMenu?.submenu?.find((item: any) => item.label === 'Save');
    saveItem?.click();
    expect(sendMock).toHaveBeenCalledWith('menu-event', { type: 'saveWorkflow' });

    // Trigger help command
    const helpMenu = template.find((item) => item.role === 'help');
    const learnMoreItem = helpMenu?.submenu?.find(
      (item: any) => item.label === 'Learn More',
    );
    await learnMoreItem?.click?.();
    expect(openExternalMock).toHaveBeenCalledWith('https://nodetool.ai');

    expect(setApplicationMenuMock).toHaveBeenCalledWith({ template });
  });

  it('builds a Vaults submenu, checks the active vault, and switches on click', async () => {
    mockIpcChannels();

    const buildFromTemplateMock = jest
      .fn()
      .mockImplementation((template) => ({ template }));
    const setApplicationMenuMock = jest.fn();
    const showErrorBoxMock = jest.fn();

    jest.doMock('electron', () => ({
      app: {
        isPackaged: false,
        getPath: jest.fn().mockReturnValue('/mock/userData'),
      },
      Menu: {
        buildFromTemplate: buildFromTemplateMock,
        setApplicationMenu: setApplicationMenuMock,
      },
      shell: { openExternal: jest.fn() },
      dialog: { showErrorBox: showErrorBoxMock },
    }));

    jest.doMock('../state', () => ({
      getMainWindow: jest.fn().mockReturnValue({
        webContents: { send: jest.fn() },
      }),
    }));

    const openSettingsInMainWindowMock = jest.fn();
    jest.doMock('../window', () => ({
      createLogViewerWindow: jest.fn(),
      openSettingsInMainWindow: openSettingsInMainWindowMock,
    }));

    jest.doMock('../vaults', () => ({
      listVaults: jest.fn().mockReturnValue([
        { id: 'default', name: 'Default', dbPath: null, assetPath: null, vectorPath: null },
        { id: 'work', name: 'Work', dbPath: '/x/work.sqlite3', assetPath: '/x/assets', vectorPath: '/x/v.db' },
      ]),
      getActiveVaultId: jest.fn().mockReturnValue('default'),
    }));

    const applyVaultSwitchMock = jest.fn().mockResolvedValue(undefined);
    jest.doMock('../vaultSwitch', () => ({
      applyVaultSwitch: applyVaultSwitchMock,
    }));

    const menuModule = await import('../menu');
    menuModule.buildMenu();

    const template = buildFromTemplateMock.mock.calls[0][0] as Array<Record<string, any>>;
    const vaultMenu = template.find((item) => item.label === 'Vaults');
    expect(vaultMenu).toBeDefined();

    const submenu = vaultMenu?.submenu as Array<Record<string, any>>;
    const defaultItem = submenu.find((item) => item.label === 'Default');
    const workItem = submenu.find((item) => item.label === 'Work');

    // Active vault is checked; the others are not.
    expect(defaultItem?.type).toBe('radio');
    expect(defaultItem?.checked).toBe(true);
    expect(workItem?.checked).toBe(false);

    // "Manage Vaults…" opens settings in the main window.
    const manageItem = submenu.find((item) => item.label === 'Manage Vaults…');
    manageItem?.click();
    expect(openSettingsInMainWindowMock).toHaveBeenCalledTimes(1);

    // Clicking the already-active vault is a no-op.
    defaultItem?.click();
    expect(applyVaultSwitchMock).not.toHaveBeenCalled();

    // Clicking a different vault triggers a switch (resolved via dynamic import).
    workItem?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(applyVaultSwitchMock).toHaveBeenCalledWith('work');
  });
});
