import { renderHook } from '@testing-library/react';
import { useAsset } from '../useAsset';
import { useQuery } from '@tanstack/react-query';
import { mockAsset } from '../../__mocks__/fixtures';

const mockGetAsset = jest.fn();
jest.mock('../../stores/AssetStore', () => ({
  __esModule: true,
  useAssetStore: jest.fn((selector: any) => selector({ get: mockGetAsset }))
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
});
