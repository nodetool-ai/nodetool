import useChatStore from '../../stores/ChatStore';

describe('ChatStore', () => {
  const initialState = useChatStore.getState();
  beforeEach(() => {
    useChatStore.setState(initialState, true);
  });

  test('appendMessage adds a message', () => {
    const message = { role: 'user', type: 'message', content: 'hello', workflow_id: '1', name: 'user' } as any;
    useChatStore.getState().appendMessage(message);
    expect(useChatStore.getState().messages).toContain(message);
  });

  test('resetMessages clears messages', () => {
    const message = { role: 'user', type: 'message', content: 'hello', workflow_id: '1', name: 'user' } as any;
    useChatStore.getState().appendMessage(message);
    expect(useChatStore.getState().messages.length).toBe(1);
    useChatStore.getState().resetMessages();
    expect(useChatStore.getState().messages.length).toBe(0);
  });

  test('setDroppedFiles updates droppedFiles', () => {
    const file = new File(['data'], 'test.txt');
    useChatStore.getState().setDroppedFiles([file]);
    expect(useChatStore.getState().droppedFiles).toEqual([file]);
  });

  test('setSelectedTools updates selectedTools', () => {
    useChatStore.getState().setSelectedTools(['t1', 't2']);
    expect(useChatStore.getState().selectedTools).toEqual(['t1', 't2']);
  });
});
