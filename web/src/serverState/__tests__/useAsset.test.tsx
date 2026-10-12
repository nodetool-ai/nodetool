import { renderHook } from '@testing-library/react';
import { useAsset } from '../useAsset';
import { useQuery } from '@tanstack/react-query';
import { mockAsset } from '../../__mocks__/fixtures';
import { BASE_URL } from '../../stores/BASE_URL';

const mockGetAsset = jest.fn();
jest.mock('../../stores/AssetStore', () => ({
  __esModule: true,
  useAssetStore: jest.fn(
    (selector: (state: { get: typeof mockGetAsset }) => unknown) =>
      selector({ get: mockGetAsset })
  )
}));

jest.mock('@tanstack/react-query', () => ({
  __esModule: true,
  useQuery: jest.fn()
}));

const mockFileUriToHttpUrl = jest.fn();
jest.mock('../../utils/localFile', () => ({
  __esModule: true,
  fileUriToHttpUrl: (uri: string | null | undefined) =>
    mockFileUriToHttpUrl(uri)
}));

describe('useAsset', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useQuery as jest.Mock).mockReturnValue({ data: mockAsset });
    mockFileUriToHttpUrl.mockReturnValue(null);
  });

  it('returns asset and uri when audio asset provided', () => {
    const { result } = renderHook(() =>
      useAsset({ audio: { asset_id: '123', uri: 'my://uri' } as any })
    );
    expect(useQuery).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['asset', '123'], enabled: true })
    );
    expect(result.current.asset).toEqual(mockAsset);
    expect(result.current.uri).toBe('my://uri');
  });

  it('query is disabled when no asset id', () => {
    renderHook(() => useAsset({ image: {} as any }));
    expect(useQuery).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['asset', undefined], enabled: false })
    );
  });

  it('loads by the id inside an asset:// uri when asset_id is absent', () => {
    renderHook(() =>
      useAsset({ video: { uri: 'asset://87c6124bc9684facabb8cb3575dcb8ad' } as any })
    );
    expect(useQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ['asset', '87c6124bc9684facabb8cb3575dcb8ad'],
        enabled: true
      })
    );
  });

  it('prefers fetched asset URL for asset scheme URIs', () => {
    const { result } = renderHook(() =>
      useAsset({ model3d: { asset_id: '123', uri: 'asset://123' } as any })
    );

    expect(result.current.asset).toEqual(mockAsset);
    expect(result.current.uri).toBe(mockAsset.get_url);
  });

  it('resolves file:// URIs to the backend streaming URL instead of the raw path', () => {
    mockFileUriToHttpUrl.mockReturnValue(
      'http://localhost:7777/api/files/local?path=%2FUsers%2Fme%2Fsong.mp3'
    );

    const { result } = renderHook(() =>
      useAsset({ audio: { asset_id: null, uri: 'file:///Users/me/song.mp3' } as any })
    );

    expect(mockFileUriToHttpUrl).toHaveBeenCalledWith('file:///Users/me/song.mp3');
    expect(result.current.uri).toBe(
      'http://localhost:7777/api/files/local?path=%2FUsers%2Fme%2Fsong.mp3'
    );
  });

  it('prefers the asset URL over a server-derived /api/storage path', () => {
    const { result } = renderHook(() =>
      useAsset({
        image: {
          asset_id: '4a816f674eda4358b8140c50917ae78e',
          uri: '/api/storage/4a816f674eda4358b8140c50917ae78e.bin'
        } as any
      })
    );
    expect(result.current.uri).toBe(mockAsset.get_url);
  });

  it('returns no uri for a derived path while the asset lookup is pending', () => {
    (useQuery as jest.Mock).mockReturnValue({ data: undefined, isPending: true });
    const { result } = renderHook(() =>
      useAsset({
        image: {
          asset_id: '4a816f674eda4358b8140c50917ae78e',
          uri: '/api/storage/4a816f674eda4358b8140c50917ae78e.bin'
        } as any
      })
    );
    expect(result.current.uri).toBeUndefined();
  });

  it('falls back to the stored path on the API origin once a lookup finds no asset', () => {
    (useQuery as jest.Mock).mockReturnValue({ data: undefined, isPending: false });
    const { result } = renderHook(() =>
      useAsset({
        image: {
          asset_id: '4a816f674eda4358b8140c50917ae78e',
          uri: '/api/storage/4a816f674eda4358b8140c50917ae78e.bin'
        } as any
      })
    );
    expect(result.current.uri).toBe(
      `${BASE_URL}/api/storage/4a816f674eda4358b8140c50917ae78e.bin`
    );
  });
});
