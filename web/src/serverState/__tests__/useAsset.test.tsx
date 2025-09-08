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

describe('useAsset', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useQuery as jest.Mock).mockReturnValue({ data: mockAsset });
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
});
