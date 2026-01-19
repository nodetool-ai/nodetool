/**
 * @jest-environment jsdom
 */
import { createImageUrl, ImageSource, ImageData } from '../imageUtils';

// Mock URL for testing
global.URL.createObjectURL = jest.fn(() => 'blob:test-url');
global.URL.revokeObjectURL = jest.fn();

describe('imageUtils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('createImageUrl', () => {
    it('returns empty url for null source', () => {
      const result = createImageUrl(null, null);
      expect(result.url).toBe('');
      expect(result.blobUrl).toBeNull();
    });

    it('returns empty url for undefined source', () => {
      const result = createImageUrl(undefined, null);
      expect(result.url).toBe('');
      expect(result.blobUrl).toBeNull();
    });

    it('returns url from ImageSource with uri', () => {
      const source: ImageSource = { uri: 'https://example.com/image.png' };
      const result = createImageUrl(source, null);
      expect(result.url).toBe('https://example.com/image.png');
      expect(result.blobUrl).toBeNull();
    });

    it('returns empty url when uri is undefined and no data', () => {
      const source: ImageSource = { uri: undefined };
      const result = createImageUrl(source, null);
      expect(result.url).toBe('');
      expect(result.blobUrl).toBeNull();
    });

    it('handles data URI string directly', () => {
      const dataUri = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const result = createImageUrl(dataUri, null);
      expect(result.url).toBe(dataUri);
      expect(result.blobUrl).toBeNull();
    });

    it('handles blob URI string directly', () => {
      const blobUri = 'blob:http://localhost:3000/some-uuid';
      const result = createImageUrl(blobUri, null);
      expect(result.url).toBe(blobUri);
      expect(result.blobUrl).toBeNull();
    });

    it('handles http URI string directly', () => {
      const httpUri = 'http://example.com/image.png';
      const result = createImageUrl(httpUri, null);
      expect(result.url).toBe(httpUri);
      expect(result.blobUrl).toBeNull();
    });

    it('handles absolute path string', () => {
      const path = '/assets/image.png';
      const result = createImageUrl(path, null);
      expect(result.url).toBe(path);
      expect(result.blobUrl).toBeNull();
    });

    it('wraps base64 string without prefix', () => {
      const base64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const result = createImageUrl(base64, null);
      expect(result.url).toBe('data:image/png;base64,' + base64);
      expect(result.blobUrl).toBeNull();
    });

    it('handles Uint8Array by creating blob URL', () => {
      const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]); // PNG header
      const result = createImageUrl(bytes, null);
      expect(result.url).toBe('blob:test-url');
      expect(result.blobUrl).toBe('blob:test-url');
    });

    it('handles number array by creating blob URL', () => {
      const bytes: number[] = [137, 80, 78, 71, 13, 10, 26, 10]; // PNG header
      const result = createImageUrl(bytes, null);
      expect(result.url).toBe('blob:test-url');
      expect(result.blobUrl).toBe('blob:test-url');
    });

    it('revokes previous blob URL when new source provided', () => {
      const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
      
      const firstResult = createImageUrl(bytes, null);
      expect(firstResult.blobUrl).toBe('blob:test-url');
      
      const secondResult = createImageUrl(bytes, firstResult.blobUrl);
      
      expect(global.URL.revokeObjectURL).toHaveBeenCalledWith(firstResult.blobUrl);
      expect(secondResult.blobUrl).toBe('blob:test-url');
    });

    it('does not revoke blob URL when previous is null', () => {
      const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
      
      createImageUrl(bytes, null);
      
      expect(global.URL.revokeObjectURL).not.toHaveBeenCalled();
    });

    it('handles ImageSource with uri and data preferring uri', () => {
      const source: ImageSource = { 
        uri: 'https://example.com/image.png',
        data: new Uint8Array([1, 2, 3])
      };
      const result = createImageUrl(source, null);
      expect(result.url).toBe('https://example.com/image.png');
      expect(result.blobUrl).toBeNull();
    });

    it('uses data when uri is not provided in ImageSource', () => {
      const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
      const source: ImageSource = { 
        uri: undefined,
        data: bytes
      };
      const result = createImageUrl(source, null);
      expect(result.url).toBe('blob:test-url');
    });

    it('returns empty url for invalid data type', () => {
      const result = createImageUrl({} as ImageData, null);
      expect(result.url).toBe('');
      expect(result.blobUrl).toBeNull();
    });
  });
});
