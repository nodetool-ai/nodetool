import React, { useContext } from 'react';
import { render, screen, act } from '@testing-library/react';
import { create } from 'zustand';
import { NodeProvider, useNodes, useTemporalNodes, NodeContext } from '../NodeContext';

const createMockStore = () => {
  const store: any = create(() => ({
    value: 42,
    data: { a: 1 }
  }));
  store.temporal = create(() => ({ count: 5 }));
  return store;
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('NodeProvider', () => {
  test('renders loading state when store not available', () => {
    const createStore = () => null as any;
    render(
      <NodeProvider createStore={createStore}>
        <div>child</div>
      </NodeProvider>
    );
    expect(screen.getByText('Loading workflow...')).toBeInTheDocument();
  });

  test('renders children when store available', () => {
    const store = createMockStore();
    const createStore = () => store;
    render(
      <NodeProvider createStore={createStore}>
        <div data-testid="child">child</div>
      </NodeProvider>
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  test('passes store to context', () => {
    const store = createMockStore();
    const createStore = () => store;
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
      useNodes((s: any) => s.value);
      return null;
    };
    expect(() => render(<Component />)).toThrow('useNodes must be used within a NodeProvider');
  });

  test('returns selected state correctly', () => {
    const store = createMockStore();
    const createStore = () => store;
    const Child = () => {
      const value = useNodes((s: any) => s.value);
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
    const createStore = () => store;
    let renderCount = 0;
    const Child = () => {
      renderCount++;
      const data = useNodes((s: any) => s.data);
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
      useTemporalNodes((s: any) => s.count);
      return null;
    };
    expect(() => render(<Component />)).toThrow('useTemporalNodes must be used within a NodeProvider');
  });

  test('accesses temporal state correctly', () => {
    const store = createMockStore();
    const createStore = () => store;
    const Child = () => {
      const count = useTemporalNodes((s: any) => s.count);
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
