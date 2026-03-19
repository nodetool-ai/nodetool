import { act, renderHook } from '@testing-library/react';
import { useVibeCodingStore } from '../VibeCodingStore';

describe('VibeCodingStore', () => {
  beforeEach(() => {
    useVibeCodingStore.setState({ sessions: {} });
  });

  it('getSession returns default for unknown workflowId', () => {
    const { result } = renderHook(() => useVibeCodingStore());
    const session = result.current.getSession('unknown');
    expect(session.workflowId).toBe('unknown');
    expect(session.port).toBeNull();
    expect(session.serverStatus).toBe('stopped');
    expect(session.messages).toEqual([]);
    expect(session.chatStatus).toBe('idle');
    expect(session.isPublished).toBe(false);
    expect(session.workspacePath).toBe('');
  });

  it('initSession creates a session with provided path', () => {
    const { result } = renderHook(() => useVibeCodingStore());
    act(() => { result.current.initSession('wf-1', '/path/to/workspace'); });
    const session = result.current.getSession('wf-1');
    expect(session.workspacePath).toBe('/path/to/workspace');
    expect(session.serverStatus).toBe('stopped');
  });

  it('setServerStatus updates status and port', () => {
    const { result } = renderHook(() => useVibeCodingStore());
    act(() => {
      result.current.initSession('wf-1', '/path');
      result.current.setServerStatus('wf-1', 'running', 3001);
    });
    expect(result.current.getSession('wf-1').serverStatus).toBe('running');
    expect(result.current.getSession('wf-1').port).toBe(3001);
  });

  it('appendServerLog keeps last 100 lines', () => {
    const { result } = renderHook(() => useVibeCodingStore());
    act(() => {
      result.current.initSession('wf-1', '/path');
      for (let i = 0; i < 105; i++) { result.current.appendServerLog('wf-1', `line ${i}`); }
    });
    const logs = result.current.getSession('wf-1').serverLogs;
    expect(logs.length).toBe(100);
    expect(logs[0]).toBe('line 5');
    expect(logs[99]).toBe('line 104');
  });

  it('addMessage appends message', () => {
    const { result } = renderHook(() => useVibeCodingStore());
    act(() => {
      result.current.initSession('wf-1', '/path');
      result.current.addMessage('wf-1', {
        type: 'message', role: 'user', name: '',
        content: [{ type: 'text', text: 'hello' }],
        created_at: new Date().toISOString(),
      });
    });
    expect(result.current.getSession('wf-1').messages).toHaveLength(1);
  });

  it('updateLastMessage updates last message text', () => {
    const { result } = renderHook(() => useVibeCodingStore());
    act(() => {
      result.current.initSession('wf-1', '/path');
      result.current.addMessage('wf-1', {
        type: 'message', role: 'assistant', name: '',
        content: [{ type: 'text', text: '' }],
        created_at: new Date().toISOString(),
      });
      result.current.updateLastMessage('wf-1', 'updated content');
    });
    const [msg] = result.current.getSession('wf-1').messages;
    expect((msg.content as Array<{type: string; text: string}>)[0].text).toBe('updated content');
  });

  it('setChatStatus updates chatStatus', () => {
    const { result } = renderHook(() => useVibeCodingStore());
    act(() => {
      result.current.initSession('wf-1', '/path');
      result.current.setChatStatus('wf-1', 'streaming');
    });
    expect(result.current.getSession('wf-1').chatStatus).toBe('streaming');
  });

  it('setIsPublished updates isPublished', () => {
    const { result } = renderHook(() => useVibeCodingStore());
    act(() => {
      result.current.initSession('wf-1', '/path');
      result.current.setIsPublished('wf-1', true);
    });
    expect(result.current.getSession('wf-1').isPublished).toBe(true);
  });

  it('clearSession removes the session', () => {
    const { result } = renderHook(() => useVibeCodingStore());
    act(() => {
      result.current.initSession('wf-1', '/path');
      result.current.clearSession('wf-1');
    });
    expect(result.current.getSession('wf-1').workspacePath).toBe('');
  });
});
