// Runs the TypeScript storyboard Markdown grammar and its C++ port on the same
// boards, texts and lines, and fails on any difference. The TypeScript in
// packages/protocol/src/storyboard-markdown.ts is the reference.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeStoryboardScreenplay } from '../../../packages/protocol/src/api-schemas/storyboards.ts';
import { parseStoryboardMarkdown, storyboardToMarkdown, tokenizeStoryboardLine } from '../../../packages/protocol/src/storyboard-markdown.ts';

const executable = process.argv[2];
if (!executable) throw new Error('Pass the native storyboard Markdown oracle executable.');

const EXAMPLES = fileURLToPath(new URL('../../../packages/base-nodes/nodetool/examples/storyboards/', import.meta.url));
const NOVA = '0f1e2d3c4b5a69788796a5b4c3d2e1f0';
const DOME = '1a2b3c4d5e6f708192a3b4c5d6e7f809';
const entityList = [
  { id: NOVA, name: 'Nova', kind: 'character', descriptor: 'A young astronaut in a worn orange suit' },
  { id: DOME, name: 'Greenhouse Dome', kind: 'location' },
];
const entities = new Map(entityList.map((e) => [e.id, e]));

// A board with every part the Markdown carries: acts, scenes, entities, takes, transitions, continuities.
function fullBoard() {
  const screenplay = normalizeStoryboardScreenplay({
    type: 'screenplay', id: 'sp', title: 'Mars Greenhouse', logline: 'The first tomato on Mars.', music_prompt: 'Sparse piano, warm pads',
    acts: [{ type: 'act', id: 'act1', title: 'Act I (Setup)', objective: 'Show how fragile the greenhouse is.' }, { type: 'act', id: 'act2', title: 'Act II' }],
    scenes: [
      { type: 'scene', id: 's1', slugline: 'INT. GREENHOUSE DOME - DAWN', lighting: 'Cold blue dawn through the panels', act_id: 'act1' },
      { type: 'scene', id: 's2', slugline: 'EXT. CRATER RIM - DAY', act_id: 'act2' },
      { type: 'scene', id: 'empty', slugline: 'INT. AIRLOCK', act_id: 'act2' },
    ],
    motion_design: {
      transitions: [{ from_shot_id: 'sh1', to_shot_id: 'sh2', direction: 'Match cut on the light' }, { from_shot_id: 'sh1', to_shot_id: 'sh3', direction: 'Jump' }],
      continuities: [{ id: 'c1', shot_ids: ['sh1', 'sh2'], direction: 'One breath of the score' }, { id: 'c2', shot_ids: ['sh1', 'sh3'], direction: 'Same dust' }],
    },
    shots: [
      {
        id: 'sh1', slug: 'First light', scene_id: 's1', status: 'keyframe_ready',
        action: 'Nova kneels by a single green shoot under the dome.\n\nDust drifts in the light.',
        camera: { framing: 'wide', lens: '35mm', preset_ids: ['push-in'] }, motion: 'Slow push in', sound: 'Fans hum',
        duration_seconds: 5, duration_source: 'manual', entity_ids: [NOVA], location_id: DOME,
        keyframe: { type: 'image', uri: 'asset://c1.png', asset_id: 'c1', render_inputs: { kind: 'keyframe' } },
        keyframe_versions: [{ type: 'image', uri: 'asset://c2.png', asset_id: 'c2' }, { type: 'image', uri: 'asset://c1.png', asset_id: 'c1', render_inputs: { kind: 'keyframe' } }],
        clip: { type: 'video', uri: 'asset://v1.mp4', asset_id: 'v1' }, script_line_ids: ['l1'],
      },
      { id: 'sh2', slug: 'The shoot', scene_id: 's1', action: 'Close on the shoot.', render_mode: 'direct', entity_ids: [], notes: 'Hold for the beat', duration_seconds: 0.000000125 },
      { id: 'sh3', slug: 'Crater rim', scene_id: 's2', action: 'The dome is a bead of light on the rim.', entity_ids: [NOVA, DOME], duration_seconds: 2.75, look_preset_ids: ['warm', 'grain'] },
    ],
  });
  return {
    screenplay, shots: screenplay.shots, brief: 'A twenty second opening.\n\nSecond paragraph.', style: 'Warm practicals against cold Martian blue',
    entityIds: [NOVA, DOME], aspectRatio: '2.39:1', setupStage: 'done', genre: 'Science fiction', look_preset_ids: ['warm'],
    directorModel: null, imageModel: null, videoModel: null,
  };
}

const boards = readdirSync(EXAMPLES).filter((f) => f.endsWith('.storyboard.json')).sort()
  .map((f) => ({ name: f, document: JSON.parse(readFileSync(join(EXAMPLES, f), 'utf8')).document }));
assert.ok(boards.length > 0, 'no example boards found');
boards.push({ name: 'full board', document: fullBoard(), entities: true });
// Durations at the edges of JavaScript's number formatting.
boards.push({ name: 'durations', document: { brief: '', style: '', aspectRatio: '16:9', setupStage: 'done', directorModel: null, imageModel: null, videoModel: null, screenplay: null,
  shots: [0.000001, 0.00000099, 1e21, 1.5e21, 123456.789, 1 / 3, 2, -0.5].map((seconds, index) => ({ type: 'shot', id: `d${index}`, index, action: 'A.', status: 'planned', duration_seconds: seconds })) } });

// Texts typed by hand, read with no stored board.
const typed = [
  '',
  '# Night Shift\nA nurse on her last round.\n\n# Act I\n## INT. WARD - NIGHT\n### Corridor\n' +
    `The corridor is empty. @Nova is not here; [Nova](entity://${NOVA}) waits outside.\n- **Lens:** 50mm\n- **Duration:** 3.5s\n### Door\nA door swings shut.\n- **Transition:** Hard cut`,
  '### Water {#keep1} returns\nA stream.',
  '### One {#dup}\nA.\n### Two {#dup}\nB.',
  '### Shot\nAction.\n- **Mood:** tense\n  more mood',
  'Brief before any title.\n# Title\n- **Logline:** One line\n- **Mood:** board label\n## Scene with no act\nStray scene text.\n- **Lighting:** low\n  and warm',
  '### 2. Numbered {#n1}\n![Still](asset://abc.png)\n![Still](asset://def.png)\n![clip one](https://x.test/a.MOV?x=1#t)\n- **Duration:** 1,5 s\n- **Render:** sideways\n- **Cast:** none\n- **Location:** NONE',
  '### A {#a}\n- **Continuity:** with [Shot 3](#c) [Shot 2](#b) — rain\n- **Transition:** [Shot 3](#c) whip pan\n- Note: plain label\nNotes after fields.\n\nSecond notes paragraph.\n### B {#b}\n### C {#c}\n- **Continuity:** until [Shot 1](#a) — back\n- **Transition:**',
  `# T\n- Style: plain style\n- **Cast:** [Nova](entity://${NOVA}), entity://${DOME}\n- **Look:** warm, grain  cold\n- **Aspect ratio:**\n- **Genre:**   \n- **Music:** strings\n- **Motion design:** handheld`,
  '* **Action:** star bullet\n• **Sound:** bullet dot\n### Shot\n**Motion** : spaced colon\n- **Camera movement:** dolly\n- **Rig:** slider\n- **Camera presets:** a b,c\n- **VO:** voice\n- **End state:** rest\n- **Dialogue:** "Hi"',
  '###  Shot with odd spaces {#sp1}　\n \nText after.',
  ['Infinity', '1e400', '.5s', '+2', '-1.5e1s', 'abc', ' 7', '3.', '1,25'].map((d, i) => `### D${i} {#d${i}}\nA.\n- **Duration:** ${d}`).join('\n'),
  '![Still](asset://outside.png)\n# Act after media\nObjective text.\n- **Objective:** more\n## S\n### Shot {#x}\n- **Action:** labelled action\n  continued',
];

const parse = (markdown, base, withEntities) => {
  let n = 0;
  return JSON.parse(JSON.stringify(parseStoryboardMarkdown(markdown, { base, entities: withEntities ? entities : undefined, generateId: () => `new${++n}` })));
};
const tokenize = (line, withEntities) => JSON.parse(JSON.stringify(tokenizeStoryboardLine(line, withEntities ? entities : undefined)));

const requests = [];
const expected = [];
const labels = [];
const add = (label, request, result) => { labels.push(label); requests.push({ ...request, entities: request.withEntities ? entityList : [] }); expected.push(result); };

for (const board of boards) {
  const markdown = storyboardToMarkdown(board.document, { entities: board.entities ? entities : undefined });
  add(`${board.name}: write`, { op: 'write', document: board.document, withEntities: board.entities }, markdown);
  add(`${board.name}: parse with base`, { op: 'parse', markdown, base: board.document, withEntities: board.entities }, parse(markdown, board.document, board.entities));
  add(`${board.name}: parse without base`, { op: 'parse', markdown, base: null, withEntities: board.entities }, parse(markdown, null, board.entities));
  // An edit: every other line dropped, against the stored board.
  const edited = markdown.split('\n').filter((_, i) => i % 3 !== 2).join('\n');
  add(`${board.name}: parse edited`, { op: 'parse', markdown: edited, base: board.document, withEntities: board.entities }, parse(edited, board.document, board.entities));
  for (const line of markdown.split('\n')) add(`${board.name}: tokenize ${JSON.stringify(line)}`, { op: 'tokenize', line, withEntities: board.entities }, tokenize(line, board.entities));
}
for (const [i, markdown] of typed.entries()) {
  for (const withEntities of [false, true]) {
    add(`typed ${i} (entities ${withEntities})`, { op: 'parse', markdown, base: null, withEntities }, parse(markdown, null, withEntities));
    for (const line of markdown.split('\n')) add(`typed ${i}: tokenize ${JSON.stringify(line)}`, { op: 'tokenize', line, withEntities }, tokenize(line, withEntities));
  }
}
const lines = [
  `- **Continuity:** until [Shot 2](#b) with [Nova](entity://${NOVA}) {#c1}`, '[Ghost](entity://abc)', 'see entity://abc and (entity://def)',
  '**bold** and *italic* and ** not bold**', '- plain bullet *with italic*', '###### Deep {#d} tail **b**', 'Lens: 35mm', 'Mood: prose', '#NoSpace',
];
for (const line of lines) for (const withEntities of [false, true]) add(`tokenize ${JSON.stringify(line)}`, { op: 'tokenize', line, withEntities }, tokenize(line, withEntities));

const native = spawnSync(executable, [], { input: JSON.stringify({ requests }), encoding: 'utf8', maxBuffer: 1 << 30 });
assert.equal(native.status, 0, native.stderr);
const { results } = JSON.parse(native.stdout);
assert.equal(results.length, expected.length);
let failures = 0;
for (let i = 0; i < expected.length; i++) {
  try {
    assert.deepEqual(results[i], expected[i]);
  } catch (error) {
    failures++;
    if (failures <= 5) console.error(`${labels[i]}\n${error.message}\n`);
  }
}
assert.equal(failures, 0, `${failures} of ${expected.length} cases differ`);
console.log(`storyboard Markdown oracle: ${expected.length} cases match`);
