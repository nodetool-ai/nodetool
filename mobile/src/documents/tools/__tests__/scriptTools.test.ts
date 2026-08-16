/**
 * Tests for the ui_script_* tools.
 *
 * The tools are thin: they resolve a handler off the agent bridge and forward.
 * So these tests check the forwarding contract — argument names, shapes, and the
 * payload envelope — plus the failure the agent will actually hit most often,
 * naming a script that is not open.
 */

import { MobileToolRegistry } from '../registry';
import type { MobileToolResult } from '../registry';
import '../scriptTools';
import {
  registerDocumentHandler,
  resetDocumentHandlers,
} from '../../agentBridge';
import type {
  ScriptAgentHandler,
  ScriptLineNode,
  ScriptSectionNode,
  ScriptSnapshot,
  ScriptSpeakerNode,
} from '../../scriptTypes';

const lineNode = (id: string, index: number): ScriptLineNode => ({
  id,
  index,
  sectionId: 'section-1',
  speakerId: 'speaker-a',
  speakerName: 'Ada',
  text: 'Hello there',
  status: 'draft',
  takeCount: 0,
});

const speakerNode = (id: string): ScriptSpeakerNode => ({
  id,
  name: 'Ada',
  hasVoice: false,
});

const sectionNode = (id: string): ScriptSectionNode => ({
  id,
  title: 'Cold open',
  lineIds: ['line-a'],
});

const snapshot = (): ScriptSnapshot => ({
  scriptId: 'sc-1',
  title: 'Test script',
  cast: [speakerNode('speaker-a')],
  sections: [sectionNode('section-1')],
  lines: [lineNode('line-a', 0)],
  selectedLineId: null,
});

type MockHandler = {
  [K in keyof ScriptAgentHandler]: jest.Mock;
};

const makeHandler = (): MockHandler => ({
  getSnapshot: jest.fn(() => snapshot()),
  addSpeaker: jest.fn(() => speakerNode('speaker-b')),
  renameSpeaker: jest.fn(() => speakerNode('speaker-a')),
  removeSpeaker: jest.fn(() => speakerNode('speaker-a')),
  addSection: jest.fn(() => sectionNode('section-2')),
  setSectionTitle: jest.fn(() => sectionNode('section-1')),
  removeSection: jest.fn(() => sectionNode('section-1')),
  addLine: jest.fn(() => lineNode('line-b', 1)),
  setLineText: jest.fn(() => lineNode('line-a', 0)),
  setLineSpeaker: jest.fn(() => lineNode('line-a', 0)),
  patchLine: jest.fn(() => lineNode('line-a', 0)),
  removeLine: jest.fn(() => lineNode('line-a', 0)),
  moveLine: jest.fn(() => lineNode('line-a', 2)),
  selectLine: jest.fn(() => lineNode('line-a', 0)),
  save: jest.fn(async () => ({ ok: true, updatedAt: '2026-07-26T00:00:00Z' })),
});

const call = (
  name: string,
  args: Record<string, unknown>
): Promise<MobileToolResult> =>
  MobileToolRegistry.call(name, args, `${name}-call`);

describe('script tools', () => {
  let handler: MockHandler;
  let unregister: () => void;

  beforeEach(() => {
    resetDocumentHandlers();
    handler = makeHandler();
    unregister = registerDocumentHandler(
      'script',
      'sc-1',
      'Test script',
      handler as unknown as ScriptAgentHandler
    );
  });

  afterEach(() => {
    unregister();
  });

  it('registers every script tool in the manifest', () => {
    expect(MobileToolRegistry.names()).toEqual(
      expect.arrayContaining([
        'ui_script_get_state',
        'ui_script_add_speaker',
        'ui_script_rename_speaker',
        'ui_script_remove_speaker',
        'ui_script_add_section',
        'ui_script_set_section_title',
        'ui_script_remove_section',
        'ui_script_add_line',
        'ui_script_set_line_text',
        'ui_script_set_line_speaker',
        'ui_script_patch_line',
        'ui_script_remove_line',
        'ui_script_move_line',
        'ui_script_select_line',
        'ui_script_save',
      ])
    );
  });

  it('registers no voicing, subtitle, or timeline tool — those are desktop-only', () => {
    const names = MobileToolRegistry.names().filter((name) =>
      name.startsWith('ui_script_')
    );
    expect(names).toHaveLength(15);
    for (const name of names) {
      expect(name).not.toMatch(/voice|subtitle|timeline/);
    }
  });

  it('every script tool requires script_id and documents itself', () => {
    const entries = MobileToolRegistry.getManifest().filter((entry) =>
      entry.name.startsWith('ui_script_')
    );
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(entry.parameters.required).toContain('script_id');
      expect(entry.description.length).toBeGreaterThan(40);
    }
  });

  it('get_state returns the snapshot under an ok envelope', async () => {
    const result = await call('ui_script_get_state', { script_id: 'sc-1' });

    expect(handler.getSnapshot).toHaveBeenCalled();
    expect(result).toEqual({ ok: true, ...snapshot() });
  });

  it('get_state says voicing and export are desktop-only', () => {
    const entry = MobileToolRegistry.getManifest().find(
      (it) => it.name === 'ui_script_get_state'
    );
    expect(entry?.description).toMatch(/desktop-only/);
  });

  it('cast tools forward name, color, and target', async () => {
    const added = await call('ui_script_add_speaker', {
      script_id: 'sc-1',
      name: 'Grace',
      color: '#6DB3F8',
    });
    await call('ui_script_rename_speaker', {
      script_id: 'sc-1',
      target: '0',
      name: 'Ada Lovelace',
    });
    const removed = await call('ui_script_remove_speaker', {
      script_id: 'sc-1',
      target: 'speaker-a',
    });

    expect(handler.addSpeaker).toHaveBeenCalledWith('Grace', '#6DB3F8');
    expect(handler.renameSpeaker).toHaveBeenCalledWith('0', 'Ada Lovelace');
    expect(handler.removeSpeaker).toHaveBeenCalledWith('speaker-a');
    expect(added).toEqual({ ok: true, speaker: speakerNode('speaker-b') });
    expect(removed).toEqual({ ok: true, speaker: speakerNode('speaker-a') });
  });

  it('section tools forward title, index, and target', async () => {
    const added = await call('ui_script_add_section', {
      script_id: 'sc-1',
      title: 'Act 2',
      index: 1,
    });
    await call('ui_script_set_section_title', {
      script_id: 'sc-1',
      target: 'section-1',
      title: 'Cold open',
    });
    await call('ui_script_remove_section', {
      script_id: 'sc-1',
      target: '0',
    });

    expect(handler.addSection).toHaveBeenCalledWith('Act 2', 1);
    expect(handler.setSectionTitle).toHaveBeenCalledWith('section-1', 'Cold open');
    expect(handler.removeSection).toHaveBeenCalledWith('0');
    expect(added).toEqual({ ok: true, section: sectionNode('section-2') });
  });

  it('remove_section warns that it deletes the lines inside', () => {
    const entry = MobileToolRegistry.getManifest().find(
      (it) => it.name === 'ui_script_remove_section'
    );
    expect(entry?.description).toMatch(/every line inside it/);
  });

  it('add_line forwards text, speaker, direction, section and index', async () => {
    const result = await call('ui_script_add_line', {
      script_id: 'sc-1',
      text: 'Over here',
      speakerId: 'speaker-a',
      direction: 'whispering',
      sectionId: 'section-1',
      index: 1,
    });

    expect(handler.addLine).toHaveBeenCalledWith({
      text: 'Over here',
      speakerId: 'speaker-a',
      direction: 'whispering',
      sectionId: 'section-1',
      index: 1,
    });
    expect(result).toEqual({ ok: true, line: lineNode('line-b', 1) });
  });

  it('set_line_text forwards the target and the new text', async () => {
    const result = await call('ui_script_set_line_text', {
      script_id: 'sc-1',
      target: 'selected',
      text: 'Hello again',
    });

    expect(handler.setLineText).toHaveBeenCalledWith('selected', 'Hello again');
    expect(result).toEqual({ ok: true, line: lineNode('line-a', 0) });
  });

  it('set_line_speaker forwards null to unassign the line', async () => {
    await call('ui_script_set_line_speaker', {
      script_id: 'sc-1',
      target: '0',
      speakerId: null,
    });

    expect(handler.setLineSpeaker).toHaveBeenCalledWith('0', null);
  });

  it('patch_line forwards only the delivery fields', async () => {
    await call('ui_script_patch_line', {
      script_id: 'sc-1',
      target: 'line-a',
      pauseAfterMs: 500,
    });

    expect(handler.patchLine).toHaveBeenCalledWith('line-a', {
      direction: undefined,
      pauseAfterMs: 500,
    });
  });

  it('remove_line and move_line forward the target and destination', async () => {
    const removed = await call('ui_script_remove_line', {
      script_id: 'sc-1',
      target: '0',
    });
    await call('ui_script_move_line', {
      script_id: 'sc-1',
      target: 'line-a',
      to_index: 2,
    });

    expect(handler.removeLine).toHaveBeenCalledWith('0');
    expect(handler.moveLine).toHaveBeenCalledWith('line-a', 2);
    expect(removed).toEqual({ ok: true, line: lineNode('line-a', 0) });
  });

  it('select_line forwards null to clear the selection', async () => {
    handler.selectLine.mockReturnValueOnce(null);

    const result = await call('ui_script_select_line', {
      script_id: 'sc-1',
      target: null,
    });

    expect(handler.selectLine).toHaveBeenCalledWith(null);
    expect(result).toEqual({ ok: true, selected: null });
  });

  it('save returns the handler result unchanged', async () => {
    const result = await call('ui_script_save', { script_id: 'sc-1' });

    expect(handler.save).toHaveBeenCalled();
    expect(result).toEqual({ ok: true, updatedAt: '2026-07-26T00:00:00Z' });
  });

  it('fails with the open-script list when the id is not open', async () => {
    await expect(
      call('ui_script_get_state', { script_id: 'nope' })
    ).rejects.toThrow(/No script "nope" is open.*Open script ids: sc-1/s);
  });

  it('fails naming no open scripts when nothing is open', async () => {
    unregister();

    await expect(
      call('ui_script_add_line', { script_id: 'sc-1', text: 'x' })
    ).rejects.toThrow(/No script documents are currently open/);
  });
});
