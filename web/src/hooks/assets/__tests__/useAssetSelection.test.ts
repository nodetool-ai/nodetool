import { renderHook, act } from '@testing-library/react';
import { useAssetSelection } from '../useAssetSelection';
import { useAssetGridStore } from '../../../stores/AssetGridStore';
import { useKeyPressedStore } from '../../../stores/KeyPressedStore';

jest.mock('../../../stores/KeyPressedStore', () => ({
  useKeyPressedStore: {
    getState: jest.fn(),
  },
}));
jest.mock('../../../stores/ApiClient', () => ({
  BASE_URL: 'http://localhost',
  authHeader: () => ({}),
  client: { get: jest.fn() },
}));
jest.mock('../../../stores/AssetStore', () => ({
  useAssetStore: {
    getState: () => ({ get: jest.fn() }),
  },
}));
jest.mock('../../../stores/AssetGridStore', () => {
  const assetGridStore = {
    selectedAssetIds: [] as string[],
    setSelectedAssetIds: jest.fn((ids: string[]) => {
      assetGridStore.selectedAssetIds = ids;
    }),
    setCurrentAudioAsset: jest.fn(),
    setState: (state: Partial<any>) => {
      Object.assign(assetGridStore, state);
    },
    getState: () => assetGridStore,
  };
  return {
    __esModule: true,
    useAssetGridStore: (selector: any) => selector(assetGridStore),
    assetGridStore,
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { assetGridStore } = require('../../../stores/AssetGridStore');

const pressed: Record<string, boolean> = {};

(useKeyPressedStore.getState as jest.Mock).mockImplementation(() => ({
  isKeyPressed: (key: string) => !!pressed[key],
}));

const originalState = { ...assetGridStore };

let setSelectedAssetIdsMock: jest.Mock;
let setCurrentAudioAssetMock: jest.Mock;

const createAsset = (id: string, content_type: string) => ({
  id,
  user_id: 'u',
  workflow_id: null,
  parent_id: 'p',
  name: id,
  content_type,
  metadata: null,
  created_at: '0',
  get_url: 'url',
  thumb_url: null,
  duration: null,
});

const asset1 = createAsset('1', 'image/png');
const asset2 = createAsset('2', 'audio/mpeg');
const asset3 = createAsset('3', 'text/plain');

beforeEach(() => {
  setSelectedAssetIdsMock = jest.fn((ids: string[]) => {
    originalState.setSelectedAssetIds(ids);
  });
  setCurrentAudioAssetMock = jest.fn();
  assetGridStore.setState(
    {
      ...originalState,
      selectedAssetIds: [],
      setSelectedAssetIds: (ids: string[]) => {
        setSelectedAssetIdsMock(ids);
        originalState.setSelectedAssetIds(ids);
      },
      setCurrentAudioAsset: setCurrentAudioAssetMock,
    }
  );
  Object.keys(pressed).forEach((k) => delete pressed[k]);
});

afterAll(() => {
  assetGridStore.setState(originalState);
});

describe('useAssetSelection', () => {
  test('single click selects asset and clears audio for non-audio', () => {
    const { result } = renderHook(() => useAssetSelection([asset1, asset2, asset3]));
    setCurrentAudioAssetMock.mockClear();

    act(() => {
      result.current.handleSelectAsset(asset1.id);
    });

    expect(assetGridStore.getState().selectedAssetIds).toEqual([asset1.id]);
    expect(setSelectedAssetIdsMock).toHaveBeenCalledWith([asset1.id]);
    expect(setCurrentAudioAssetMock).toHaveBeenCalledWith(null);
  });

  test('ctrl click toggles selection and sets audio asset', () => {
    assetGridStore.setState({ selectedAssetIds: [asset1.id] });
    pressed.control = true;
    const { result } = renderHook(() => useAssetSelection([asset1, asset2, asset3]));
    setCurrentAudioAssetMock.mockClear();

    act(() => {
      result.current.handleSelectAsset(asset2.id);
    });

    expect(assetGridStore.getState().selectedAssetIds).toEqual([asset1.id, asset2.id]);
    expect(setCurrentAudioAssetMock).toHaveBeenCalledWith(asset2);
  });

  test('shift click selects range', () => {
    const { result } = renderHook(() => useAssetSelection([asset1, asset2, asset3]));
    act(() => {
      result.current.handleSelectAsset(asset1.id);
    });

    pressed.shift = true;
    act(() => {
      result.current.handleSelectAsset(asset3.id);
    });

    expect(assetGridStore.getState().selectedAssetIds).toEqual([asset1.id, asset2.id, asset3.id]);
  });

  test('select all and deselect', () => {
    const { result, rerender } = renderHook(() => useAssetSelection([asset1, asset2]));

    act(() => {
      result.current.handleSelectAllAssets();
    });

    expect(assetGridStore.getState().selectedAssetIds).toEqual([asset1.id, asset2.id]);

    setCurrentAudioAssetMock.mockClear();
    act(() => {
      result.current.handleDeselectAssets();
    });

    rerender();

    expect(assetGridStore.getState().selectedAssetIds).toEqual([]);
    expect(setCurrentAudioAssetMock).toHaveBeenCalledWith(null);
  });
});
