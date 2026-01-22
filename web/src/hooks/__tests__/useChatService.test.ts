/**
 * @jest-environment jsdom
 */
import { renderHook } from '@testing-library/react';
import { useChatService } from '../useChatService';

jest.mock('react', () => ({
  ...jest.requireActual('react'),
  useCallback: jest.fn((fn) => fn),
  useMemo: jest.fn((fn) => fn()),
}));

jest.mock('react-router-dom', () => ({
  useNavigate: jest.fn(() => jest.fn()),
}));

jest.mock('../../stores/GlobalChatStore', () => ({
  __esModule: true,
  default: (selector: any) => {
    const mockState = {
      status: 'disconnected',
      sendMessage: jest.fn(),
      createNewThread: jest.fn().mockResolvedValue('new-thread-id'),
      switchThread: jest.fn(),
      threads: {},
      messageCache: {},
      currentThreadId: null,
      deleteThread: jest.fn(),
      progress: 0,
      statusMessage: 'Ready',
      stopGeneration: jest.fn(),
      currentPlanningUpdate: null,
      currentTaskUpdate: null,
      lastTaskUpdatesByThread: {},
      currentLogUpdate: null,
    };
    return typeof selector === 'function' ? selector(mockState) : mockState;
  },
}));

describe('useChatService', () => {
  it('returns chat status from store', () => {
    const { result } = renderHook(() => useChatService({ id: 'model-1', name: 'Test Model' } as any));
    
    expect(result.current.status).toBe('disconnected');
  });

  it('returns progress from store', () => {
    const { result } = renderHook(() => useChatService({ id: 'model-1', name: 'Test Model' } as any));
    
    expect(result.current.progress).toBe(0);
  });

  it('returns statusMessage from store', () => {
    const { result } = renderHook(() => useChatService({ id: 'model-1', name: 'Test Model' } as any));
    
    expect(result.current.statusMessage).toBe('Ready');
  });

  it('returns threads from store', () => {
    const { result } = renderHook(() => useChatService({ id: 'model-1', name: 'Test Model' } as any));
    
    expect(result.current.threads).toEqual({});
  });

  it('returns currentThreadId from store', () => {
    const { result } = renderHook(() => useChatService({ id: 'model-1', name: 'Test Model' } as any));
    
    expect(result.current.currentThreadId).toBeNull();
  });

  it('provides sendMessage handler', () => {
    const { result } = renderHook(() => useChatService({ id: 'model-1', name: 'Test Model' } as any));
    
    expect(typeof result.current.sendMessage).toBe('function');
  });

  it('provides onNewThread handler', () => {
    const { result } = renderHook(() => useChatService({ id: 'model-1', name: 'Test Model' } as any));
    
    expect(typeof result.current.onNewThread).toBe('function');
  });

  it('provides onSelectThread handler', () => {
    const { result } = renderHook(() => useChatService({ id: 'model-1', name: 'Test Model' } as any));
    
    expect(typeof result.current.onSelectThread).toBe('function');
  });

  it('provides deleteThread function', () => {
    const { result } = renderHook(() => useChatService({ id: 'model-1', name: 'Test Model' } as any));
    
    expect(typeof result.current.deleteThread).toBe('function');
  });

  it('provides onStopGeneration function', () => {
    const { result } = renderHook(() => useChatService({ id: 'model-1', name: 'Test Model' } as any));
    
    expect(typeof result.current.stopGeneration).toBe('function');
  });

  it('provides planning update properties', () => {
    const { result } = renderHook(() => useChatService({ id: 'model-1', name: 'Test Model' } as any));
    
    expect(result.current.currentPlanningUpdate).toBeNull();
    expect(result.current.currentTaskUpdate).toBeNull();
  });

  it('provides lastTaskUpdatesByThread', () => {
    const { result } = renderHook(() => useChatService({ id: 'model-1', name: 'Test Model' } as any));
    
    expect(result.current.lastTaskUpdatesByThread).toEqual({});
  });

  it('provides currentLogUpdate', () => {
    const { result } = renderHook(() => useChatService({ id: 'model-1', name: 'Test Model' } as any));
    
    expect(result.current.currentLogUpdate).toBeNull();
  });

  it('provides getThreadPreview function', () => {
    const { result } = renderHook(() => useChatService({ id: 'model-1', name: 'Test Model' } as any));
    
    expect(typeof result.current.getThreadPreview).toBe('function');
  });
});
