import '../guest/env/index.mjs';
import { Buffer } from 'buffer/';
import { GuestContext } from '../guest/host/context.mjs';
import { timelineProcessFixture } from './timeline-process-fixture.mjs';
globalThis.Buffer ??= Buffer;
const root = globalThis.__timelineRoot;
const context = new GuestContext({ userId: 'alice', modelOptions: { databasePath: `${root}/timeline.sqlite`, assetRoot: `${root}/assets` } });
if (!context.hasModelInterface('createTimelineSequence')) throw new Error('No native model grant');
try {
  const { result, checks } = await timelineProcessFixture(context);
  globalThis.__timelineResult = JSON.stringify(result);
  globalThis.__timelineChecks = checks;
} catch (error) { throw new Error(error.stack ?? error.message); } finally { context._models.close(); }
globalThis.__nodetool = {};
