import { useContext } from 'react';
import { render, screen, act } from '@testing-library/react';
import { create } from 'zustand';
import { NodeProvider, useNodes, useTemporalNodes, NodeContext } from '../NodeContext';
import type {
  NodeStore,
  NodeStoreState,
  PartializedNodeStore
} from '../../stores/NodeStore';
import type { TemporalState } from '../../stores/temporal';

/**
 * These tests exercise the context plumbing, not the node store: the provider
 * only passes its store through to the selector. So they feed it a minimal fake
 * and read that fake back, and the two functions below are the one place where
 * the fake's shape meets the real `NodeStoreState` the hooks are typed against.
 */
interface MockNodeState {
  value: number;
  data: { a: number };
}

interface MockTemporalState {
  count: number;
}

const asMockState = (state: NodeStoreState): MockNodeState =>
  // SAFETY: the store under test is the fake built by `createMockStore`.
  state as unknown as MockNodeState;

const asMockTemporalState = (
  state: TemporalState<PartializedNodeStore>
): MockTemporalState =>
  // SAFETY: the temporal store under test is the fake built by `createMockStore`.
  state as unknown as MockTemporalState;

const createMockStore = () => {
  const store = create<MockNodeState>(() => ({
    value: 42,
    data: { a: 1 }
  }));
  (store as unknown as { temporal: unknown }).temporal = create<MockTemporalState>(
    () => ({ count: 5 })
  );
  return store;
};

/** Hands the fake to `NodeProvider`, which only passes it through. */
const asNodeStore = (store: ReturnType<typeof createMockStore>): NodeStore =>
  // SAFETY: the provider stores this value and hands it to the selector hooks,
  // which read it back through `asMockState`/`asMockTemporalState`.
  store as unknown as NodeStore;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('NodeProvider', () => {
  test('renders loading state when store not available', () => {
    const createStore = () => null;
    render(
      <NodeProvider createStore={createStore}>
        <div>child</div>
      </NodeProvider>
    );
    expect(screen.getByText('Loading workflow...')).toBeInTheDocument();
  });

  test('renders children when store available', () => {
    const store = createMockStore();
    const createStore = () => asNodeStore(store);
    render(
      <NodeProvider createStore={createStore}>
        <div data-testid="child">child</div>
      </NodeProvider>
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  test('passes store to context', () => {
    const store = createMockStore();
    const createStore = () => asNodeStore(store);
    const Child = () => {
      const ctx = useContext(NodeContext)!;
      return <div>{(ctx.getState() as any).value}</div>;
    };
    render(
      <NodeProvider createStore={createStore}>
        <Child />
      </NodeProvider>
    );
    expect(screen.getByText('42')).toBeInTheDocument();
  });
});

describe('useNodes', () => {
  test('throws error when used outside provider', () => {
    const Component = () => {
      useNodes((s) => asMockState(s).value);
      return null;
    };
    expect(() => render(<Component />)).toThrow('useNodes must be used within a NodeProvider');
  });

  test('returns selected state correctly', () => {
    const store = createMockStore();
    const createStore = () => asNodeStore(store);
    const Child = () => {
      const value = useNodes((s) => asMockState(s).value);
      return <div>{value}</div>;
    };
    render(
      <NodeProvider createStore={createStore}>
        <Child />
      </NodeProvider>
    );
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  test('re-renders only when selected state changes', () => {
    const store = createMockStore();
    const createStore = () => asNodeStore(store);
    let renderCount = 0;
    const Child = () => {
      renderCount++;
      const data = useNodes((s) => asMockState(s).data);
      return <div>{data.a}</div>;
    };
    render(
      <NodeProvider createStore={createStore}>
        <Child />
      </NodeProvider>
    );
    expect(renderCount).toBe(1);
    act(() => {
      store.setState({ data: { a: 1 } });
    });
    expect(renderCount).toBe(1);
    act(() => {
      store.setState({ data: { a: 2 } });
    });
    expect(renderCount).toBe(2);
  });
});

describe('useTemporalNodes', () => {
  test('throws error when used outside provider', () => {
    const Component = () => {
      useTemporalNodes((s) => asMockTemporalState(s).count);
      return null;
    };
    expect(() => render(<Component />)).toThrow('useTemporalNodes must be used within a NodeProvider');
  });

  test('accesses temporal state correctly', () => {
    const store = createMockStore();
    const createStore = () => asNodeStore(store);
    const Child = () => {
      const count = useTemporalNodes((s) => asMockTemporalState(s).count);
      return <div>{count}</div>;
    };
    render(
      <NodeProvider createStore={createStore}>
        <Child />
      </NodeProvider>
    );
    expect(screen.getByText('5')).toBeInTheDocument();
  });
});
