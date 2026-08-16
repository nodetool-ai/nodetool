/**
 * Tests for the AppState-backed lifecycle module. `AppState.addEventListener`
 * is spied on so the captured handler can be driven directly.
 */

import { AppState, type AppStateStatus } from 'react-native';

type Change = (state: AppStateStatus) => void;

let handlers: Change[] = [];
let removeCount = 0;

function fire(state: AppStateStatus): void {
  handlers.forEach((handler) => handler(state));
}

function loadModule() {
  // Each test needs the module's own `currentState` reset.
  let mod!: typeof import('./useAppLifecycle');
  jest.isolateModules(() => {
    mod = require('./useAppLifecycle');
  });
  return mod;
}

beforeEach(() => {
  handlers = [];
  removeCount = 0;
  (AppState as { currentState: AppStateStatus }).currentState = 'active';
  jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation((type: string, handler: Change) => {
      if (type === 'change') {
        handlers.push(handler);
      }
      return {
        remove: () => {
          removeCount++;
          handlers = handlers.filter((h) => h !== handler);
        },
      };
    });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('appLifecycle', () => {
  it('attaches one AppState listener no matter how many subscribers', () => {
    const { subscribeAppLifecycle } = loadModule();
    const a = subscribeAppLifecycle(jest.fn());
    const b = subscribeAppLifecycle(jest.fn());

    expect(handlers).toHaveLength(1);

    a();
    expect(handlers).toHaveLength(1);
    b();
    expect(handlers).toHaveLength(0);
    expect(removeCount).toBe(1);
  });

  it('emits background when leaving active and foreground when returning', () => {
    const { subscribeAppLifecycle, isAppForeground, getAppState } = loadModule();
    const events: string[] = [];
    const unsubscribe = subscribeAppLifecycle((event) => events.push(event));

    fire('background');
    expect(events).toEqual(['background']);
    expect(isAppForeground()).toBe(false);
    expect(getAppState()).toBe('background');

    fire('active');
    expect(events).toEqual(['background', 'foreground']);
    expect(isAppForeground()).toBe(true);

    unsubscribe();
  });

  it('treats inactive as backgrounded and collapses repeated phases', () => {
    const { subscribeAppLifecycle } = loadModule();
    const events: string[] = [];
    const unsubscribe = subscribeAppLifecycle((event) => events.push(event));

    fire('inactive');
    fire('background');
    fire('background');
    fire('active');
    fire('active');

    expect(events).toEqual(['background', 'foreground']);
    unsubscribe();
  });

  it('stops notifying a listener after it unsubscribes', () => {
    const { subscribeAppLifecycle } = loadModule();
    const listener = jest.fn();
    const unsubscribe = subscribeAppLifecycle(listener);
    unsubscribe();

    fire('background');

    expect(listener).not.toHaveBeenCalled();
  });

  it('keeps notifying other listeners when one throws', () => {
    const { subscribeAppLifecycle } = loadModule();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const good = jest.fn();
    const a = subscribeAppLifecycle(() => {
      throw new Error('boom');
    });
    const b = subscribeAppLifecycle(good);

    fire('background');

    expect(good).toHaveBeenCalledWith('background');
    a();
    b();
  });
});
