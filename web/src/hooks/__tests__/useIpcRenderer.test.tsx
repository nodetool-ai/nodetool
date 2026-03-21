import React from "react";
import { renderHook } from "@testing-library/react";
import { useMenuHandler } from "../useIpcRenderer";
import { MenuContext } from "../../providers/MenuProvider";

describe("useMenuHandler", () => {
  const createMockContext = () => ({
    registerHandler: jest.fn(),
    unregisterHandler: jest.fn()
  });

  const createWrapper = (context: ReturnType<typeof createMockContext>) => {
    const Wrapper = ({ children }: { children: React.ReactNode }) => (
      <MenuContext.Provider value={context}>{children}</MenuContext.Provider>
    );
    Wrapper.displayName = "MenuContextWrapper";
    return Wrapper;
  };

  it("does not throw when used outside MenuProvider (no-op)", () => {
    const handler = jest.fn();
    expect(() => {
      renderHook(() => useMenuHandler(handler));
    }).not.toThrow();
  });

  it("registers handler on mount", () => {
    const mockContext = createMockContext();
    const handler = jest.fn();

    renderHook(() => useMenuHandler(handler), {
      wrapper: createWrapper(mockContext)
    });

    expect(mockContext.registerHandler).toHaveBeenCalledWith(handler);
  });

  it("unregisters handler on unmount", () => {
    const mockContext = createMockContext();
    const handler = jest.fn();

    const { unmount } = renderHook(() => useMenuHandler(handler), {
      wrapper: createWrapper(mockContext)
    });

    expect(mockContext.registerHandler).toHaveBeenCalledWith(handler);
    expect(mockContext.unregisterHandler).not.toHaveBeenCalled();

    unmount();

    expect(mockContext.unregisterHandler).toHaveBeenCalledWith(handler);
  });

  it("re-registers handler when it changes", () => {
    const mockContext = createMockContext();
    const handler1 = jest.fn();
    const handler2 = jest.fn();

    const { rerender } = renderHook(({ handler }) => useMenuHandler(handler), {
      wrapper: createWrapper(mockContext),
      initialProps: { handler: handler1 }
    });

    expect(mockContext.registerHandler).toHaveBeenCalledWith(handler1);
    expect(mockContext.registerHandler).toHaveBeenCalledTimes(1);

    // Rerender with new handler
    rerender({ handler: handler2 });

    // Should unregister old handler and register new one
    expect(mockContext.unregisterHandler).toHaveBeenCalledWith(handler1);
    expect(mockContext.registerHandler).toHaveBeenCalledWith(handler2);
  });

  it("does not re-register when handler reference stays the same", () => {
    const mockContext = createMockContext();
    const handler = jest.fn();

    const { rerender } = renderHook(({ handler }) => useMenuHandler(handler), {
      wrapper: createWrapper(mockContext),
      initialProps: { handler }
    });

    expect(mockContext.registerHandler).toHaveBeenCalledTimes(1);

    // Rerender with same handler reference
    rerender({ handler });

    expect(mockContext.registerHandler).toHaveBeenCalledTimes(1);
    expect(mockContext.unregisterHandler).not.toHaveBeenCalled();
  });

  it("handles multiple handlers registered from different hooks", () => {
    const mockContext = createMockContext();
    const handler1 = jest.fn();
    const handler2 = jest.fn();

    const wrapper = createWrapper(mockContext);

    renderHook(() => useMenuHandler(handler1), { wrapper });
    renderHook(() => useMenuHandler(handler2), { wrapper });

    expect(mockContext.registerHandler).toHaveBeenCalledWith(handler1);
    expect(mockContext.registerHandler).toHaveBeenCalledWith(handler2);
    expect(mockContext.registerHandler).toHaveBeenCalledTimes(2);
  });
});
