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

  // Every current kind maps to a surface, so this guard only fires if a kind is
  // added without one. Exercised through a cast, because a well-typed caller
  // cannot reach it — and an unmapped kind must be dropped rather than handed to
  // the agent as an id it has no tool for.
  it('omits a kind with no ui_* surface rather than advertising an unusable id', () => {
    registerDocumentHandler('storyboard', 'sb1', 'Board', {});
    registerDocumentHandler(
      'unmapped' as Parameters<typeof registerDocumentHandler>[0],
      'x1',
      'Mystery',
      {}
    );

    const open = buildUiContext()?.open;

    expect(open).toHaveLength(1);
    expect(open?.[0].id).toBe('sb1');
  });

  it('lists scripts, which are addressable by the agent', () => {
    registerDocumentHandler('script', 'sc1', 'Pilot', {});

    expect(buildUiContext()?.open).toEqual([
      { type: 'script', id: 'sc1', title: 'Pilot' },
    ]);
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
