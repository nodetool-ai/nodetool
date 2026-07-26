import {
  registerDocumentHandler,
  resetDocumentHandlers,
  setFocusedDocument,
} from '../agentBridge';
import { buildUiContext, clearUiSelection, setUiSelection } from '../uiContext';

describe('buildUiContext', () => {
  beforeEach(() => {
    resetDocumentHandlers();
    clearUiSelection();
  });

  it('is undefined when nothing is open, so the field is omitted from the turn', () => {
    expect(buildUiContext()).toBeUndefined();
  });

  it('lists open documents with their protocol surface type', () => {
    registerDocumentHandler('storyboard', 'sb1', 'Chase scene', {});
    registerDocumentHandler('timeline', 'seq1', 'Cut 3', {});

    expect(buildUiContext()?.open).toEqual([
      { type: 'storyboard', id: 'sb1', title: 'Chase scene' },
      { type: 'timeline', id: 'seq1', title: 'Cut 3' },
    ]);
  });

  it('omits kinds with no ui_* tools rather than advertising unusable ids', () => {
    registerDocumentHandler('storyboard', 'sb1', 'Board', {});
    registerDocumentHandler('asset', 'asset1', 'photo.png', {});

    const open = buildUiContext()?.open;

    expect(open).toHaveLength(1);
    expect(open?.[0].id).toBe('sb1');
  });

  it('is undefined when the only open document has no tools', () => {
    registerDocumentHandler('asset', 'asset1', 'photo.png', {});

    expect(buildUiContext()).toBeUndefined();
  });

  it('reports the focused document', () => {
    registerDocumentHandler('storyboard', 'sb1', 'Board', {});
    registerDocumentHandler('timeline', 'seq1', 'Seq', {});
    setFocusedDocument('timeline', 'seq1');

    expect(buildUiContext()?.focused).toEqual({
      type: 'timeline',
      id: 'seq1',
      title: 'Seq',
    });
  });

  it('reports a null focus when no screen claims it', () => {
    registerDocumentHandler('storyboard', 'sb1', 'Board', {});

    expect(buildUiContext()?.focused).toBeNull();
  });

  it('carries the published selection', () => {
    registerDocumentHandler('storyboard', 'sb1', 'Board', {});
    setUiSelection({ shotIds: ['shot-2'] });

    expect(buildUiContext()?.selection).toEqual({
      clip_ids: null,
      shot_ids: ['shot-2'],
      layer_ids: null,
    });
  });

  it('sends a null selection rather than empty arrays', () => {
    registerDocumentHandler('storyboard', 'sb1', 'Board', {});
    setUiSelection({ shotIds: [] });

    expect(buildUiContext()?.selection).toBeNull();
  });

  it('drops the selection once cleared', () => {
    registerDocumentHandler('timeline', 'seq1', 'Seq', {});
    setUiSelection({ clipIds: ['clip-1'] });
    clearUiSelection();

    expect(buildUiContext()?.selection).toBeNull();
  });
});
