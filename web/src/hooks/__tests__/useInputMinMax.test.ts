/**
 * @jest-environment jsdom
 */
import { renderHook, act } from '@testing-library/react';
import { useInputMinMax } from '../useInputMinMax';

jest.mock('react', () => ({
  ...jest.requireActual('react'),
  useContext: jest.fn(),
}));

jest.mock('zustand/traditional', () => ({
  useStoreWithEqualityFn: jest.fn(),
}));

jest.mock('../../contexts/NodeContext', () => ({
  NodeContext: { Provider: ({ children }: any) => children },
}));

import { useContext } from 'react';
import { useStoreWithEqualityFn } from 'zustand/traditional';

const mockUseContext = useContext as jest.Mock;
const mockUseStoreWithEqualityFn = useStoreWithEqualityFn as jest.Mock;

describe('useInputMinMax', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns default min/max when not a FloatInput or IntegerInput', () => {
    mockUseContext.mockReturnValue({ subscribe: () => {}, getState: () => ({}) });
    mockUseStoreWithEqualityFn.mockReturnValue([]);

    const { result } = renderHook(() => 
      useInputMinMax({
        nodeId: 'test-node',
        propertyName: 'value',
      })
    );

    expect(result.current.min).toBe(0);
    expect(result.current.max).toBe(100);
  });

  it('uses provided propertyMin and propertyMax', () => {
    mockUseContext.mockReturnValue({ subscribe: () => {}, getState: () => ({}) });
    mockUseStoreWithEqualityFn.mockReturnValue([]);

    const { result } = renderHook(() => 
      useInputMinMax({
        nodeId: 'test-node',
        propertyName: 'value',
        propertyMin: 10,
        propertyMax: 50,
      })
    );

    expect(result.current.min).toBe(10);
    expect(result.current.max).toBe(50);
  });

  it('uses node context bounds for FloatInput', () => {
    const mockContext = { subscribe: () => {}, getState: () => ({}) };
    mockUseContext.mockReturnValue(mockContext);
    mockUseStoreWithEqualityFn.mockReturnValue([
      {
        id: 'test-node',
        data: {
          properties: {
            min: 5,
            max: 95,
          },
        },
      },
    ]);

    const { result } = renderHook(() => 
      useInputMinMax({
        nodeType: 'nodetool.input.FloatInput',
        nodeId: 'test-node',
        propertyName: 'value',
      })
    );

    expect(result.current.min).toBe(5);
    expect(result.current.max).toBe(95);
  });

  it('uses node context bounds for IntegerInput', () => {
    const mockContext = { subscribe: () => {}, getState: () => ({}) };
    mockUseContext.mockReturnValue(mockContext);
    mockUseStoreWithEqualityFn.mockReturnValue([
      {
        id: 'test-node',
        data: {
          properties: {
            min: 1,
            max: 10,
          },
        },
      },
    ]);

    const { result } = renderHook(() => 
      useInputMinMax({
        nodeType: 'nodetool.input.IntegerInput',
        nodeId: 'test-node',
        propertyName: 'value',
      })
    );

    expect(result.current.min).toBe(1);
    expect(result.current.max).toBe(10);
  });

  it('prefers node context bounds over property bounds', () => {
    const mockContext = { subscribe: () => {}, getState: () => ({}) };
    mockUseContext.mockReturnValue(mockContext);
    mockUseStoreWithEqualityFn.mockReturnValue([
      {
        id: 'test-node',
        data: {
          properties: {
            min: 20,
            max: 80,
          },
        },
      },
    ]);

    const { result } = renderHook(() => 
      useInputMinMax({
        nodeType: 'nodetool.input.FloatInput',
        nodeId: 'test-node',
        propertyName: 'value',
        propertyMin: 0,
        propertyMax: 100,
      })
    );

    expect(result.current.min).toBe(20);
    expect(result.current.max).toBe(80);
  });

  it('falls back to property bounds when node context bounds are not numbers', () => {
    const mockContext = { subscribe: () => {}, getState: () => ({}) };
    mockUseContext.mockReturnValue(mockContext);
    mockUseStoreWithEqualityFn.mockReturnValue([
      {
        id: 'test-node',
        data: {
          properties: {
            min: null,
            max: undefined,
          },
        },
      },
    ]);

    const { result } = renderHook(() => 
      useInputMinMax({
        nodeType: 'nodetool.input.FloatInput',
        nodeId: 'test-node',
        propertyName: 'value',
        propertyMin: 5,
        propertyMax: 200,
      })
    );

    expect(result.current.min).toBe(5);
    expect(result.current.max).toBe(200);
  });

  it('returns defaults when propertyName is not "value" but uses property bounds when provided', () => {
    mockUseContext.mockReturnValue({ subscribe: () => {}, getState: () => ({}) });
    mockUseStoreWithEqualityFn.mockReturnValue([]);

    const { result } = renderHook(() => 
      useInputMinMax({
        nodeType: 'nodetool.input.FloatInput',
        nodeId: 'test-node',
        propertyName: 'other_property',
        propertyMin: 10,
        propertyMax: 50,
      })
    );

    expect(result.current.min).toBe(10);
    expect(result.current.max).toBe(50);
  });

  it('handles empty nodes array', () => {
    const mockContext = { subscribe: () => {}, getState: () => ({}) };
    mockUseContext.mockReturnValue(mockContext);
    mockUseStoreWithEqualityFn.mockReturnValue([]);

    const { result } = renderHook(() => 
      useInputMinMax({
        nodeType: 'nodetool.input.FloatInput',
        nodeId: 'test-node',
        propertyName: 'value',
        propertyMin: 1,
        propertyMax: 99,
      })
    );

    expect(result.current.min).toBe(1);
    expect(result.current.max).toBe(99);
  });

  it('handles node not found in nodes array', () => {
    const mockContext = { subscribe: () => {}, getState: () => ({}) };
    mockUseContext.mockReturnValue(mockContext);
    mockUseStoreWithEqualityFn.mockReturnValue([
      {
        id: 'other-node',
        data: {
          properties: {},
        },
      },
    ]);

    const { result } = renderHook(() => 
      useInputMinMax({
        nodeType: 'nodetool.input.FloatInput',
        nodeId: 'test-node',
        propertyName: 'value',
        propertyMin: 1,
        propertyMax: 99,
      })
    );

    expect(result.current.min).toBe(1);
    expect(result.current.max).toBe(99);
  });

  it('handles null context', () => {
    mockUseContext.mockReturnValue(null);
    mockUseStoreWithEqualityFn.mockReturnValue([]);

    const { result } = renderHook(() => 
      useInputMinMax({
        nodeId: 'test-node',
        propertyName: 'value',
        propertyMin: 10,
        propertyMax: 50,
      })
    );

    expect(result.current.min).toBe(10);
    expect(result.current.max).toBe(50);
  });
});
