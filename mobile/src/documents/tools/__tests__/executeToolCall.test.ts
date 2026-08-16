import { executeToolCall, isToolCallMessage } from '../executeToolCall';
import { MobileToolRegistry } from '../registry';

describe('isToolCallMessage', () => {
  it('accepts a well-formed tool call', () => {
    expect(
      isToolCallMessage({
        type: 'tool_call',
        tool_call_id: 'call-1',
        name: 'ui_storyboard_get_state',
        args: {},
        thread_id: 'thread-1',
      })
    ).toBe(true);
  });

  it.each([
    ['a chunk', { type: 'chunk', content: 'hi' }],
    ['a missing id', { type: 'tool_call', name: 'ui_x' }],
    ['a missing name', { type: 'tool_call', tool_call_id: 'call-1' }],
    ['null', null],
    ['a string', 'tool_call'],
  ])('rejects %s', (_label, value) => {
    expect(isToolCallMessage(value)).toBe(false);
  });
});

describe('executeToolCall', () => {
  const sender = { send: jest.fn() };

  beforeEach(() => {
    MobileToolRegistry.reset();
    sender.send.mockReset();
  });

  const call = (name: string, args: Record<string, unknown> = {}) => ({
    type: 'tool_call' as const,
    tool_call_id: 'call-1',
    name,
    args,
    thread_id: 'thread-1',
  });

  it('runs the tool and returns its result', async () => {
    MobileToolRegistry.register({
      name: 'ui_test_ok',
      description: 'test',
      parameters: { type: 'object', properties: {} },
      execute: async () => ({ ok: true, shots: 2 }),
    });

    await executeToolCall(call('ui_test_ok'), sender);

    const payload = sender.send.mock.calls[0][0];
    expect(payload).toMatchObject({
      type: 'tool_result',
      tool_call_id: 'call-1',
      thread_id: 'thread-1',
      ok: true,
      result: { ok: true, shots: 2 },
    });
    expect(payload.elapsed_ms).toEqual(expect.any(Number));
  });

  it('passes the args through to the tool', async () => {
    const execute = jest.fn().mockResolvedValue({ ok: true });
    MobileToolRegistry.register({
      name: 'ui_test_args',
      description: 'test',
      parameters: { type: 'object', properties: {} },
      execute,
    });

    await executeToolCall(call('ui_test_args', { storyboard_id: 'sb1' }), sender);

    expect(execute).toHaveBeenCalledWith(
      { storyboard_id: 'sb1' },
      expect.objectContaining({ abortSignal: expect.anything() })
    );
  });

  it('still answers an unknown tool, so the agent is not left waiting', async () => {
    await executeToolCall(call('ui_does_not_exist'), sender);

    expect(sender.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'tool_result',
        tool_call_id: 'call-1',
        ok: false,
        error: 'Unsupported tool: ui_does_not_exist',
      })
    );
  });

  it('relays a thrown message verbatim, so a bad id can be corrected', async () => {
    MobileToolRegistry.register({
      name: 'ui_test_throws',
      description: 'test',
      parameters: { type: 'object', properties: {} },
      execute: async () => {
        throw new Error('No storyboard "sb9" is open. Open storyboard ids: sb1.');
      },
    });

    await executeToolCall(call('ui_test_throws'), sender);

    expect(sender.send).toHaveBeenCalledWith(
      expect.objectContaining({
        ok: false,
        error: 'No storyboard "sb9" is open. Open storyboard ids: sb1.',
        result: {
          error: 'No storyboard "sb9" is open. Open storyboard ids: sb1.',
        },
      })
    );
  });

  it('does not throw when the socket send fails', async () => {
    MobileToolRegistry.register({
      name: 'ui_test_ok',
      description: 'test',
      parameters: { type: 'object', properties: {} },
      execute: async () => ({ ok: true }),
    });
    const failing = {
      send: jest.fn(() => {
        throw new Error('socket closed');
      }),
    };

    await expect(
      executeToolCall(call('ui_test_ok'), failing)
    ).resolves.toBeUndefined();
  });

  it('treats missing args as an empty object', async () => {
    const execute = jest.fn().mockResolvedValue({ ok: true });
    MobileToolRegistry.register({
      name: 'ui_test_noargs',
      description: 'test',
      parameters: { type: 'object', properties: {} },
      execute,
    });

    await executeToolCall(
      {
        type: 'tool_call',
        tool_call_id: 'call-1',
        name: 'ui_test_noargs',
        thread_id: 'thread-1',
      },
      sender
    );

    expect(execute).toHaveBeenCalledWith({}, expect.anything());
  });
});

describe('MobileToolRegistry', () => {
  beforeEach(() => {
    MobileToolRegistry.reset();
  });

  it('exposes registered tools in the manifest the server reads', () => {
    const parameters = {
      type: 'object' as const,
      properties: { storyboard_id: { type: 'string' } },
      required: ['storyboard_id'],
    };
    MobileToolRegistry.register({
      name: 'ui_manifest_check',
      description: 'Read the board.',
      parameters,
      execute: async () => ({ ok: true }),
    });

    expect(MobileToolRegistry.getManifest()).toEqual([
      {
        name: 'ui_manifest_check',
        description: 'Read the board.',
        parameters,
      },
    ]);
  });

  it('unregisters via the returned function', () => {
    const unregister = MobileToolRegistry.register({
      name: 'ui_temp',
      description: 'test',
      parameters: { type: 'object', properties: {} },
      execute: async () => ({ ok: true }),
    });

    unregister();

    expect(MobileToolRegistry.has('ui_temp')).toBe(false);
  });

  it('aborts in-flight calls', async () => {
    const observed: { signal?: AbortSignal } = {};
    MobileToolRegistry.register({
      name: 'ui_slow',
      description: 'test',
      parameters: { type: 'object', properties: {} },
      execute: async (_args, ctx) => {
        observed.signal = ctx.abortSignal;
        MobileToolRegistry.abortAll();
        return { ok: true };
      },
    });

    await MobileToolRegistry.call('ui_slow', {}, 'call-1');

    expect(observed.signal?.aborted).toBe(true);
  });

  it('throws for an unknown tool', async () => {
    await expect(MobileToolRegistry.call('ui_nope', {}, 'c1')).rejects.toThrow(
      'Unknown tool: ui_nope'
    );
  });
});
