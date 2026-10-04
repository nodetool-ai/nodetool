/**
 * The `resources` transport behind the document interface. The store's
 * concurrency token is opaque — these tests pin that the backend hands out and
 * echoes back the revision its router expects.
 */

import { documentBackend } from '../backends';

const mockResources = {
  read: { query: jest.fn() },
  update: { mutate: jest.fn() },
  list: { query: jest.fn() },
  create: { mutate: jest.fn() },
  delete: { mutate: jest.fn() },
};


jest.mock('../../trpc/client', () => ({
  createMobileTRPCClient: () => ({
    resources: mockResources,
  }),
}));

beforeEach(() => {
  jest.clearAllMocks();
});

describe('resources backend', () => {
  const detail = {
    ref: { kind: 'storyboard', id: 'sb1', revision: 7 },
    name: 'Chase scene',
    projectId: 'default',
    contentType: null,
    updatedAt: '2026-07-01T00:00:00Z',
    document: { shots: [] },
  };

  it('reads the revision out as the token', async () => {
    mockResources.read.query.mockResolvedValue(detail);

    const loaded = await documentBackend('storyboard').read('sb1');

    expect(mockResources.read.query).toHaveBeenCalledWith({
      ref: { kind: 'storyboard', id: 'sb1' },
    });
    expect(loaded).toEqual({
      doc: { shots: [] },
      name: 'Chase scene',
      token: 7,
      updatedAt: '2026-07-01T00:00:00Z',
    });
  });

  it('echoes a numeric token back as the ref revision', async () => {
    mockResources.update.mutate.mockResolvedValue(detail);

    await documentBackend('storyboard').save('sb1', {
      doc: { shots: [] },
      name: 'Chase scene',
      token: 6,
    });

    expect(mockResources.update.mutate).toHaveBeenCalledWith({
      ref: { kind: 'storyboard', id: 'sb1', revision: 6 },
      name: 'Chase scene',
      document: { shots: [] },
    });
  });

  it('sends no revision when the token is not a number', async () => {
    mockResources.update.mutate.mockResolvedValue(detail);

    await documentBackend('storyboard').save('sb1', {
      doc: {},
      name: 'x',
      token: undefined,
    });

    expect(mockResources.update.mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        ref: { kind: 'storyboard', id: 'sb1', revision: undefined },
      })
    );
  });

  it('lists rows without a kind-specific detail line', async () => {
    mockResources.list.query.mockResolvedValue([
      { ...detail.ref, ref: detail.ref, name: 'A', updatedAt: '2026-01-01' },
    ]);

    const rows = await documentBackend('timeline').list(50);

    expect(mockResources.list.query).toHaveBeenCalledWith({
      kind: 'timeline',
      limit: 50,
    });
    expect(rows).toEqual([
      { id: 'sb1', name: 'A', updatedAt: '2026-01-01' },
    ]);
  });

  it('renames without a revision, since a list row carries none to echo', async () => {
    mockResources.update.mutate.mockResolvedValue(detail);

    await documentBackend('storyboard').rename('sb1', 'New name');

    expect(mockResources.update.mutate).toHaveBeenCalledWith({
      ref: { kind: 'storyboard', id: 'sb1' },
      name: 'New name',
    });
  });

  it('deletes by ref', async () => {
    mockResources.delete.mutate.mockResolvedValue({ ok: true });

    await documentBackend('sketch').remove('sk1');

    expect(mockResources.delete.mutate).toHaveBeenCalledWith({
      ref: { kind: 'sketch', id: 'sk1' },
    });
  });
});

describe('every document kind', () => {
  it('is writable', () => {
    for (const kind of [
      'storyboard',
      'timeline',
      'sketch',
    ] as const) {
      expect(documentBackend(kind).writable).toBe(true);
    }
  });

  it('forwards an explicit project scope through every list and creation path', async () => {
    const projectId = 'project-a';
    mockResources.list.query.mockResolvedValue([]);
    mockResources.create.mutate.mockResolvedValue({
      ref: { id: 'sb1' },
      name: 'Board',
      updatedAt: '2026-01-01T00:00:00Z',
    });

    await documentBackend('storyboard', projectId).list(10);
    await documentBackend('storyboard', projectId).create('Board');
    await documentBackend('timeline', projectId).list(10);
    await documentBackend('timeline', projectId).create('Timeline');
    await documentBackend('sketch', projectId).list(10);
    await documentBackend('sketch', projectId).create('Sketch');

    expect(mockResources.list.query).toHaveBeenCalledWith({
      kind: 'storyboard',
      limit: 10,
      projectId,
    });
    expect(mockResources.create.mutate).toHaveBeenCalledWith({
      kind: 'storyboard',
      name: 'Board',
      projectId,
    });
    expect(mockResources.list.query).toHaveBeenCalledWith({
      kind: 'timeline',
      limit: 10,
      projectId,
    });
    expect(mockResources.create.mutate).toHaveBeenCalledWith({
      kind: 'timeline',
      name: 'Timeline',
      projectId,
    });
    expect(mockResources.list.query).toHaveBeenCalledWith({
      kind: 'sketch',
      limit: 10,
      projectId,
    });
    expect(mockResources.create.mutate).toHaveBeenCalledWith({
      kind: 'sketch',
      name: 'Sketch',
      projectId,
    });
  });
});
