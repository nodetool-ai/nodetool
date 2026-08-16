/**
 * Tests for the sketch compositor shared by the viewer screen and the
 * app-runtime `Sketch` widget.
 *
 * `assets.get` is mocked at the tRPC client so layer asset resolution runs
 * without a server, and the frame gets a width through a synthetic `onLayout`,
 * which is what turns the document's pixel geometry into layout.
 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';

import {
  SketchRenderer,
  asSketchDocument,
  layerDataImageUri,
  resolveLayers,
  type SketchDocumentData,
} from '../SketchRenderer';

import { apiService } from '../../../services/api';

// Real `apiService`; only URL resolution is pinned to a stable test host.
jest.spyOn(apiService, 'resolveUrl').mockImplementation((path) =>
  path ? (path.startsWith('http') ? path : `https://example.test${path}`) : null
);

interface AssetQueryResult {
  data?: { get_url: string };
  isLoading: boolean;
}

const mockAssetsById = new Map<string, AssetQueryResult>();

jest.mock('../../../trpc/client', () => ({
  trpc: {
    assets: {
      get: {
        useQuery: (input: { id: string }, options?: { enabled?: boolean }) => {
          if (options?.enabled === false) {
            return { data: undefined, isLoading: false };
          }
          return mockAssetsById.get(input.id) ?? { data: undefined, isLoading: false };
        },
      },
    },
  },
}));

const CANVAS = { width: 200, height: 100, backgroundColor: '#ffffff' };

const makeDoc = (): SketchDocumentData =>
  ({
    sketch: {
      canvas: CANVAS,
      layers: [
        {
          id: 'l-base',
          name: 'Background',
          type: 'raster',
          visible: true,
          opacity: 1,
          data: 'data:image/png;base64,AAAA',
        },
        {
          id: 'l-gen',
          name: 'Sky',
          type: 'raster',
          visible: true,
          opacity: 0.5,
          contentBounds: { x: 10, y: 20, width: 100, height: 50 },
        },
        {
          id: 'l-hidden',
          name: 'Notes',
          type: 'raster',
          visible: false,
          opacity: 1,
          data: 'data:image/png;base64,BBBB',
        },
      ],
    },
    layerBindings: [
      { layerId: 'l-gen', status: 'generated', currentAssetId: 'a-sky', versions: [] },
    ],
  }) as SketchDocumentData;

function renderComposite(props: Partial<React.ComponentProps<typeof SketchRenderer>> = {}) {
  const result = render(<SketchRenderer doc={makeDoc()} {...props} />);
  // Nothing composites until the frame reports a width.
  fireEvent(screen.getByLabelText(/Sketch preview/), 'layout', {
    nativeEvent: { layout: { width: 400, height: 0, x: 0, y: 0 } },
  });
  return result;
}

describe('SketchRenderer', () => {
  beforeEach(() => {
    mockAssetsById.clear();
    mockAssetsById.set('a-sky', {
      data: { get_url: '/api/assets/a-sky/file' },
      isLoading: false,
    });
  });

  it('composites only the visible layers', () => {
    renderComposite();

    expect(screen.getByLabelText('Sketch preview, 2 visible layers')).toBeTruthy();
    expect(screen.getByLabelText('Layer Background')).toBeTruthy();
    expect(screen.queryByLabelText('Layer Notes')).toBeNull();
  });

  it('scales document pixels to the measured frame', () => {
    renderComposite();

    const sky = screen.getByLabelText('Layer Sky');
    expect(sky.props.source).toEqual({
      uri: 'https://example.test/api/assets/a-sky/file',
    });
    // Canvas is 200px wide shown at 400pt, so document pixels double.
    expect(sky.props.style).toEqual(
      expect.arrayContaining([
        { left: 20, top: 40, width: 200, height: 100 },
        { opacity: 0.5 },
      ])
    );
  });

  it('shrinks to fit a height cap rather than cropping', () => {
    renderComposite({ maxHeight: 50 });

    // 50pt over a 100px-tall canvas halves the scale the width alone allowed.
    expect(screen.getByLabelText('Layer Sky').props.style).toEqual(
      expect.arrayContaining([{ left: 5, top: 10, width: 50, height: 25 }])
    );
  });

  it('draws the dimensions badge only when asked', () => {
    const { unmount } = renderComposite();
    expect(screen.queryByText('200 × 100')).toBeNull();
    unmount();

    renderComposite({ showDimensions: true });
    expect(screen.getByText('200 × 100')).toBeTruthy();
  });

  it('renders a placeholder instead of a broken image for a failed layer', () => {
    const doc = makeDoc();
    doc.layerBindings = [
      { layerId: 'l-gen', status: 'failed', currentAssetId: 'a-sky', versions: [] },
    ];
    render(<SketchRenderer doc={doc} />);
    fireEvent(screen.getByLabelText(/Sketch preview/), 'layout', {
      nativeEvent: { layout: { width: 400, height: 0, x: 0, y: 0 } },
    });

    expect(screen.queryByLabelText('Layer Sky')).toBeNull();
    expect(screen.getByLabelText('Layer Sky has no image: Failed')).toBeTruthy();
  });
});

describe('resolveLayers', () => {
  it('dims a layer by its ancestor group opacity and drops hidden groups', () => {
    const layers = resolveLayers({
      sketch: {
        canvas: CANVAS,
        layers: [
          { id: 'g-1', name: 'Folder', type: 'group', visible: true, opacity: 0.5 },
          {
            id: 'l-1',
            name: 'Inside',
            type: 'raster',
            visible: true,
            opacity: 0.5,
            parentId: 'g-1',
          },
          { id: 'g-2', name: 'Closed', type: 'group', visible: false, opacity: 1 },
          {
            id: 'l-2',
            name: 'Buried',
            type: 'raster',
            visible: true,
            opacity: 1,
            parentId: 'g-2',
          },
        ],
      },
      layerBindings: [],
    });

    expect(layers.find((layer) => layer.id === 'l-1')).toMatchObject({
      composited: true,
      opacity: 0.25,
    });
    expect(layers.find((layer) => layer.id === 'l-2')?.composited).toBe(false);
  });

  it('refuses a cyclic parent chain rather than looping', () => {
    expect(() =>
      resolveLayers({
        sketch: {
          canvas: CANVAS,
          layers: [
            { id: 'a', type: 'group', parentId: 'b' },
            { id: 'b', type: 'group', parentId: 'a' },
          ],
        },
        layerBindings: [],
      })
    ).toThrow(/cyclic parent chain/);
  });
});

describe('asSketchDocument', () => {
  it('reads the persisted envelope with its bindings', () => {
    const doc = asSketchDocument({
      sketch: { canvas: CANVAS, layers: [{ id: 'l-1' }] },
      layerBindings: [{ layerId: 'l-1', status: 'generated' }],
    });

    expect(doc?.sketch.canvas.width).toBe(200);
    expect(doc?.layerBindings).toHaveLength(1);
  });

  it('reads a bare editor document, which carries no bindings', () => {
    const doc = asSketchDocument({
      version: 1,
      canvas: CANVAS,
      layers: [{ id: 'l-1' }],
      activeLayerId: 'l-1',
    });

    expect(doc?.sketch.layers).toHaveLength(1);
    expect(doc?.layerBindings).toEqual([]);
  });

  it('rejects anything without a canvas and layers', () => {
    expect(asSketchDocument(null)).toBeNull();
    expect(asSketchDocument({ canvas: { width: 4 }, layers: [] })).toBeNull();
    expect(asSketchDocument({ type: 'sketch', id: 'sk-1' })).toBeNull();
  });
});

describe('layerDataImageUri', () => {
  it('passes a legacy bare data URL straight through', () => {
    expect(layerDataImageUri('data:image/png;base64,AAAA')).toBe(
      'data:image/png;base64,AAAA'
    );
  });

  it('unwraps an ntlayer: payload', () => {
    const payload = btoa(
      JSON.stringify({
        version: 1,
        image: 'data:image/png;base64,CCCC',
        bounds: { x: 0, y: 0, width: 4, height: 4 },
      })
    );
    expect(layerDataImageUri(`ntlayer:${payload}`)).toBe('data:image/png;base64,CCCC');
  });

  it('returns null for an empty or undecodable payload', () => {
    expect(layerDataImageUri(null)).toBeNull();
    expect(layerDataImageUri('ntlayer:@@@not-base64@@@')).toBeNull();
    expect(layerDataImageUri(`ntlayer:${btoa('{"version":1,"image":null}')}`)).toBeNull();
  });
});
