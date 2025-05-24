import React, { useContext } from "react";
import { render, act } from "@testing-library/react";
import { MenuProvider, MenuContext } from "../MenuProvider";

function setup(withApi = true) {
  const onMenuEvent = jest.fn();
  const unregisterMenuEvent = jest.fn();
  if (withApi) {
    (window as any).api = { onMenuEvent, unregisterMenuEvent };
  } else {
    (window as any).api = undefined;
  }
  let ctx: any = null;
  function Consumer() {
    ctx = useContext(MenuContext)!;
    return null;
  }
  const utils = render(
    <MenuProvider>
      <Consumer />
    </MenuProvider>
  );
  return { ctx: () => ctx!, onMenuEvent, unregisterMenuEvent, unmount: utils.unmount };
}

describe('MenuProvider', () => {
  test('registerHandler and unregisterHandler manage handlers', () => {
    const { ctx, onMenuEvent } = setup(true);
    const globalHandler = onMenuEvent.mock.calls[0][0];
    const handler = jest.fn();
    act(() => {
      ctx().registerHandler(handler);
    });
    act(() => {
      globalHandler({ foo: 'bar' });
    });
    expect(handler).toHaveBeenCalledWith({ foo: 'bar' });

    act(() => {
      ctx().unregisterHandler(handler);
      globalHandler({ foo: 'baz' });
    });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  test('multiple handlers receive events', () => {
    const { ctx, onMenuEvent } = setup(true);
    const globalHandler = onMenuEvent.mock.calls[0][0];
    const h1 = jest.fn();
    const h2 = jest.fn();
    act(() => {
      ctx().registerHandler(h1);
      ctx().registerHandler(h2);
    });
    act(() => {
      globalHandler({ a: 1 });
    });
    expect(h1).toHaveBeenCalledWith({ a: 1 });
    expect(h2).toHaveBeenCalledWith({ a: 1 });
  });

  test('event listener cleanup on unmount', () => {
    const { onMenuEvent, unregisterMenuEvent, unmount } = setup(true);
    const handler = onMenuEvent.mock.calls[0][0];
    unmount();
    expect(unregisterMenuEvent).toHaveBeenCalledWith(handler);
  });

  test('works when window.api is undefined', () => {
    expect(() => {
      const { unmount } = setup(false);
      unmount();
    }).not.toThrow();
  });
});

