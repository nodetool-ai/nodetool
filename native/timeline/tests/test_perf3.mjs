import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import vm from 'node:vm';

function module(name) {
    const path = `native/timeline/qml/pianoroll/${name}.js`;
    const source = process.env.PERF3_BASELINE_REF
        ? execFileSync('git', ['show', `${process.env.PERF3_BASELINE_REF}:${path}`], { encoding: 'utf8' })
        : readFileSync(new URL(`../qml/pianoroll/${name}.js`, import.meta.url), 'utf8');
    return vm.runInNewContext(`${source.replace('.pragma library', '')}\nthis`);
}

for (const name of ['forceLegato', 'removeOverlaps', 'deleteDuplicates']) {
    test(`${name} reads subquadratic note data and preserves order`, () => {
        const api = module('PianoRollNotes');
        let reads = 0;
        const notes = Array.from({ length: 4096 }, (_, i) => ({
            id: String(i), pitch: 60, velocity: 100, durationTick: 1000,
            get startTick() { ++reads; return i * 120; }
        }));
        const result = api[name](notes, notes.map(note => note.id));
        assert.equal(result.length, 4096);
        assert.equal(result[0].id, '0');
        assert.equal(result[4095].id, '4095');
        if (name !== 'deleteDuplicates') { assert.equal(result[0].durationTick, 120); }
        console.log(`${name}: ${reads} startTick reads for 4096 selected notes`);
        assert.ok(reads < 500_000, `${name} performed ${reads} startTick reads`);
    });
}

test('indexed picking and viewport queries visit a bounded interval', () => {
    const api = module('PianoRollNotes');
    const notes = Array.from({ length: 4096 }, (_, i) => ({ id: String(i), pitch: 60, startTick: i * 120, durationTick: 60 }));
    // Long overlaps and later array entries must retain hit-test precedence.
    notes.push({ id: 'long', pitch: 60, startTick: 0, durationTick: 300000 });
    const index = api.noteIndex(notes);
    const geo = { scrollTick: 240000, pxPerTick: 1, topPitch: 60, rowHeight: 20 };
    const count = { visits: 0 };
    const hit = api.hitTestIndexed(index, 10, 10, geo, count);
    assert.equal(hit.note.id, api.hitTest(notes, 10, 10, geo).note.id);
    assert.equal(hit.edge, api.hitTest(notes, 10, 10, geo).edge);
    const visible = api.viewportNotes(index, geo, 400, 20);
    assert.deepEqual(Array.from(visible, note => note.id), notes.filter(note => note.startTick <= 240400 && note.startTick + note.durationTick >= 239999).map(note => note.id));
    console.log(`picking: ${count.visits} tree visits for ${notes.length} notes`);
    assert.ok(count.visits < 64);
    for (let i = 0; i < 200; ++i) {
        const from = i * 1900, to = from + 500;
        assert.deepEqual(Array.from(api.notesInRectIndexed(index, from, to, 59, 61)), Array.from(api.notesInRect(notes, from, to, 59, 61)));
    }
});

test('Step Editor groups notes once for all pitches', () => {
    const api = module('StepEditorModel');
    let reads = 0;
    const notes = Array.from({ length: 4096 }, (_, i) => ({ id: String(i), startTick: i, get pitch() { ++reads; return i % 128; } }));
    const index = api.eventIndex(notes, [], [], 0, 4096);
    assert.equal(Object.values(index).reduce((sum, row) => sum + row.length, 0), 4096);
    console.log(`Step Editor: ${reads} pitch reads across 128 lanes`);
    assert.equal(reads, 4096);
});

test('Step Editor shares controller metadata across row reads', () => {
    const api = module('StepEditorModel');
    let reads = 0;
    const lanes = Array.from({ length: 1000 }, (_, i) => ({ get id() { ++reads; return String(i); }, points: [] }));
    const lookup = api.controllerIndex(lanes, []);
    for (let i = 0; i < 1000; ++i) { assert.equal(lookup[String(i)], lanes[i]); }
    console.log(`controller metadata: ${reads} ID reads for 1000 lanes`);
    assert.ok(reads <= 2000);
});

for (const collapsed of [false, true]) {
    test(`zoomed-out short notes match rendered picking and culling, collapsed=${collapsed}`, () => {
        const api = module('PianoRollNotes');
        const notes = [{id:'short',pitch:60,startTick:0,durationTick:1}];
        const geo = {scrollTick:50,pxPerTick:0.01,topPitch:60,rowHeight:20,
            ...(collapsed ? {rows:{pitches:[72,60],index:{72:0,60:1}},topRow:1} : {})};
        const index = api.noteIndex(notes);
        for (const x of [-0.5, 0, 0.49, 0.5]) {
            const expected = api.hitTest(notes,x,10,geo);
            const actual = api.hitTestIndexed(index,x,10,geo);
            assert.equal(actual?.note.id, expected?.note.id);
            assert.equal(actual?.edge, expected?.edge);
        }
        assert.deepEqual(Array.from(api.viewportNotes(index,geo,100,200), n=>n.id), ['short']);
        if (collapsed) {
            assert.equal(api.viewportNotes(index,{...geo,rows:{pitches:[],index:{}}},100,200).length,0);
        }
    });
}
