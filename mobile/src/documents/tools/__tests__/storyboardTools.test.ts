/**
 * Tests for the ui_storyboard_* tools.
 *
 * The tools are thin: they resolve a handler off the agent bridge and forward.
 * So these tests check the forwarding contract — argument names, shapes, and the
 * payload envelope — plus the failure the agent will actually hit most often,
 * naming a board that is not open.
 */

import { MobileToolRegistry } from '../registry';
import type { MobileToolResult } from '../registry';
import '../storyboardTools';
import {
  registerDocumentHandler,
  resetDocumentHandlers,
} from '../../agentBridge';
import type {
  StoryboardAgentHandler,
  StoryboardShotNode,
  StoryboardSnapshot,
} from '../../storyboardTypes';

const shotNode = (id: string, index: number): StoryboardShotNode => ({
  id,
  index,
  action: 'A lighthouse at dusk',
  status: 'planned',
  hasKeyframe: false,
  hasClip: false,
});

const snapshot = (): StoryboardSnapshot => ({
  boardId: 'sb-1',
  title: 'Test board',
  brief: 'A brief',
  style: 'grainy 16mm',
  aspectRatio: '16:9',
  hasScreenplay: false,
  selectedShotId: null,
  shots: [shotNode('shot-a', 0)],
});

type MockHandler = {
  [K in keyof StoryboardAgentHandler]: jest.Mock;
};

const makeHandler = (): MockHandler => ({
  getSnapshot: jest.fn(() => snapshot()),
  addShot: jest.fn(() => shotNode('shot-b', 1)),
  updateShot: jest.fn(() => shotNode('shot-a', 0)),
  removeShot: jest.fn(() => shotNode('shot-a', 0)),
  reorderShot: jest.fn(() => shotNode('shot-a', 2)),
  setBrief: jest.fn(() => snapshot()),
  setStyle: jest.fn(() => snapshot()),
  setAspectRatio: jest.fn(() => snapshot()),
  selectShot: jest.fn(() => shotNode('shot-a', 0)),
  save: jest.fn(async () => ({ ok: true, updatedAt: '2026-07-26T00:00:00Z' })),
});

const call = (
  name: string,
  args: Record<string, unknown>
): Promise<MobileToolResult> =>
  MobileToolRegistry.call(name, args, `${name}-call`);

describe('storyboard tools', () => {
  let handler: MockHandler;
  let unregister: () => void;

  beforeEach(() => {
    resetDocumentHandlers();
    handler = makeHandler();
    unregister = registerDocumentHandler(
      'storyboard',
      'sb-1',
      'Test board',
      handler as unknown as StoryboardAgentHandler
    );
  });

  afterEach(() => {
    unregister();
  });

  it('registers every storyboard tool in the manifest', () => {
    const names = MobileToolRegistry.names();
    expect(names).toEqual(
      expect.arrayContaining([
        'ui_storyboard_get_state',
        'ui_storyboard_add_shot',
        'ui_storyboard_update_shot',
        'ui_storyboard_remove_shot',
        'ui_storyboard_reorder_shot',
        'ui_storyboard_set_brief',
        'ui_storyboard_set_style',
        'ui_storyboard_set_aspect_ratio',
        'ui_storyboard_select_shot',
        'ui_storyboard_save',
      ])
    );
  });

  it('every storyboard tool requires storyboard_id', () => {
    const entries = MobileToolRegistry.getManifest().filter((entry) =>
      entry.name.startsWith('ui_storyboard_')
    );
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(entry.parameters.required).toContain('storyboard_id');
      expect(entry.description.length).toBeGreaterThan(40);
    }
  });

  it('get_state returns the snapshot under an ok envelope', async () => {
    const result = await call('ui_storyboard_get_state', {
      storyboard_id: 'sb-1',
    });

    expect(handler.getSnapshot).toHaveBeenCalled();
    expect(result).toEqual({ ok: true, ...snapshot() });
  });

  it('add_shot forwards action, camera, motion, duration and index', async () => {
    const result = await call('ui_storyboard_add_shot', {
      storyboard_id: 'sb-1',
      action: 'Waves break on the rocks',
      camera: { framing: 'wide' },
      motion: 'slow push in',
      durationSeconds: 4,
      index: 1,
    });

    expect(handler.addShot).toHaveBeenCalledWith({
      action: 'Waves break on the rocks',
      camera: { framing: 'wide' },
      motion: 'slow push in',
      durationSeconds: 4,
      index: 1,
    });
    expect(result).toEqual({ ok: true, shot: shotNode('shot-b', 1) });
  });

  it('update_shot forwards the target and the patch', async () => {
    await call('ui_storyboard_update_shot', {
      storyboard_id: 'sb-1',
      target: 'selected',
      action: 'Tighter on the lamp',
      status: 'keyframe_ready',
    });

    expect(handler.updateShot).toHaveBeenCalledWith('selected', {
      action: 'Tighter on the lamp',
      camera: undefined,
      motion: undefined,
      slug: undefined,
      durationSeconds: undefined,
      status: 'keyframe_ready',
    });
  });

  it('remove_shot forwards the target', async () => {
    const result = await call('ui_storyboard_remove_shot', {
      storyboard_id: 'sb-1',
      target: '0',
    });

    expect(handler.removeShot).toHaveBeenCalledWith('0');
    expect(result).toEqual({ ok: true, shot: shotNode('shot-a', 0) });
  });

  it('reorder_shot forwards the destination index', async () => {
    await call('ui_storyboard_reorder_shot', {
      storyboard_id: 'sb-1',
      target: 'shot-a',
      to_index: 2,
    });

    expect(handler.reorderShot).toHaveBeenCalledWith('shot-a', 2);
  });

  it('board setters forward their value and return a snapshot', async () => {
    await call('ui_storyboard_set_brief', {
      storyboard_id: 'sb-1',
      brief: 'A storm rolls in',
    });
    await call('ui_storyboard_set_style', {
      storyboard_id: 'sb-1',
      style: 'muted teal',
    });
    const ratio = await call('ui_storyboard_set_aspect_ratio', {
      storyboard_id: 'sb-1',
      aspect_ratio: '9:16',
    });

    expect(handler.setBrief).toHaveBeenCalledWith('A storm rolls in');
    expect(handler.setStyle).toHaveBeenCalledWith('muted teal');
    expect(handler.setAspectRatio).toHaveBeenCalledWith('9:16');
    expect(ratio).toEqual({ ok: true, ...snapshot() });
  });

  it('select_shot forwards null to clear the selection', async () => {
    handler.selectShot.mockReturnValueOnce(null);

    const result = await call('ui_storyboard_select_shot', {
      storyboard_id: 'sb-1',
      target: null,
    });

    expect(handler.selectShot).toHaveBeenCalledWith(null);
    expect(result).toEqual({ ok: true, selected: null });
  });

  it('save returns the handler result unchanged', async () => {
    const result = await call('ui_storyboard_save', { storyboard_id: 'sb-1' });

    expect(handler.save).toHaveBeenCalled();
    expect(result).toEqual({ ok: true, updatedAt: '2026-07-26T00:00:00Z' });
  });

  it('fails with the open-board list when the id is not open', async () => {
    await expect(
      call('ui_storyboard_get_state', { storyboard_id: 'nope' })
    ).rejects.toThrow(/No storyboard "nope" is open.*Open storyboard ids: sb-1/s);
  });

  it('fails naming no open boards when nothing is open', async () => {
    unregister();

    await expect(
      call('ui_storyboard_add_shot', { storyboard_id: 'sb-1', action: 'x' })
    ).rejects.toThrow(/No storyboard documents are currently open/);
  });
});
