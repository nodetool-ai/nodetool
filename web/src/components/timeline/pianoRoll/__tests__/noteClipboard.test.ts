import { decodeNoteClipboard, encodeNoteClipboard, pasteNotes } from "../noteClipboard";

const note = { id: "original", pitch: 60, velocity: 87, startTick: 120, durationTick: 240 };

it("rejects unrelated or invalid clipboard data", () => {
  for (const text of ["hello", "null", "{}", JSON.stringify({ format: "nodetool-midi-notes", version: 1, notes: [{ ...note, pitch: 128 }] })]) {
    expect(decodeNoteClipboard(text)).toBeNull();
  }
});

it("pastes a large selection with fresh ids and unchanged musical spacing", () => {
  const notes = Array.from({ length: 10000 }, (_, index) => ({ ...note, id: String(index), startTick: 120 + index * 240 }));
  const copied = decodeNoteClipboard(encodeNoteClipboard(notes))!;
  const pasted = pasteNotes(copied, 960);
  expect(pasted).toHaveLength(10000);
  expect(new Set(pasted.map(n => n.id)).size).toBe(10000);
  expect(pasted[0]).toMatchObject({ startTick: 960, velocity: 87, durationTick: 240 });
  expect(pasted[9999].startTick).toBe(960 + 9999 * 240);
  expect(notes[0].startTick).toBe(120);
});

it("keeps every note field through a round trip", () => {
  const full = {
    ...note,
    muted: true,
    channel: 9,
    releaseVelocity: 12,
    expression: { pitch: [{ tick: 0, value: 1 }], volume: [{ tick: 240, value: 2 }] }
  };
  const copied = decodeNoteClipboard(encodeNoteClipboard([full]))!;
  const [pasted] = pasteNotes(copied, 0);
  expect(pasted).toMatchObject({
    muted: true,
    channel: 9,
    releaseVelocity: 12,
    expression: full.expression
  });
  expect(pasted.id).not.toBe("original");
});

it("still accepts version 1 data, which has the four basic fields", () => {
  const v1 = JSON.stringify({
    format: "nodetool-midi-notes",
    version: 1,
    notes: [{ pitch: 60, velocity: 80, startTick: 0, durationTick: 480 }]
  });
  expect(decodeNoteClipboard(v1)).toEqual([{ pitch: 60, velocity: 80, startTick: 0, durationTick: 480 }]);
});

it("rejects a note with a bad new field", () => {
  const bad = JSON.stringify({
    format: "nodetool-midi-notes",
    version: 2,
    notes: [{ ...note, channel: 16 }]
  });
  expect(decodeNoteClipboard(bad)).toBeNull();
});
