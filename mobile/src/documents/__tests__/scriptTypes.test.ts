/**
 * Tests for the pure script helpers.
 *
 * These four behaviours are what the screen and the tools both lean on: status
 * derived from the take snapshot rather than stored, target resolution that
 * fails with a message naming the valid ids, line edits that keep the take
 * history, and speaker removal that leaves no dangling `speakerId`.
 */

import {
  applyLinePatch,
  flattenLines,
  lineStatus,
  lineToNode,
  resolveLine,
  resolveSectionIndex,
  resolveSpeakerIndex,
  withoutSpeaker,
  type ScriptDocument,
  type ScriptLine,
  type ScriptTake,
} from '../scriptTypes';

const take = (id: string, textSnapshot: string): ScriptTake => ({
  id,
  assetId: `asset-${id}`,
  durationMs: 1200,
  words: [{ word: 'hi', startMs: 0, endMs: 200 }],
  textSnapshot,
  voiceSnapshot: null,
  createdAt: '2026-07-26T00:00:00Z',
});

const line = (overrides: Partial<ScriptLine> = {}): ScriptLine => ({
  id: 'line-a',
  speakerId: 'speaker-a',
  text: 'Hello there',
  takes: [],
  currentTakeId: null,
  ...overrides,
});

const makeDocument = (): ScriptDocument => ({
  cast: [
    { id: 'speaker-a', name: 'Ada', color: '#6DB3F8' },
    { id: 'speaker-b', name: 'Grace', voice: null },
  ],
  sections: [
    {
      id: 'section-1',
      title: 'Cold open',
      lines: [
        line({ id: 'line-a' }),
        line({ id: 'line-b', speakerId: 'speaker-b', text: 'Over here' }),
      ],
    },
    {
      id: 'section-2',
      lines: [line({ id: 'line-c', speakerId: null, text: 'Silence' })],
    },
  ],
});

describe('lineStatus', () => {
  it('is draft without a current take', () => {
    expect(lineStatus(line())).toBe('draft');
  });

  it('is draft when currentTakeId names a take that is gone', () => {
    expect(lineStatus(line({ currentTakeId: 'take-gone' }))).toBe('draft');
  });

  it('is voiced when the current take was voiced from the current text', () => {
    const voiced = line({
      takes: [take('take-1', 'Hello there')],
      currentTakeId: 'take-1',
    });
    expect(lineStatus(voiced)).toBe('voiced');
  });

  it('is stale once the text has moved past the take', () => {
    const stale = line({
      text: 'Hello again',
      takes: [take('take-1', 'Hello there')],
      currentTakeId: 'take-1',
    });
    expect(lineStatus(stale)).toBe('stale');
  });
});

describe('flattenLines and lineToNode', () => {
  it('numbers lines across sections and names their speaker', () => {
    const doc = makeDocument();
    const flat = flattenLines(doc);

    expect(flat.map((entry) => [entry.line.id, entry.index, entry.sectionId])).toEqual([
      ['line-a', 0, 'section-1'],
      ['line-b', 1, 'section-1'],
      ['line-c', 2, 'section-2'],
    ]);

    const node = lineToNode(flat[1].line, flat[1].sectionId, flat[1].index, doc.cast);
    expect(node).toMatchObject({
      id: 'line-b',
      index: 1,
      sectionId: 'section-1',
      speakerId: 'speaker-b',
      speakerName: 'Grace',
      status: 'draft',
      takeCount: 0,
    });
  });

  it('reports an unassigned line with a null speaker name', () => {
    const doc = makeDocument();
    const flat = flattenLines(doc);

    expect(
      lineToNode(flat[2].line, flat[2].sectionId, flat[2].index, doc.cast)
    ).toMatchObject({ speakerId: null, speakerName: null });
  });
});

describe('resolveLine', () => {
  it('resolves by id, by document index, and by "selected"', () => {
    const doc = makeDocument();

    expect(resolveLine(doc, 'line-b', null).index).toBe(1);
    expect(resolveLine(doc, '2', null).line.id).toBe('line-c');
    expect(resolveLine(doc, 'selected', 'line-c').line.id).toBe('line-c');
  });

  it('throws listing the valid ids for an unknown target', () => {
    expect(() => resolveLine(makeDocument(), 'line-zzz', null)).toThrow(
      /No line matches "line-zzz".*Line ids: line-a, line-b, line-c/s
    );
  });

  it('throws for an out-of-range index rather than clamping', () => {
    expect(() => resolveLine(makeDocument(), '9', null)).toThrow(
      /0-based index below 3/
    );
  });

  it('explains itself when "selected" is passed with nothing selected', () => {
    expect(() => resolveLine(makeDocument(), 'selected', null)).toThrow(
      /No line is selected/
    );
  });
});

describe('resolveSpeakerIndex and resolveSectionIndex', () => {
  it('resolve by id and by index', () => {
    const doc = makeDocument();

    expect(resolveSpeakerIndex(doc.cast, 'speaker-b')).toBe(1);
    expect(resolveSpeakerIndex(doc.cast, '0')).toBe(0);
    expect(resolveSectionIndex(doc.sections, 'section-2')).toBe(1);
    expect(resolveSectionIndex(doc.sections, '0')).toBe(0);
  });

  it('throw listing the valid ids', () => {
    const doc = makeDocument();

    expect(() => resolveSpeakerIndex(doc.cast, 'nope')).toThrow(
      /Speaker ids: speaker-a, speaker-b/
    );
    expect(() => resolveSectionIndex(doc.sections, 'nope')).toThrow(
      /Section ids: section-1, section-2/
    );
  });

  it('say so when there is nothing to address', () => {
    expect(() => resolveSpeakerIndex([], 'nope')).toThrow(/no cast yet/);
    expect(() => resolveSectionIndex([], 'nope')).toThrow(/no sections yet/);
  });
});

describe('applyLinePatch', () => {
  const voiced = line({
    takes: [take('take-1', 'Hello there'), take('take-2', 'Hello there')],
    currentTakeId: 'take-1',
  });

  it('keeps the take history when the text changes, so the line goes stale', () => {
    const next = applyLinePatch(voiced, { text: 'Hello again' });

    expect(next.takes).toHaveLength(2);
    expect(next.currentTakeId).toBe('take-1');
    expect(lineStatus(next)).toBe('stale');
  });

  it('leaves omitted fields alone', () => {
    const next = applyLinePatch(
      line({ direction: 'tired', pauseAfterMs: 400 }),
      { text: 'New words' }
    );

    expect(next).toMatchObject({
      text: 'New words',
      direction: 'tired',
      pauseAfterMs: 400,
      speakerId: 'speaker-a',
    });
  });

  it('clears the speaker when speakerId is passed as null', () => {
    expect(applyLinePatch(line(), { speakerId: null }).speakerId).toBeNull();
  });
});

describe('withoutSpeaker', () => {
  it('drops the cast member and unassigns the lines that used it', () => {
    const next = withoutSpeaker(makeDocument(), 'speaker-a');

    expect(next.cast.map((speaker) => speaker.id)).toEqual(['speaker-b']);
    expect(
      flattenLines(next).map((entry) => [entry.line.id, entry.line.speakerId])
    ).toEqual([
      ['line-a', null],
      ['line-b', 'speaker-b'],
      ['line-c', null],
    ]);
  });

  it('keeps the lines and their takes', () => {
    const doc = makeDocument();
    doc.sections[0].lines[0] = line({
      takes: [take('take-1', 'Hello there')],
      currentTakeId: 'take-1',
    });

    const next = withoutSpeaker(doc, 'speaker-a');

    expect(flattenLines(next)).toHaveLength(3);
    expect(next.sections[0].lines[0].takes).toHaveLength(1);
  });
});
