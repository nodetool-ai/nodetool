import useChatStore from '../../stores/ChatStore';

const initialState = useChatStore.getState();

// Helper to reset store state between tests
const resetStore = () => {
  useChatStore.setState(initialState, true);
};

describe('ChatStore', () => {
  afterEach(() => {
    resetStore();
  });

  test('appendMessage adds to messages', () => {
    const message = {
      type: 'message',
      role: 'user',
      name: 'User',
      content: 'hello',
    } as any;

    useChatStore.getState().appendMessage(message);

    expect(useChatStore.getState().messages).toHaveLength(1);
    expect(useChatStore.getState().messages[0]).toMatchObject(message);
  });

  test('resetMessages clears messages', () => {
    const message = {
      type: 'message',
      role: 'user',
      name: 'User',
      content: 'hello',
    } as any;

    useChatStore.getState().appendMessage(message);
    expect(useChatStore.getState().messages).toHaveLength(1);

    useChatStore.getState().resetMessages();
    expect(useChatStore.getState().messages).toHaveLength(0);
  });

  test('setDroppedFiles updates droppedFiles', () => {
    const file = new File(['data'], 'test.txt', { type: 'text/plain' });
    useChatStore.getState().setDroppedFiles([file]);
    expect(useChatStore.getState().droppedFiles).toEqual([file]);
  });

  test('setSelectedTools updates selectedTools', () => {
    useChatStore.getState().setSelectedTools(['tool1', 'tool2']);
    expect(useChatStore.getState().selectedTools).toEqual(['tool1', 'tool2']);
  });
});
