import {
  FIXTURES,
  directState,
  directContext,
} from '../../../../packages/timeline/tests/fixtures/ops';
import { HOST_OP_FIXTURES } from '../../../../packages/timeline/tests/fixtures/host-ops';
import { applyTimelineOp } from '@nodetool-ai/timeline/ops';
import { applyDocumentTimelineOp } from '../timelineEdits';

describe('shared timeline fixtures through mobile', () => {
  for (const fixture of FIXTURES) {
    it(fixture.tool, async () => {
      const state = directState();
      const document = { ...state, setup: state.setup ?? undefined };
      const expected = await applyTimelineOp(
        state,
        fixture.op,
        directContext(state),
      );
      expect(expected.error).toBeUndefined();
      const actual = await applyDocumentTimelineOp(
        document,
        fixture.op,
        [],
        directContext(state),
      );
      expect(actual.state).toEqual(expected.state);
    });
  }
  for (const fixture of HOST_OP_FIXTURES) {
    it(fixture.name, async () => {
      const state = fixture.initial();
      const document = { ...state, setup: state.setup ?? undefined };
      const run = applyDocumentTimelineOp(document, fixture.op, [], {
        ...directContext(state),
        ...fixture.context,
      });
      if (fixture.error) {
        await expect(run).rejects.toThrow(fixture.error);
        return;
      }
      const outcome = await run;
      for (const track of fixture.tracks ?? []) {
        expect(
          outcome.state.tracks.find((entry) => entry.id === track.id),
        ).toMatchObject(track);
      }
      if (fixture.tempo) {
        expect(outcome.state.tempo).toEqual(fixture.tempo);
      }
      if (fixture.clipCount !== undefined)
        expect(outcome.state.clips).toHaveLength(fixture.clipCount);
      for (const expected of fixture.clips ?? []) {
        const clip = outcome.state.clips.find(
          (clip) => clip.id === expected.id,
        );
        for (const [key, value] of Object.entries(expected)) {
          if (value === undefined) expect(clip).not.toHaveProperty(key);
          else expect(clip).toMatchObject({ [key]: value });
        }
      }
    });
  }
});
