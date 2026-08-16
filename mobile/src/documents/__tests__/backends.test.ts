/**
 * The two transports behind the one document interface. Scripts do not ride the
 * `resources` envelope (their table has no `revision` column), so the store's
 * concurrency token is opaque — these tests pin that each backend hands out and
 * echoes back the token its own router expects.
 */

import { documentBackend } from '../backends';

const mockResources = {
  read: { query: jest.fn() },
  update: { mutate: jest.fn() },
  list: { query: jest.fn() },
  create: { mutate: jest.fn() },
  delete: { mutate: jest.fn() },
};

const mockScripts = {
  get: { query: jest.fn() },
  update: { mutate: jest.fn() },
  list: { query: jest.fn() },
  create: { mutate: jest.fn() },
  delete: { mutate: jest.fn() },
};

const mockJsScripts = {
  get: { query: jest.fn() },
  update: { mutate: jest.fn() },
  list: { query: jest.fn() },
  create: { mutate: jest.fn() },
  delete: { mutate: jest.fn() },
};

jest.mock('../../trpc/client', () => ({
  createMobileTRPCClient: () => ({
    resources: mockResources,
    scripts: mockScripts,
    jsScripts: mockJsScripts,
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

describe('scripts backend', () => {
  const response = {
    id: 'sc1',
    projectId: 'default',
    name: 'Pilot',
    document: { cast: [], sections: [] },
    createdAt: '2026-07-01T00:00:00Z',
    updatedAt: '2026-07-02T00:00:00Z',
  };

  it('reads updatedAt out as the token', async () => {
    mockScripts.get.query.mockResolvedValue(response);

    const loaded = await documentBackend('script').read('sc1');

    expect(mockScripts.get.query).toHaveBeenCalledWith({ id: 'sc1' });
    expect(loaded).toEqual({
      doc: { cast: [], sections: [] },
      name: 'Pilot',
      token: '2026-07-02T00:00:00Z',
      updatedAt: '2026-07-02T00:00:00Z',
    });
  });

  it('echoes a string token back as baseUpdatedAt', async () => {
    mockScripts.update.mutate.mockResolvedValue(response);

    await documentBackend('script').save('sc1', {
      doc: { cast: [], sections: [] },
      name: 'Pilot',
      token: '2026-07-01T00:00:00Z',
    });

    expect(mockScripts.update.mutate).toHaveBeenCalledWith({
      id: 'sc1',
      name: 'Pilot',
      document: { cast: [], sections: [] },
      baseUpdatedAt: '2026-07-01T00:00:00Z',
    });
  });

  it('omits baseUpdatedAt when the token is not a string', async () => {
    mockScripts.update.mutate.mockResolvedValue(response);

    await documentBackend('script').save('sc1', {
      doc: {},
      name: 'x',
      token: 5,
    });

    expect(mockScripts.update.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ baseUpdatedAt: undefined })
    );
  });

  it('surfaces the line count as the row detail', async () => {
    mockScripts.list.query.mockResolvedValue([
      { id: 'sc1', projectId: 'p', name: 'Pilot', lineCount: 12, updatedAt: 'x' },
      { id: 'sc2', projectId: 'p', name: 'One', lineCount: 1, updatedAt: 'y' },
    ]);

    const rows = await documentBackend('script').list(50);

    expect(rows).toEqual([
      { id: 'sc1', name: 'Pilot', updatedAt: 'x', detail: '12 lines' },
      { id: 'sc2', name: 'One', updatedAt: 'y', detail: '1 line' },
    ]);
  });

  it('creates and deletes through the scripts router', async () => {
    mockScripts.create.mutate.mockResolvedValue(response);
    mockScripts.delete.mutate.mockResolvedValue({ ok: true });

    const created = await documentBackend('script').create('Pilot');
    await documentBackend('script').remove('sc1');

    expect(created).toEqual({
      id: 'sc1',
      name: 'Pilot',
      updatedAt: '2026-07-02T00:00:00Z',
    });
    expect(mockScripts.delete.mutate).toHaveBeenCalledWith({ id: 'sc1' });
    // Never the resources envelope: scripts have no revision column.
    expect(mockResources.create.mutate).not.toHaveBeenCalled();
    expect(mockResources.delete.mutate).not.toHaveBeenCalled();
  });
});

describe('js scripts backend', () => {
  const response = {
    id: 'js1',
    projectId: 'default',
    name: 'Sum numbers',
    document: { schemaVersion: 1, code: 'await output("total", 3);' },
    createdAt: '2026-08-01T00:00:00Z',
    updatedAt: '2026-08-02T00:00:00Z',
  };

  it('reads updatedAt out as the token', async () => {
    mockJsScripts.get.query.mockResolvedValue(response);

    const loaded = await documentBackend('jsscript').read('js1');

    expect(mockJsScripts.get.query).toHaveBeenCalledWith({ id: 'js1' });
    expect(loaded).toEqual({
      doc: response.document,
      name: 'Sum numbers',
      token: '2026-08-02T00:00:00Z',
      updatedAt: '2026-08-02T00:00:00Z',
    });
  });

  it('echoes a string token back as baseUpdatedAt', async () => {
    mockJsScripts.update.mutate.mockResolvedValue(response);

    await documentBackend('jsscript').save('js1', {
      doc: response.document,
      name: 'Sum numbers',
      token: '2026-08-01T00:00:00Z',
    });

    expect(mockJsScripts.update.mutate).toHaveBeenCalledWith({
      id: 'js1',
      name: 'Sum numbers',
      document: response.document,
      baseUpdatedAt: '2026-08-01T00:00:00Z',
    });
  });

  it('omits baseUpdatedAt when the token is not a string', async () => {
    mockJsScripts.update.mutate.mockResolvedValue(response);

    await documentBackend('jsscript').save('js1', {
      doc: {},
      name: 'x',
      token: 5,
    });

    expect(mockJsScripts.update.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ baseUpdatedAt: undefined })
    );
  });

  it('surfaces the declared port counts as the row detail', async () => {
    mockJsScripts.list.query.mockResolvedValue([
      {
        id: 'js1',
        projectId: 'p',
        name: 'Sum numbers',
        description: '',
        inputs: [{ name: 'numbers', type: 'list[int]' }],
        outputs: [{ name: 'total', type: 'int' }],
        updatedAt: 'x',
      },
    ]);

    const rows = await documentBackend('jsscript').list(50);

    expect(rows).toEqual([
      { id: 'js1', name: 'Sum numbers', updatedAt: 'x', detail: '1 in · 1 out' },
    ]);
  });

  it('creates and deletes through the jsScripts router, never the others', async () => {
    mockJsScripts.create.mutate.mockResolvedValue(response);
    mockJsScripts.delete.mutate.mockResolvedValue({ ok: true });

    const created = await documentBackend('jsscript').create('Sum numbers');
    await documentBackend('jsscript').remove('js1');

    expect(created).toEqual({
      id: 'js1',
      name: 'Sum numbers',
      updatedAt: '2026-08-02T00:00:00Z',
    });
    expect(mockJsScripts.delete.mutate).toHaveBeenCalledWith({ id: 'js1' });
    expect(mockScripts.create.mutate).not.toHaveBeenCalled();
    expect(mockResources.create.mutate).not.toHaveBeenCalled();
  });
});

describe('every document kind', () => {
  it('is writable', () => {
    for (const kind of [
      'storyboard',
      'script',
      'jsscript',
      'timeline',
      'sketch',
    ] as const) {
      expect(documentBackend(kind).writable).toBe(true);
    }
  });
});
