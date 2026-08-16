import {
  focusedDocument,
  getDocumentHandler,
  hasDocumentHandler,
  listOpenDocuments,
  registerDocumentHandler,
  resetDocumentHandlers,
  setDocumentTitle,
  setFocusedDocument,
} from '../agentBridge';

interface FakeHandler {
  getSnapshot: () => { id: string; title: string };
}

const handler = (id: string): FakeHandler => ({
  getSnapshot: () => ({ id, title: id }),
});

describe('agentBridge', () => {
  beforeEach(() => {
    resetDocumentHandlers();
  });

  it('resolves a registered handler by kind and id', () => {
    registerDocumentHandler('storyboard', 'sb1', 'Board', handler('sb1'));

    const resolved = getDocumentHandler<FakeHandler>('storyboard', 'sb1');

    expect(resolved.getSnapshot()).toEqual({ id: 'sb1', title: 'sb1' });
    expect(hasDocumentHandler('storyboard', 'sb1')).toBe(true);
  });

  it('keys handlers by kind, so the same id in two kinds does not collide', () => {
    registerDocumentHandler('storyboard', 'shared', 'Board', handler('board'));
    registerDocumentHandler('timeline', 'shared', 'Seq', handler('sequence'));

    expect(
      getDocumentHandler<FakeHandler>('storyboard', 'shared').getSnapshot()
    ).toEqual({ id: 'board', title: 'board' });
    expect(
      getDocumentHandler<FakeHandler>('timeline', 'shared').getSnapshot()
    ).toEqual({ id: 'sequence', title: 'sequence' });
  });

  it('names the open ids of the same kind when a lookup misses', () => {
    registerDocumentHandler('storyboard', 'open-1', 'A', handler('a'));
    registerDocumentHandler('storyboard', 'open-2', 'B', handler('b'));
    // A different kind must not appear in a storyboard error message.
    registerDocumentHandler('timeline', 'seq-9', 'S', handler('s'));

    expect(() => getDocumentHandler('storyboard', 'missing')).toThrow(
      /No storyboard "missing" is open\. Open storyboard ids: open-1, open-2\./
    );
  });

  it('tells the agent to ask the user when nothing of that kind is open', () => {
    expect(() => getDocumentHandler('timeline', 'nope')).toThrow(
      /No timeline documents are currently open\. Ask the user to open one\./
    );
  });

  it('unregisters via the returned function', () => {
    const unregister = registerDocumentHandler(
      'storyboard',
      'sb1',
      'Board',
      handler('sb1')
    );

    unregister();

    expect(hasDocumentHandler('storyboard', 'sb1')).toBe(false);
    expect(listOpenDocuments()).toEqual([]);
  });

  it('clears focus when the focused document unregisters', () => {
    const unregister = registerDocumentHandler(
      'storyboard',
      'sb1',
      'Board',
      handler('sb1')
    );
    setFocusedDocument('storyboard', 'sb1');
    expect(focusedDocument()).toEqual({
      kind: 'storyboard',
      id: 'sb1',
      title: 'Board',
    });

    unregister();

    expect(focusedDocument()).toBeNull();
  });

  it('keeps focus across a re-registration', () => {
    // A screen re-registers whenever the snapshot it closes over changes. That
    // churn must not drop the focus hint, or ui_context reports no focused
    // document while the user is looking straight at one.
    const unregister = registerDocumentHandler(
      'timeline',
      'seq1',
      'Seq',
      handler('v1')
    );
    setFocusedDocument('timeline', 'seq1');

    unregister();
    registerDocumentHandler('timeline', 'seq1', 'Seq', handler('v2'));

    expect(focusedDocument()).toEqual({
      kind: 'timeline',
      id: 'seq1',
      title: 'Seq',
    });
  });

  it('does not clear focus when a different document unregisters', () => {
    registerDocumentHandler('storyboard', 'focused', 'Focused', handler('f'));
    const unregisterOther = registerDocumentHandler(
      'storyboard',
      'other',
      'Other',
      handler('o')
    );
    setFocusedDocument('storyboard', 'focused');

    unregisterOther();

    expect(focusedDocument()?.id).toBe('focused');
  });

  it('lists open documents in registration order', () => {
    registerDocumentHandler('storyboard', 'first', 'First', handler('1'));
    registerDocumentHandler('timeline', 'second', 'Second', handler('2'));

    expect(listOpenDocuments()).toEqual([
      { kind: 'storyboard', id: 'first', title: 'First' },
      { kind: 'timeline', id: 'second', title: 'Second' },
    ]);
  });

  it('retitles without dropping the handler', () => {
    registerDocumentHandler('storyboard', 'sb1', 'Untitled', handler('sb1'));

    setDocumentTitle('storyboard', 'sb1', 'Chase scene');

    expect(listOpenDocuments()[0].title).toBe('Chase scene');
    expect(hasDocumentHandler('storyboard', 'sb1')).toBe(true);
  });

  it('re-registering the same document replaces its handler', () => {
    registerDocumentHandler('storyboard', 'sb1', 'Board', handler('old'));
    registerDocumentHandler('storyboard', 'sb1', 'Board', handler('new'));

    expect(
      getDocumentHandler<FakeHandler>('storyboard', 'sb1').getSnapshot()
    ).toEqual({ id: 'new', title: 'new' });
    expect(listOpenDocuments()).toHaveLength(1);
  });

  it('clears focus when asked with a null kind', () => {
    registerDocumentHandler('storyboard', 'sb1', 'Board', handler('sb1'));
    setFocusedDocument('storyboard', 'sb1');

    setFocusedDocument(null);

    expect(focusedDocument()).toBeNull();
  });
});
