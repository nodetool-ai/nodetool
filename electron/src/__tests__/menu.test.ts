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
      createPackageManagerWindow: jest.fn(),
    }));

    const menuModule = await import('../menu');
    menuModule.buildMenu();

    expect(buildFromTemplateMock).not.toHaveBeenCalled();
    expect(setApplicationMenuMock).not.toHaveBeenCalled();
  });

  it('builds menu and wires commands when window exists', async () => {
    mockIpcChannels();

    const sendMock = jest.fn();
    const createPackageManagerWindowMock = jest.fn();

    const buildFromTemplateMock = jest
      .fn()
      .mockImplementation((template) => ({ template }));
    const setApplicationMenuMock = jest.fn();
    const openExternalMock = jest.fn().mockResolvedValue(undefined);

    jest.doMock('electron', () => ({
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
      createPackageManagerWindow: createPackageManagerWindowMock,
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

    // Trigger package manager command
    const toolsMenu = template.find((item) => item.label === 'Tools');
    const packageManagerItem = toolsMenu?.submenu?.find(
      (item: any) => item.label === 'Package Manager',
    );
    packageManagerItem?.click();
    expect(createPackageManagerWindowMock).toHaveBeenCalled();

    // Trigger help command
    const helpMenu = template.find((item) => item.role === 'help');
    const learnMoreItem = helpMenu?.submenu?.find(
      (item: any) => item.label === 'Learn More',
    );
    await learnMoreItem?.click?.();
    expect(openExternalMock).toHaveBeenCalledWith('https://nodetool.ai');

    expect(setApplicationMenuMock).toHaveBeenCalledWith({ template });
  });
});
