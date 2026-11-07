// Static-import control for the existing node module. No process callbacks.
import '../guest/env/index.mjs';
import { TimelineTranscriptNode } from '@nodetool-ai/video-nodes/nodes/timeline';
const node = new TimelineTranscriptNode();
if (node.constructor.nodeType !== 'nodetool.timeline.Transcript') throw new Error('Wrong actual node class');
globalThis.__timelineResult = JSON.stringify({ imported: true });
globalThis.__timelineChecks = 1;
globalThis.__nodetool = {};
