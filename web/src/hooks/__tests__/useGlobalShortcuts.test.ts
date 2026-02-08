import { renderHook } from "@testing-library/react";
import { useGlobalShortcuts } from "../useGlobalShortcuts";
import { useAppHeaderStore } from "../../stores/AppHeaderStore";
import {
  registerComboCallback,
  unregisterComboCallback
} from "../../stores/KeyPressedStore";
import * as platform from "../../utils/platform";

// Mock dependencies
jest.mock("../../stores/AppHeaderStore");
jest.mock("../../stores/KeyPressedStore");
jest.mock("../../utils/platform");

describe("useGlobalShortcuts", () => {
  const mockHandleOpenHelp = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (useAppHeaderStore as unknown as jest.Mock).mockImplementation((
      selector
    ) =>
      selector({
        helpOpen: false,
        helpIndex: 0,
        setHelpOpen: jest.fn(),
        setHelpIndex: jest.fn(),
        handleOpenHelp: mockHandleOpenHelp,
        handleCloseHelp: jest.fn()
      })
    );
    // Default to Windows/Linux
    (platform.isMac as jest.Mock).mockReturnValue(false);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("should register Ctrl+Shift+/ shortcut on non-Mac platforms", () => {
    renderHook(() => useGlobalShortcuts());

    // Note: keys are sorted alphabetically when normalized
    expect(registerComboCallback).toHaveBeenCalledWith(
      "/+control+shift",
      expect.objectContaining({
        callback: mockHandleOpenHelp,
        preventDefault: true,
        active: true
      })
    );
  });

  it("should register Cmd+Shift+/ shortcut on Mac platforms", () => {
    (platform.isMac as jest.Mock).mockReturnValue(true);

    renderHook(() => useGlobalShortcuts());

    // Note: keys are sorted alphabetically when normalized
    expect(registerComboCallback).toHaveBeenCalledWith(
      "/+meta+shift",
      expect.objectContaining({
        callback: mockHandleOpenHelp,
        preventDefault: true,
        active: true
      })
    );
  });

  it("should unregister shortcuts on unmount", () => {
    const { unmount } = renderHook(() => useGlobalShortcuts());

    unmount();

    // Note: keys are sorted alphabetically when normalized
    expect(unregisterComboCallback).toHaveBeenCalledWith("/+control+shift");
  });

  it("should use handleOpenHelp from AppHeaderStore", () => {
    renderHook(() => useGlobalShortcuts());

    const registeredCall = (
      registerComboCallback as jest.Mock
    ).mock.calls.find((call) => call[0] === "/+control+shift");

    expect(registeredCall).toBeDefined();
    expect(registeredCall?.[1]?.callback).toBe(mockHandleOpenHelp);
  });
});
