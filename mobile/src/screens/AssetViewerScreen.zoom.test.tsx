import React from 'react';
import { act, render, screen, fireEvent } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import AssetViewerScreen, {
  MAX_ZOOM_SCALE,
  MIN_ZOOM_SCALE,
  clamp,
  clampTranslation,
  maxTranslation,
  touchDistance,
} from './AssetViewerScreen';
import type { Asset } from '../services/api';

jest.mock('../utils/saveMedia', () => ({
  saveMediaToLibrary: jest.fn(),
  saveableMediaKind: () => 'image',
}));

const imageAsset: Asset = {
  id: 'asset-1',
  name: 'render.png',
  content_type: 'image/png',
  get_url: '/api/assets/asset-1/file',
  size: 1024,
  created_at: '2026-01-01T00:00:00Z',
} as Asset;

jest.mock('../trpc/client', () => ({
  trpc: {
    useUtils: () => ({
      assets: { get: { invalidate: jest.fn() }, list: { invalidate: jest.fn() } },
    }),
    assets: {
      get: {
        useQuery: () => ({
          data: {
            id: 'asset-1',
            name: 'render.png',
            content_type: 'image/png',
            get_url: '/api/assets/asset-1/file',
            size: 1024,
            created_at: '2026-01-01T00:00:00Z',
          },
          isLoading: false,
          error: null,
          refetch: jest.fn(),
        }),
      },
      update: { useMutation: () => ({ mutateAsync: jest.fn() }) },
      delete: { useMutation: () => ({ mutate: jest.fn() }) },
    },
  },
}));

const FRAME = 300;

describe('zoom math', () => {
  it('clamps into range', () => {
    expect(clamp(5, 1, 4)).toBe(4);
    expect(clamp(-2, 1, 4)).toBe(1);
    expect(clamp(2.5, 1, 4)).toBe(2.5);
  });

  it('measures the distance between two touches', () => {
    expect(touchDistance([{ pageX: 0, pageY: 0 }, { pageX: 3, pageY: 4 }])).toBe(5);
  });

  it('reports no distance for a single touch', () => {
    expect(touchDistance([{ pageX: 10, pageY: 10 }])).toBe(0);
  });

  it('allows no travel at fit or below', () => {
    expect(maxTranslation(FRAME, MIN_ZOOM_SCALE)).toBe(0);
    expect(maxTranslation(FRAME, 0.5)).toBe(0);
    expect(clampTranslation(120, FRAME, MIN_ZOOM_SCALE)).toBeCloseTo(0, 10);
    expect(clampTranslation(-120, FRAME, MIN_ZOOM_SCALE)).toBeCloseTo(0, 10);
  });

  it('allows half the overhang once zoomed', () => {
    expect(maxTranslation(FRAME, 2)).toBe(FRAME / 2);
    expect(clampTranslation(400, FRAME, 2)).toBe(FRAME / 2);
    expect(clampTranslation(-400, FRAME, 2)).toBe(-FRAME / 2);
    expect(clampTranslation(20, FRAME, 2)).toBe(20);
  });

  it('never lets an edge leave the frame at max zoom', () => {
    const limit = maxTranslation(FRAME, MAX_ZOOM_SCALE);
    expect(clampTranslation(limit + 1, FRAME, MAX_ZOOM_SCALE)).toBe(limit);
  });
});

type Point = { id: number; x: number; y: number };

function touchesOf(points: readonly Point[]) {
  return points.map((p) => ({
    identifier: p.id,
    pageX: p.x,
    pageY: p.y,
    locationX: p.x,
    locationY: p.y,
    timestamp: 0,
  }));
}

/**
 * A responder event faithful enough for `PanResponder` — it reads
 * `touchHistory` (not just `nativeEvent.touches`) to derive gesture state.
 */
function responderEvent(
  points: readonly Point[],
  previous: readonly Point[],
  timeStamp: number
) {
  const touchBank: unknown[] = [];
  points.forEach((p) => {
    const before = previous.find((q) => q.id === p.id) ?? p;
    touchBank[p.id] = {
      touchActive: true,
      startPageX: before.x,
      startPageY: before.y,
      startTimeStamp: 0,
      currentPageX: p.x,
      currentPageY: p.y,
      currentTimeStamp: timeStamp,
      previousPageX: before.x,
      previousPageY: before.y,
      previousTimeStamp: Math.max(0, timeStamp - 16),
    };
  });
  const touches = touchesOf(points);
  return {
    nativeEvent: {
      touches,
      changedTouches: touches,
      identifier: points[0]?.id ?? 0,
      pageX: points[0]?.x ?? 0,
      pageY: points[0]?.y ?? 0,
      locationX: points[0]?.x ?? 0,
      locationY: points[0]?.y ?? 0,
      timestamp: timeStamp,
      target: 1,
    },
    touchHistory: {
      touchBank,
      numberActiveTouches: points.length,
      indexOfSingleActiveTouch: points.length === 1 ? points[0].id : -1,
      mostRecentTimeStamp: timeStamp,
    },
  };
}

function renderScreen() {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <AssetViewerScreen
        navigation={{ setOptions: jest.fn(), goBack: jest.fn(), navigate: jest.fn() } as never}
        route={{ params: { assetId: imageAsset.id } } as never}
      />
    </SafeAreaProvider>
  );
}

function surface() {
  const node = screen.getByTestId('asset-zoom-surface');
  // Called directly rather than through `fireEvent`: RTL probes
  // `onMoveShouldSetResponder` with no event to decide whether a node accepts
  // events, which PanResponder-owned nodes do not survive.
  const onLayout = node.props.onLayout as (event: {
    nativeEvent: { layout: { x: number; y: number; width: number; height: number } };
  }) => void;
  onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: FRAME, height: FRAME } } });
  return node;
}

/** Current transform of the image, read off the rendered Animated style. */
function transformOf() {
  const style = screen.getByLabelText(imageAsset.name).props.style as
    | Record<string, unknown>
    | Record<string, unknown>[];
  const flat = (Array.isArray(style) ? style : [style]).reduce<Record<string, unknown>>(
    (acc, part) => ({ ...acc, ...part }),
    {}
  );
  const transform = (flat.transform ?? []) as Record<string, number>[];
  const read = (key: string) => {
    const entry = transform.find((t) => key in t);
    const value = entry?.[key] as unknown;
    if (value && typeof value === 'object' && '__getValue' in value) {
      return (value as { __getValue: () => number }).__getValue();
    }
    return typeof value === 'number' ? value : 0;
  };
  return {
    scale: read('scale'),
    translateX: read('translateX'),
    translateY: read('translateY'),
  };
}

function pinch(node: ReturnType<typeof surface>, from: number, to: number) {
  const start: Point[] = [
    { id: 0, x: 150 - from / 2, y: 150 },
    { id: 1, x: 150 + from / 2, y: 150 },
  ];
  const end: Point[] = [
    { id: 0, x: 150 - to / 2, y: 150 },
    { id: 1, x: 150 + to / 2, y: 150 },
  ];
  fireEvent(node, 'responderGrant', responderEvent([start[0]], [], 0));
  fireEvent(node, 'responderMove', responderEvent(start, start, 16));
  fireEvent(node, 'responderMove', responderEvent(end, start, 32));
}

describe('AssetViewerScreen image zoom', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the image at fit with its accessibility label intact', () => {
    renderScreen();
    surface();
    expect(screen.getByLabelText(imageAsset.name)).toBeTruthy();
    expect(transformOf().scale).toBe(MIN_ZOOM_SCALE);
  });

  it('scales the image up on a pinch out', () => {
    renderScreen();
    const node = surface();

    pinch(node, 100, 200);

    expect(transformOf().scale).toBeCloseTo(2, 5);
  });

  it('clamps the scale to the allowed range', () => {
    renderScreen();
    const node = surface();

    pinch(node, 20, 2000);

    expect(transformOf().scale).toBe(MAX_ZOOM_SCALE);
  });

  it('pans while zoomed but keeps the image inside the frame', () => {
    renderScreen();
    const node = surface();

    pinch(node, 100, 200);
    // One finger lifts, the other drags far past the frame edge.
    fireEvent(node, 'responderMove', responderEvent(
      [{ id: 0, x: 100, y: 150 }], [{ id: 0, x: 100, y: 150 }], 48
    ));
    fireEvent(node, 'responderMove', responderEvent(
      [{ id: 0, x: 900, y: 900 }], [{ id: 0, x: 100, y: 150 }], 64
    ));

    const limit = maxTranslation(FRAME, 2);
    const { translateX, translateY } = transformOf();
    expect(translateX).toBeLessThanOrEqual(limit);
    expect(translateY).toBeLessThanOrEqual(limit);
    expect(translateX).toBeGreaterThan(0);
  });

  it('cannot be dragged off-screen while at fit', () => {
    renderScreen();
    const node = surface();

    fireEvent(node, 'responderGrant', responderEvent([{ id: 0, x: 150, y: 150 }], [], 0));
    fireEvent(node, 'responderMove', responderEvent(
      [{ id: 0, x: 150, y: 150 }], [{ id: 0, x: 150, y: 150 }], 16
    ));
    fireEvent(node, 'responderMove', responderEvent(
      [{ id: 0, x: 900, y: 900 }], [{ id: 0, x: 150, y: 150 }], 32
    ));

    expect(transformOf()).toMatchObject({
      scale: MIN_ZOOM_SCALE,
      translateX: 0,
      translateY: 0,
    });
  });

  it('resets to fit on a double tap and taps the taptic engine once', () => {
    jest.useFakeTimers();
    renderScreen();
    const node = surface();

    pinch(node, 100, 300);
    fireEvent(node, 'responderRelease', responderEvent(
      [{ id: 0, x: 150, y: 150 }], [{ id: 0, x: 150, y: 150 }], 48
    ));
    expect(transformOf().scale).toBeGreaterThan(MIN_ZOOM_SCALE);

    const tap = () => {
      fireEvent(node, 'responderGrant', responderEvent([{ id: 0, x: 150, y: 150 }], [], 100));
      fireEvent(node, 'responderRelease', responderEvent(
        [{ id: 0, x: 150, y: 150 }], [{ id: 0, x: 150, y: 150 }], 110
      ));
    };
    tap();
    tap();

    expect(Haptics.impactAsync).toHaveBeenCalledTimes(1);

    // Let the spring back to fit settle.
    act(() => { jest.advanceTimersByTime(3000); });
    const { scale, translateX, translateY } = transformOf();
    expect(scale).toBeCloseTo(MIN_ZOOM_SCALE, 2);
    expect(translateX).toBeCloseTo(0, 2);
    expect(translateY).toBeCloseTo(0, 2);
    jest.useRealTimers();
  });

  it('zooms in on a double tap while at fit', () => {
    jest.useFakeTimers();
    renderScreen();
    const node = surface();

    const tap = () => {
      fireEvent(node, 'responderGrant', responderEvent([{ id: 0, x: 150, y: 150 }], [], 0));
      fireEvent(node, 'responderRelease', responderEvent(
        [{ id: 0, x: 150, y: 150 }], [{ id: 0, x: 150, y: 150 }], 10
      ));
    };
    tap();
    tap();

    act(() => { jest.advanceTimersByTime(3000); });
    expect(transformOf().scale).toBeGreaterThan(MIN_ZOOM_SCALE);
    jest.useRealTimers();
  });

  it('leaves a single tap alone', () => {
    renderScreen();
    const node = surface();

    fireEvent(node, 'responderGrant', responderEvent([{ id: 0, x: 150, y: 150 }], [], 0));
    fireEvent(node, 'responderRelease', responderEvent(
      [{ id: 0, x: 150, y: 150 }], [{ id: 0, x: 150, y: 150 }], 10
    ));

    expect(Haptics.impactAsync).not.toHaveBeenCalled();
    expect(transformOf().scale).toBe(MIN_ZOOM_SCALE);
  });
});
