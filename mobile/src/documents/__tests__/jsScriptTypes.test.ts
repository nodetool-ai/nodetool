/**
 * The two things `jsScriptTypes` decides on its own: which documents the editor
 * calls broken, and how a saved case is graded. Both mirror server-side rules —
 * `validateJsScriptDocument` in the protocol package and `test_code`'s compare —
 * so these tests pin the mobile copies against the same expectations.
 */

import {
  emptyJsScriptDocument,
  gradeJsScriptCase,
  gradeJsScriptTests,
  normalizeJsScriptDocument,
  streamMismatches,
  summarizeJsScriptTests,
  validateJsScriptDocument,
  type JsScriptDocument,
  type JsScriptRunOutcome,
} from '../jsScriptTypes';

const doc = (overrides: Partial<JsScriptDocument> = {}): JsScriptDocument => ({
  ...emptyJsScriptDocument(),
  code: 'await output("total", 1);',
  inputs: [{ name: 'numbers', type: 'list[int]' }],
  outputs: [{ name: 'total', type: 'int' }],
  tests: [{ name: 'sums', inputs: { numbers: [1, 2] }, expect: { total: 3 } }],
  ...overrides,
});

const outcome = (
  overrides: Partial<JsScriptRunOutcome> = {}
): JsScriptRunOutcome => ({
  ok: true,
  outputs: { total: 3 },
  logs: [],
  duration_ms: 4,
  ...overrides,
});

const codes = (document: JsScriptDocument): string[] =>
  validateJsScriptDocument(document).map((issue) => issue.code);

describe('validateJsScriptDocument', () => {
  it('passes a complete document', () => {
    expect(validateJsScriptDocument(doc())).toEqual([]);
  });

  it('rejects a port name the body could not read as inputs.<name>', () => {
    expect(codes(doc({ inputs: [{ name: 'my input', type: 'str' }] }))).toContain(
      'js_script_port_name'
    );
  });

  it('rejects duplicate ports on either side', () => {
    expect(
      codes(
        doc({
          outputs: [
            { name: 'total', type: 'int' },
            { name: 'total', type: 'int' },
          ],
        })
      )
    ).toContain('js_script_duplicate_port');
  });

  it('rejects an empty secret name', () => {
    expect(codes(doc({ secrets: ['OPENAI_API_KEY', '  '] }))).toContain(
      'js_script_secret_name'
    );
  });

  it('rejects a timeout outside the sandbox ceiling', () => {
    expect(codes(doc({ timeoutSeconds: 0 }))).toContain('js_script_timeout');
    expect(codes(doc({ timeoutSeconds: 121 }))).toContain('js_script_timeout');
    expect(codes(doc({ timeoutSeconds: 120 }))).not.toContain('js_script_timeout');
  });

  it('rejects a case naming a handle the script does not declare', () => {
    const issues = codes(
      doc({
        tests: [
          {
            name: 'wrong handles',
            inputs: { nope: 1 },
            inputStreams: { alsoNope: [1] },
            expect: { missing: 2 },
          },
        ],
      })
    );
    expect(issues).toEqual(
      expect.arrayContaining([
        'js_script_test_input',
        'js_script_test_input',
        'js_script_test_output',
      ])
    );
  });

  it('rejects two cases with one name', () => {
    expect(
      codes(
        doc({
          tests: [
            { name: 'sums', inputs: {} },
            { name: 'sums', inputs: {} },
          ],
        })
      )
    ).toContain('js_script_duplicate_test');
  });

  it('warns — rather than errors — about an empty body and no cases', () => {
    const issues = validateJsScriptDocument(doc({ code: '  ', tests: [] }));
    expect(issues.every((issue) => issue.severity === 'warning')).toBe(true);
    expect(issues.map((issue) => issue.code)).toEqual([
      'js_script_empty_body',
      'js_script_no_tests',
    ]);
  });
});

describe('normalizeJsScriptDocument', () => {
  it('fills in the fields an older document is missing', () => {
    expect(
      normalizeJsScriptDocument({ code: 'await output("a", 1);' })
    ).toEqual({ ...emptyJsScriptDocument(), code: 'await output("a", 1);' });
  });

  it('answers a null document with the empty one', () => {
    expect(normalizeJsScriptDocument(null)).toEqual(emptyJsScriptDocument());
  });
});

describe('streamMismatches', () => {
  it('reports a length difference as one mismatch on the whole stream', () => {
    expect(streamMismatches([1, 2], [1])).toEqual([
      { output: 'streamed', expected: [1, 2], actual: [1] },
    ]);
  });

  it('reports a differing entry by index', () => {
    expect(streamMismatches([1, 2], [1, 3])).toEqual([
      { output: 'streamed[1]', expected: 2, actual: 3 },
    ]);
  });

  it('compares structurally, not by reference', () => {
    expect(streamMismatches([{ a: [1] }], [{ a: [1] }])).toEqual([]);
  });
});

describe('gradeJsScriptCase', () => {
  it('passes a case whose outputs match', () => {
    const report = gradeJsScriptCase(
      { name: 'sums', inputs: {}, expect: { total: 3 } },
      outcome()
    );
    expect(report.ok).toBe(true);
    expect(report.mismatches).toEqual([]);
  });

  it('reports a mismatch per expected handle', () => {
    const report = gradeJsScriptCase(
      { name: 'sums', inputs: {}, expect: { total: 4 } },
      outcome()
    );
    expect(report.ok).toBe(false);
    expect(report.mismatches).toEqual([
      { output: 'total', expected: 4, actual: 3 },
    ]);
  });

  it('does not bury a failed run under output mismatches', () => {
    const report = gradeJsScriptCase(
      { name: 'sums', inputs: {}, expect: { total: 3 } },
      outcome({ ok: false, outputs: undefined, error: 'boom' })
    );
    expect(report.ok).toBe(false);
    expect(report.mismatches).toEqual([]);
    expect(report.error).toBe('boom');
  });
});

describe('gradeJsScriptTests', () => {
  it('runs cases in order and rolls the grades up', async () => {
    const seen: unknown[] = [];
    const report = await gradeJsScriptTests(
      [
        { name: 'one', inputs: { n: 1 }, expect: { total: 3 } },
        { name: 'two', inputs: { n: 2 }, expect: { total: 9 } },
      ],
      async (inputs) => {
        seen.push(inputs);
        return outcome();
      }
    );

    expect(seen).toEqual([{ n: 1 }, { n: 2 }]);
    expect(report.passed).toBe(1);
    expect(report.failed).toBe(1);
    expect(report.cases.map((entry) => entry.name)).toEqual(['one', 'two']);
  });

  it('stages inputStreams for a body that reads with stream', async () => {
    const staged: unknown[] = [];
    await gradeJsScriptTests(
      [{ name: 'streamed', inputs: {}, inputStreams: { numbers: [1, 2] } }],
      async (_inputs, inputStreams) => {
        staged.push(inputStreams);
        return outcome();
      }
    );
    expect(staged).toEqual([{ numbers: [1, 2] }]);
  });

  it('turns a thrown run into a failed case rather than a failed report', async () => {
    const report = await gradeJsScriptTests(
      [{ name: 'network down', inputs: {} }],
      async () => {
        throw new Error('offline');
      }
    );
    expect(report.failed).toBe(1);
    expect(report.cases[0].error).toBe('offline');
  });
});

describe('summarizeJsScriptTests', () => {
  it('counts passes and failures', () => {
    expect(
      summarizeJsScriptTests([
        { name: 'a', ok: true, logs: [], mismatches: [] },
        { name: 'b', ok: false, logs: [], mismatches: [] },
      ])
    ).toEqual({
      passed: 1,
      failed: 1,
      cases: [
        { name: 'a', ok: true, logs: [], mismatches: [] },
        { name: 'b', ok: false, logs: [], mismatches: [] },
      ],
    });
  });
});
