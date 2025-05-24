import React from "react";
import { render, act } from "@testing-library/react";
import { ContextMenuProvider } from "../ContextMenuProvider";
import useContextMenu from "../../stores/ContextMenuStore";

function setup(active = true) {
  let ctx: any;
  function Consumer() {
    ctx = useContextMenu();
    return null;
  }
  const utils = render(
    <ContextMenuProvider active={active}>
      <Consumer />
    </ContextMenuProvider>
  );
  return { getCtx: () => ctx!, ...utils };
}

describe('ContextMenuProvider', () => {
  let addSpy: jest.SpyInstance;
  let removeSpy: jest.SpyInstance;
  beforeEach(() => {
    jest.useFakeTimers();
    addSpy = jest.spyOn(document, 'addEventListener');
    removeSpy = jest.spyOn(document, 'removeEventListener');
    (document as any).elementFromPoint = () => null;
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    addSpy.mockRestore();
    removeSpy.mockRestore();
    delete (document as any).elementFromPoint;
  });

  test('openContextMenu sets state when active', () => {
    const { getCtx } = setup();
    act(() => {
      getCtx().openContextMenu('menu', 'id', 10, 20);
      jest.advanceTimersByTime(0);
    });
    expect(getCtx().openMenuType).toBe('menu');
    expect(getCtx().nodeId).toBe('id');
    expect(getCtx().menuPosition).toEqual({ x: 10, y: 20 });
  });

  test('openContextMenu does nothing when inactive', () => {
    const { getCtx } = setup(false);
    act(() => {
      getCtx().openContextMenu('menu', 'id', 0, 0);
    });
    expect(getCtx().openMenuType).toBeNull();
  });

  test('openContextMenu validates click position', () => {
    const el = document.createElement('div');
    el.classList.add('inside');
    (document as any).elementFromPoint = () => el;
    const { getCtx } = setup();
    act(() => {
      getCtx().openContextMenu('menu', 'id', 0, 0, 'inside');
    });
    expect(getCtx().openMenuType).toBe('menu');
  });

  test('mouseup listener added after timeout', () => {
    const { getCtx } = setup();
    act(() => {
      getCtx().openContextMenu('menu', 'id', 0, 0);
    });
    expect(addSpy).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(addSpy).toHaveBeenCalledWith('mouseup', expect.any(Function));
  });

  test('closeContextMenu resets state and removes listener', () => {
    const { getCtx } = setup();
    act(() => {
      getCtx().openContextMenu('menu', 'id', 0, 0);
      jest.advanceTimersByTime(500);
    });
    const handler = addSpy.mock.calls[0][1] as any;
    act(() => {
      getCtx().closeContextMenu();
    });
    expect(removeSpy).toHaveBeenCalledWith('mouseup', handler);
    act(() => {
      jest.advanceTimersByTime(50);
    });
    expect(getCtx().openMenuType).toBeNull();
  });

  test('clickOutsideHandler closes when clicking outside', () => {
    const { getCtx } = setup();
    const boundary = document.createElement('div');
    boundary.classList.add('ignore');
    (document as any).elementFromPoint = () => boundary;
    act(() => {
      getCtx().openContextMenu('menu', 'id', 0, 0, 'ignore');
      jest.advanceTimersByTime(500);
    });
    const handler = addSpy.mock.calls[0][1] as any;
    const outside = document.createElement('div');
    (document as any).elementFromPoint = () => outside;
    act(() => {
      handler({ target: outside } as any);
      jest.advanceTimersByTime(50);
    });
    expect(getCtx().openMenuType).toBeNull();
  });

  test('clickOutsideHandler keeps menu open when clicking inside', () => {
    const { getCtx } = setup();
    const boundary = document.createElement('div');
    boundary.classList.add('inside');
    (document as any).elementFromPoint = () => boundary;
    document.body.appendChild(boundary);
    act(() => {
      getCtx().openContextMenu('menu', 'id', 0, 0, 'inside');
      jest.advanceTimersByTime(500);
    });
    const handler = addSpy.mock.calls[0][1] as any;
    const insideChild = document.createElement('span');
    boundary.appendChild(insideChild);
    act(() => {
      handler({ target: insideChild } as any);
      jest.advanceTimersByTime(50);
    });
    expect(getCtx().openMenuType).toBe('menu');
  });

  test('previous listeners removed when opening new menu', () => {
    const { getCtx } = setup();
    act(() => {
      getCtx().openContextMenu('menu', 'id', 0, 0);
      jest.advanceTimersByTime(500);
    });
    const firstHandler = addSpy.mock.calls[0][1] as any;
    act(() => {
      getCtx().openContextMenu('menu2', 'id', 1, 1);
    });
    expect(removeSpy).toHaveBeenCalledWith('mouseup', firstHandler);
  });
});
