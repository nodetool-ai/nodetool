/**
 * Tests for the ui_jsscript_* tools.
 *
 * The tools are thin: they resolve a handler off the agent bridge and forward.
 * So these tests check the forwarding contract — argument names, shapes, and the
 * payload envelope — plus the failure the agent will actually hit most often,
 * naming a script that is not open.
 */

import { MobileToolRegistry } from '../registry';
import '../jsScriptTools';
import {
  registerDocumentHandler,
  resetDocumentHandlers,
} from '../../agentBridge';
import {
  emptyJsScriptDocument,
  type JsScriptAgentHandler,
  type JsScriptMetaInput,
  type JsScriptPort,
  type JsScriptRunOutcome,
  type JsScriptSnapshot,
  type JsScriptTestCase,
} from '../../jsScriptTypes';

const snapshot = (): JsScriptSnapshot => ({
  scriptId: 'js-1',
  name: 'Sum numbers',
  document: {
    ...emptyJsScriptDocument(),
    code: 'await output("total", 3);',
    inputs: [{ name: 'numbers', type: 'list[int]' }],
    outputs: [{ name: 'total', type: 'int' }],
  },
  issues: [],
  lastRun: null,
  lastTest: null,
});

const runOutcome = (ok: boolean): JsScriptRunOutcome => {
  const outcome: JsScriptRunOutcome = {
    ok,
    outputs: { total: 3 },
    logs: [],
    duration_ms: 7,
  };
  if (!ok) {
    outcome.error = 'boom';
  }
  return outcome;
};

type MockHandler = jest.Mocked<JsScriptAgentHandler>;

const makeHandler = (): MockHandler => ({
  getSnapshot: jest.fn(() => snapshot()),
  setCode: jest.fn((_code: string) => snapshot()),
  setPorts: jest.fn(
    (_ports: { inputs?: JsScriptPort[]; outputs?: JsScriptPort[] }) =>
      snapshot()
  ),
  setMeta: jest.fn((_meta: JsScriptMetaInput) => snapshot()),
  setTests: jest.fn((_tests: JsScriptTestCase[]) => snapshot()),
  save: jest.fn(
    async (): Promise<{ ok: true; updatedAt: string | null }> => ({
      ok: true,
      updatedAt: '2026-08-01T00:00:00Z',
    })
  ),
  run: jest.fn(
    async (..._args: Parameters<JsScriptAgentHandler['run']>) =>
      runOutcome(true)
  ),
  test: jest.fn(async () => ({ passed: 1, failed: 0, cases: [] })),
});

const call = (name: string, args: Record<string, unknown>): Promise<unknown> =>
  MobileToolRegistry.call(name, args, `${name}-call`);

describe('JS script tools', () => {
  let handler: MockHandler;
  let unregister: () => void;

  beforeEach(() => {
    resetDocumentHandlers();
    handler = makeHandler();
    unregister = registerDocumentHandler(
      'jsscript',
      'js-1',
      'Sum numbers',
      handler
    );
  });

  afterEach(() => {
    unregister();
  });

  it('registers every JS script tool in the manifest', () => {
    expect(MobileToolRegistry.names()).toEqual(
      expect.arrayContaining([
        'ui_jsscript_get_state',
        'ui_jsscript_set_code',
        'ui_jsscript_set_ports',
        'ui_jsscript_set_meta',
        'ui_jsscript_set_tests',
        'ui_jsscript_save',
        'ui_jsscript_run',
        'ui_jsscript_test',
      ])
    );
  });

  it('registers no package tool — a phone cannot install a sandbox pack', () => {
    const names = MobileToolRegistry.names().filter((name) =>
      name.startsWith('ui_jsscript_')
    );
    expect(names).toHaveLength(8);
    for (const name of names) {
      expect(name).not.toMatch(/package/);
    }
  });

  it('every JS script tool requires script_id and documents itself', () => {
    const entries = MobileToolRegistry.getManifest().filter((entry) =>
      entry.name.startsWith('ui_jsscript_')
    );
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(entry.parameters.required).toContain('script_id');
      expect(entry.description.length).toBeGreaterThan(40);
    }
  });

  it('reads the whole document back on get_state', async () => {
    await expect(
      call('ui_jsscript_get_state', { script_id: 'js-1' })
    ).resolves.toEqual({ ok: true, ...snapshot() });
  });

  it('forwards the body and reports its size', async () => {
    const code = 'await output("total", 4);';

    await expect(
      call('ui_jsscript_set_code', { script_id: 'js-1', code })
    ).resolves.toEqual({ ok: true, chars: code.length, issues: [] });
    expect(handler.setCode).toHaveBeenCalledWith(code);
  });

  it('forwards only the port side the agent named', async () => {
    await call('ui_jsscript_set_ports', {
      script_id: 'js-1',
      outputs: [{ name: 'total', type: 'int' }],
    });

    expect(handler.setPorts).toHaveBeenCalledWith({
      inputs: undefined,
      outputs: [{ name: 'total', type: 'int' }],
    });
  });

  it('forwards metadata with the omitted fields left undefined', async () => {
    await call('ui_jsscript_set_meta', {
      script_id: 'js-1',
      description: 'Adds the numbers.',
    });

    expect(handler.setMeta).toHaveBeenCalledWith({
      name: undefined,
      description: 'Adds the numbers.',
      secrets: undefined,
      timeoutSeconds: undefined,
    });
  });

  it('replaces the saved cases wholesale', async () => {
    const tests = [{ name: 'sums', inputs: { numbers: [1, 2] } }];

    await call('ui_jsscript_set_tests', { script_id: 'js-1', tests });

    expect(handler.setTests).toHaveBeenCalledWith(tests);
  });

  it('runs with an empty bag when the agent names no inputs', async () => {
    await call('ui_jsscript_run', { script_id: 'js-1' });

    expect(handler.run).toHaveBeenCalledWith({}, undefined);
  });

  it('passes staged items through as input streams', async () => {
    await call('ui_jsscript_run', {
      script_id: 'js-1',
      inputs: { numbers: [] },
      input_streams: { numbers: [1, 2] },
    });

    expect(handler.run).toHaveBeenCalledWith({ numbers: [] }, { numbers: [1, 2] });
  });

  it('reports a failed run as a failed tool call', async () => {
    handler.run.mockResolvedValueOnce(runOutcome(false));

    await expect(
      call('ui_jsscript_run', { script_id: 'js-1' })
    ).resolves.toEqual({ ok: false, run: runOutcome(false) });
  });

  it('returns the grade report from test', async () => {
    await expect(
      call('ui_jsscript_test', { script_id: 'js-1' })
    ).resolves.toEqual({ ok: true, passed: 1, failed: 0, cases: [] });
  });

  it('names the open ids when the agent addresses a script that is not open', async () => {
    await expect(
      call('ui_jsscript_set_code', { script_id: 'js-9', code: '' })
    ).rejects.toThrow(/No jsscript "js-9" is open.*js-1/s);
  });
});
