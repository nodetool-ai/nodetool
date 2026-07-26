/**
 * Tests for SketchViewerScreen — the read-only sketch surface.
 *
 * The document store is mocked so the screen's states can be driven directly,
 * and `assets.get` is mocked at the tRPC client so layer asset resolution is
 * exercised without a server. The canvas gets a width through a synthetic
 * `onLayout`, which is what turns the document's pixel geometry into layout.
 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';

import SketchViewerScreen, { layerDataImageUri } from '../SketchViewerScreen';
import type { DocumentStatus } from '../../documents/documentStore';

// ── Module mocks ───────────────────────────────────────────────────────────

interface MockState {
  doc: unknown;
  name: string;
  status: DocumentStatus;
  error: string | null;
  load: () => Promise<void>;
}

const load = jest.fn<Promise<void>, []>().mockResolvedValue(undefined);

let mockState: MockState;

jest.mock('../../documents/documentStore', () => ({
  documentStore: () => {
    const useStore = (selector: (state: MockState) => unknown) => selector(mockState);
    useStore.getState = () => mockState;
    return useStore;
  },
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../../services/api', () => ({
  apiService: {
    resolveUrl: (path?: string | null) =>
      path ? (path.startsWith('http') ? path : `https://example.test${path}`) : null,
  },
}));

interface AssetQueryResult {
  data?: { get_url: string };
  isLoading: boolean;
}

const mockAssetsById = new Map<string, AssetQueryResult>();

jest.mock('../../trpc/client', () => ({
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

jest.mock('../../hooks/useTheme', () => ({
  useTheme: () => ({
    colors: {
      background: '#000',
      surface: '#111',
      surfaceElevated: '#222',
      primary: '#6DB3F8',
      primaryMuted: '#123',
      text: '#fff',
      textSecondary: '#aaa',
      textTertiary: '#777',
      textOnPrimary: '#fff',
      border: '#222',
      borderLight: '#333',
      error: '#f00',
      success: '#0f0',
      warning: '#fc0',
      info: '#08f',
      inputBg: '#222',
      cardBg: '#111',
    },
    shadows: { small: {}, medium: {}, large: {} },
  }),
}));

// ── Fixtures ───────────────────────────────────────────────────────────────

const navigation = { navigate: jest.fn(), setOptions: jest.fn(), goBack: jest.fn() };
const route = {
  key: 'SketchViewer-1',
  name: 'SketchViewer' as const,
  params: { id: 'sk-1', name: 'Doodle' },
};

const CANVAS = { width: 200, height: 100, backgroundColor: '#ffffff' };

/** A document with a background raster, a generated layer, and a failed one. */
const makeDoc = () => ({
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
        id: 'l-broken',
        name: 'Dragon',
        type: 'raster',
        visible: true,
        opacity: 1,
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
    { layerId: 'l-broken', status: 'failed', currentAssetId: 'a-dragon', versions: [] },
  ],
});

function renderScreen() {
  const result = render(
    <SketchViewerScreen navigation={navigation as never} route={route as never} />
  );
  // Give the canvas a measured width; nothing composites until it has one.
  fireEvent(screen.getByLabelText(/Sketch preview/), 'layout', {
    nativeEvent: { layout: { width: 400, height: 0, x: 0, y: 0 } },
  });
  return result;
}

describe('SketchViewerScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAssetsById.clear();
    mockAssetsById.set('a-sky', {
      data: { get_url: '/api/assets/a-sky/file' },
      isLoading: false,
    });
    mockState = {
      doc: makeDoc(),
      name: 'Doodle',
      status: 'idle',
      error: null,
      load,
    };
  });

  it('loads the document on mount and titles the header', () => {
    renderScreen();

    expect(load).toHaveBeenCalled();
    expect(navigation.setOptions).toHaveBeenCalledWith({ title: 'Doodle' });
  });

  it('shows a spinner while the first load is in flight', () => {
    mockState = { ...mockState, doc: null, status: 'loading' };
    render(<SketchViewerScreen navigation={navigation as never} route={route as never} />);

    expect(screen.getByText('Loading sketch…')).toBeTruthy();
  });

  it('offers a retry when the load failed', () => {
    mockState = { ...mockState, doc: null, status: 'error', error: 'boom' };
    render(<SketchViewerScreen navigation={navigation as never} route={route as never} />);

    expect(screen.getByText('Could not load this sketch')).toBeTruthy();
    expect(screen.getByText('boom')).toBeTruthy();

    load.mockClear();
    fireEvent.press(screen.getByLabelText('Retry loading sketch'));
    expect(load).toHaveBeenCalled();
  });

  it('composites only the visible layers, hidden ones excluded', () => {
    renderScreen();

    expect(screen.getByLabelText('Sketch preview, 3 visible layers')).toBeTruthy();
    expect(screen.getByLabelText('Layer Background')).toBeTruthy();
    expect(screen.getByLabelText('Layer Sky')).toBeTruthy();
    expect(screen.queryByLabelText('Layer Notes')).toBeNull();
  });

  it('renders an inline layer raster and an asset-backed one at document scale', () => {
    renderScreen();

    const base = screen.getByLabelText('Layer Background');
    expect(base.props.source).toEqual({ uri: 'data:image/png;base64,AAAA' });

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

  it('renders a placeholder instead of a broken image for a failed layer', () => {
    renderScreen();

    expect(screen.queryByLabelText('Layer Dragon')).toBeNull();
    expect(
      screen.getByLabelText('Layer Dragon has no image: Failed')
    ).toBeTruthy();
    expect(screen.getByText('Dragon · Failed')).toBeTruthy();
  });

  it('renders a placeholder when a layer has neither raster nor asset', () => {
    const doc = makeDoc();
    doc.layerBindings = [];
    mockState = { ...mockState, doc };
    renderScreen();

    expect(
      screen.getByLabelText('Layer Sky has no image: No image')
    ).toBeTruthy();
  });

  it('lists every layer top-first with its generation status', () => {
    renderScreen();

    expect(screen.getByText('200 × 100 · 4 layers')).toBeTruthy();
    expect(screen.getByLabelText('Sky status: Generated')).toBeTruthy();
    expect(screen.getByLabelText('Dragon status: Failed')).toBeTruthy();
    // A hidden layer is still listed, and says so.
    expect(screen.getByText('raster · hidden')).toBeTruthy();
    expect(screen.getByText('raster · 50%')).toBeTruthy();
  });

  it('dims a layer by its ancestor group opacity and drops hidden groups', () => {
    mockState = {
      ...mockState,
      doc: {
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
              data: 'data:image/png;base64,AAAA',
            },
            {
              id: 'g-2',
              name: 'Closed folder',
              type: 'group',
              visible: false,
              opacity: 1,
            },
            {
              id: 'l-2',
              name: 'Buried',
              type: 'raster',
              visible: true,
              opacity: 1,
              parentId: 'g-2',
              data: 'data:image/png;base64,BBBB',
            },
          ],
        },
        layerBindings: [],
      },
    };
    renderScreen();

    // Groups hold no pixels, so only one layer composites.
    expect(screen.getByLabelText('Sketch preview, 1 visible layer')).toBeTruthy();
    expect(screen.getByLabelText('Layer Inside').props.style).toEqual(
      expect.arrayContaining([{ opacity: 0.25 }])
    );
    expect(screen.queryByLabelText('Layer Buried')).toBeNull();
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
