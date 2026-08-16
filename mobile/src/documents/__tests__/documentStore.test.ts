import { documentStore, resetDocumentStores } from '../documentStore';

const mockRead = jest.fn();
const mockUpdate = jest.fn();

jest.mock('../../trpc/client', () => ({
  createMobileTRPCClient: () => ({
    resources: {
      read: { query: mockRead },
      update: { mutate: mockUpdate },
    },
  }),
}));

interface Doc {
  shots: string[];
}

const detail = (overrides: Record<string, unknown> = {}) => ({
  ref: { kind: 'storyboard', id: 'sb1', revision: 3 },
  name: 'Chase scene',
  projectId: 'default',
  contentType: null,
  updatedAt: '2026-07-01T00:00:00Z',
  document: { shots: ['a'] },
  ...overrides,
});

describe('documentStore', () => {
  beforeEach(() => {
    resetDocumentStores();
    mockRead.mockReset();
    mockUpdate.mockReset();
  });

  it('returns the same store for the same document', () => {
    expect(documentStore('storyboard', 'sb1')).toBe(
      documentStore('storyboard', 'sb1')
    );
  });

  it('returns distinct stores per id and per kind', () => {
    expect(documentStore('storyboard', 'sb1')).not.toBe(
      documentStore('storyboard', 'sb2')
    );
    expect(documentStore('storyboard', 'shared')).not.toBe(
      documentStore('timeline', 'shared')
    );
  });

  it('loads the document body, name and concurrency token', async () => {
    mockRead.mockResolvedValue(detail());
    const store = documentStore<Doc>('storyboard', 'sb1');

    await store.getState().load();

    expect(mockRead).toHaveBeenCalledWith({ ref: { kind: 'storyboard', id: 'sb1' } });
    expect(store.getState()).toMatchObject({
      doc: { shots: ['a'] },
      name: 'Chase scene',
      token: 3,
      updatedAt: '2026-07-01T00:00:00Z',
      dirty: false,
      status: 'idle',
    });
  });

  it('surfaces a load failure without wiping the status', async () => {
    mockRead.mockRejectedValue(new Error('offline'));
    const store = documentStore<Doc>('storyboard', 'sb1');

    await store.getState().load();

    expect(store.getState().status).toBe('error');
    expect(store.getState().error).toBe('offline');
  });

  it('marks dirty on edit and rename', async () => {
    mockRead.mockResolvedValue(detail());
    const store = documentStore<Doc>('storyboard', 'sb1');
    await store.getState().load();

    store.getState().edit((doc) => ({ shots: [...doc.shots, 'b'] }));

    expect(store.getState().doc).toEqual({ shots: ['a', 'b'] });
    expect(store.getState().dirty).toBe(true);

    store.getState().rename('New name');
    expect(store.getState().name).toBe('New name');
  });

  it('ignores an edit before the document has loaded', () => {
    const store = documentStore<Doc>('storyboard', 'sb1');

    store.getState().edit(() => ({ shots: ['x'] }));

    expect(store.getState().doc).toBeNull();
    expect(store.getState().dirty).toBe(false);
  });

  it('saves the body with the revision it read, then adopts the new one', async () => {
    mockRead.mockResolvedValue(detail());
    mockUpdate.mockResolvedValue(
      detail({
        ref: { kind: 'storyboard', id: 'sb1', revision: 4 },
        updatedAt: '2026-07-02T00:00:00Z',
      })
    );
    const store = documentStore<Doc>('storyboard', 'sb1');
    await store.getState().load();
    store.getState().edit(() => ({ shots: ['a', 'b'] }));

    await store.getState().save();

    expect(mockUpdate).toHaveBeenCalledWith({
      ref: { kind: 'storyboard', id: 'sb1', revision: 3 },
      name: 'Chase scene',
      document: { shots: ['a', 'b'] },
    });
    expect(store.getState()).toMatchObject({
      token: 4,
      updatedAt: '2026-07-02T00:00:00Z',
      dirty: false,
      status: 'idle',
    });
  });

  it('does not write when there is nothing to save', async () => {
    mockRead.mockResolvedValue(detail());
    const store = documentStore<Doc>('storyboard', 'sb1');
    await store.getState().load();

    await store.getState().save();

    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('reports a stale write as a conflict, not a generic error', async () => {
    mockRead.mockResolvedValue(detail());
    mockUpdate.mockRejectedValue(
      new Error(
        'storyboard resource was modified since it was read (optimistic concurrency conflict)'
      )
    );
    const store = documentStore<Doc>('storyboard', 'sb1');
    await store.getState().load();
    store.getState().edit(() => ({ shots: ['b'] }));

    await store.getState().save();

    expect(store.getState().status).toBe('conflict');
    // The local edit survives, so the user can retry after reloading.
    expect(store.getState().dirty).toBe(true);
  });

  it('reports other save failures as errors', async () => {
    mockRead.mockResolvedValue(detail());
    mockUpdate.mockRejectedValue(new Error('network down'));
    const store = documentStore<Doc>('storyboard', 'sb1');
    await store.getState().load();
    store.getState().edit(() => ({ shots: ['b'] }));

    await store.getState().save();

    expect(store.getState().status).toBe('error');
    expect(store.getState().error).toBe('network down');
  });

  it('keeps the document dirty when an edit lands mid-save', async () => {
    mockRead.mockResolvedValue(detail());
    const store = documentStore<Doc>('storyboard', 'sb1');
    await store.getState().load();
    store.getState().edit(() => ({ shots: ['a', 'b'] }));

    // The agent adds a shot while the user's save is still on the wire.
    mockUpdate.mockImplementation(async () => {
      store.getState().edit((doc) => ({ shots: [...doc.shots, 'c'] }));
      return detail({
        ref: { kind: 'storyboard', id: 'sb1', revision: 4 },
        document: { shots: ['a', 'b'] },
      });
    });

    await store.getState().save();

    // The third shot exists only locally, so the document must stay dirty —
    // marking it clean would disable Save and lose the edit on reload.
    expect(store.getState().doc).toEqual({ shots: ['a', 'b', 'c'] });
    expect(store.getState().dirty).toBe(true);
    // The new token is adopted regardless, so the follow-up save is checked
    // against the row we just wrote.
    expect(store.getState().token).toBe(4);
  });

  it('persists the mid-save edit on the next save, with the new revision', async () => {
    mockRead.mockResolvedValue(detail());
    const store = documentStore<Doc>('storyboard', 'sb1');
    await store.getState().load();
    store.getState().edit(() => ({ shots: ['a', 'b'] }));

    mockUpdate.mockImplementationOnce(async () => {
      store.getState().edit((doc) => ({ shots: [...doc.shots, 'c'] }));
      return detail({ ref: { kind: 'storyboard', id: 'sb1', revision: 4 } });
    });
    await store.getState().save();

    mockUpdate.mockResolvedValueOnce(
      detail({ ref: { kind: 'storyboard', id: 'sb1', revision: 5 } })
    );
    await store.getState().save();

    expect(mockUpdate).toHaveBeenLastCalledWith({
      ref: { kind: 'storyboard', id: 'sb1', revision: 4 },
      name: 'Chase scene',
      document: { shots: ['a', 'b', 'c'] },
    });
    expect(store.getState().dirty).toBe(false);
  });

  it('serializes overlapping saves instead of racing them into a conflict', async () => {
    mockRead.mockResolvedValue(detail());
    const store = documentStore<Doc>('storyboard', 'sb1');
    await store.getState().load();
    store.getState().edit(() => ({ shots: ['a', 'b'] }));

    const gate = {} satisfies { release?: () => void };
    mockUpdate.mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => {
        gate.release = resolve;
      });
      return detail({ ref: { kind: 'storyboard', id: 'sb1', revision: 4 } });
    });

    // The user's Save and the agent's save overlap.
    const first = store.getState().save();
    const second = store.getState().save();
    await Promise.resolve();
    gate.release?.();
    await Promise.all([first, second]);

    // The second save found nothing left to write rather than sending a stale
    // revision the server would reject.
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(store.getState().status).toBe('idle');
    expect(store.getState().dirty).toBe(false);
  });

  it('reverts by re-reading, discarding local edits', async () => {
    mockRead.mockResolvedValue(detail());
    const store = documentStore<Doc>('storyboard', 'sb1');
    await store.getState().load();
    store.getState().edit(() => ({ shots: ['local'] }));

    await store.getState().revert();

    expect(store.getState().doc).toEqual({ shots: ['a'] });
    expect(store.getState().dirty).toBe(false);
    expect(store.getState().status).toBe('idle');
  });
});
