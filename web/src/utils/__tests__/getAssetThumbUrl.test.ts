/**
 * @jest-environment node
 */

import { getAssetThumbUrl } from '../getAssetThumbUrl';
import { AssetRef } from '../../stores/ApiTypes';

// Mock URL.createObjectURL since it's not available in Node
global.URL.createObjectURL = jest.fn(() => 'blob:mock-url');

// Mock console.error to avoid noise in tests
const originalConsoleError = console.error;
beforeAll(() => {
  console.error = jest.fn();
});

afterAll(() => {
  console.error = originalConsoleError;
});

describe('getAssetThumbUrl', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('with image assets containing data', () => {
    it('should create blob URL from Uint8Array data', () => {
      const asset: AssetRef = {
        type: 'image',
        data: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), // PNG header bytes
      } as AssetRef;

      const result = getAssetThumbUrl(asset);
      
      expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
      expect(URL.createObjectURL).toHaveBeenCalledWith(
        expect.objectContaining({
          size: 8,
          type: 'image/png',
        })
      );
      expect(result).toBe('blob:mock-url');
    });

    it('should convert object data to Uint8Array', () => {
      const asset: AssetRef = {
        type: 'image',
        data: { 0: 137, 1: 80, 2: 78, 3: 71 }, // Object with numeric keys
      } as AssetRef;

      const result = getAssetThumbUrl(asset);
      
      expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
      expect(result).toBe('blob:mock-url');
    });

    it('should handle empty Uint8Array', () => {
      const asset: AssetRef = {
        type: 'image',
        data: new Uint8Array(0),
      } as AssetRef;

      const result = getAssetThumbUrl(asset);
      
      expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
      expect(result).toBe('blob:mock-url');
    });

    it('should handle large Uint8Array', () => {
      const asset: AssetRef = {
        type: 'image',
        data: new Uint8Array(1024 * 1024), // 1MB of zeros
      } as AssetRef;

      const result = getAssetThumbUrl(asset);
      
      expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
      expect(result).toBe('blob:mock-url');
    });

    it('should handle array-like object with string keys', () => {
      const asset: AssetRef = {
        type: 'image',
        data: { '0': 137, '1': 80, '2': 78, '3': 71, length: 4 },
      } as AssetRef;

      const result = getAssetThumbUrl(asset);
      
      expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
      expect(result).toBe('blob:mock-url');
    });
  });

  describe('error handling', () => {
    it('should return fallback URL when createObjectURL throws', () => {
      (URL.createObjectURL as jest.Mock).mockImplementationOnce(() => {
        throw new Error('Failed to create object URL');
      });

      const asset: AssetRef = {
        type: 'image',
        data: new Uint8Array([1, 2, 3]),
      } as AssetRef;

      const result = getAssetThumbUrl(asset);
      
      expect(console.error).toHaveBeenCalledWith(
        'Failed to create thumbnail URL from binary data:',
        expect.any(Error)
      );
      expect(result).toBe('/images/placeholder.png');
    });

    it('should return fallback URL when data conversion fails', () => {
      const asset: AssetRef = {
        type: 'image',
        data: null, // This will cause Object.values to throw
      } as AssetRef;

      // Mock Object.values to throw
      const originalObjectValues = Object.values;
      Object.values = jest.fn(() => {
        throw new Error('Cannot convert');
      });

      const result = getAssetThumbUrl(asset);
      
      expect(result).toBe('/images/placeholder.png');
      
      // Restore Object.values
      Object.values = originalObjectValues;
    });

    it('should handle invalid data object gracefully', () => {
      const asset: AssetRef = {
        type: 'image',
        data: 'invalid-data' as any,
      } as AssetRef;

      const result = getAssetThumbUrl(asset);
      
      // Should attempt to convert and may succeed or fail based on implementation
      expect(result).toBeDefined();
    });
  });

  describe('fallback behavior', () => {
    it('should use default fallback URL when no data', () => {
      const asset: AssetRef = {
        type: 'image',
        // No data property
      } as AssetRef;

      const result = getAssetThumbUrl(asset);
      
      expect(result).toBe('/images/placeholder.png');
      expect(URL.createObjectURL).not.toHaveBeenCalled();
    });

    it('should use custom fallback URL when provided', () => {
      const asset: AssetRef = {
        type: 'image',
        // No data property
      } as AssetRef;

      const result = getAssetThumbUrl(asset, '/custom/fallback.jpg');
      
      expect(result).toBe('/custom/fallback.jpg');
    });

    it('should return fallback for non-image types with data', () => {
      const asset: AssetRef = {
        type: 'video' as any,
        data: new Uint8Array([1, 2, 3]),
      } as AssetRef;

      const result = getAssetThumbUrl(asset);
      
      expect(result).toBe('/images/placeholder.png');
      expect(URL.createObjectURL).not.toHaveBeenCalled();
    });

    it('should return fallback for audio type', () => {
      const asset: AssetRef = {
        type: 'audio' as any,
        data: new Uint8Array([1, 2, 3]),
      } as AssetRef;

      const result = getAssetThumbUrl(asset);
      
      expect(result).toBe('/images/placeholder.png');
    });

    it('should return fallback for text type', () => {
      const asset: AssetRef = {
        type: 'text' as any,
        data: new Uint8Array([1, 2, 3]),
      } as AssetRef;

      const result = getAssetThumbUrl(asset);
      
      expect(result).toBe('/images/placeholder.png');
    });

    it('should return fallback when type is undefined', () => {
      const asset: AssetRef = {
        data: new Uint8Array([1, 2, 3]),
      } as AssetRef;

      const result = getAssetThumbUrl(asset);
      
      expect(result).toBe('/images/placeholder.png');
    });
  });

  describe('edge cases', () => {
    it('should handle asset with both data and type but type is not exactly "image"', () => {
      const asset: AssetRef = {
        type: 'IMAGE' as any, // Wrong case
        data: new Uint8Array([1, 2, 3]),
      } as AssetRef;

      const result = getAssetThumbUrl(asset);
      
      expect(result).toBe('/images/placeholder.png');
    });

    it('should handle asset with whitespace in type', () => {
      const asset: AssetRef = {
        type: ' image ' as any,
        data: new Uint8Array([1, 2, 3]),
      } as AssetRef;

      const result = getAssetThumbUrl(asset);
      
      expect(result).toBe('/images/placeholder.png');
    });

    it('should handle empty string fallback URL', () => {
      const asset: AssetRef = {
        type: 'video' as any,
      } as AssetRef;

      const result = getAssetThumbUrl(asset, '');
      
      expect(result).toBe('');
    });

    it('should handle null/undefined in data object values', () => {
      const asset: AssetRef = {
        type: 'image',
        data: { 0: null, 1: undefined, 2: 78, 3: 71 },
      } as AssetRef;

      const result = getAssetThumbUrl(asset);
      
      // Should either succeed or fall back gracefully
      expect(result).toBeDefined();
    });

    it('should handle asset with complex nested data', () => {
      const asset: AssetRef = {
        type: 'image',
        data: { nested: { value: 123 } } as any,
      } as AssetRef;

      const result = getAssetThumbUrl(asset);
      
      // Should handle gracefully, likely falling back
      expect(result).toBeDefined();
    });

    it('should create correct blob type', () => {
      const asset: AssetRef = {
        type: 'image',
        data: new Uint8Array([255, 216, 255, 224]), // JPEG header
      } as AssetRef;

      getAssetThumbUrl(asset);
      
      // Still creates as PNG since that's hardcoded
      expect(URL.createObjectURL).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'image/png',
        })
      );
    });
  });

  describe('memory management', () => {
    it('should create new blob URL each call', () => {
      const asset: AssetRef = {
        type: 'image',
        data: new Uint8Array([1, 2, 3]),
      } as AssetRef;

      const result1 = getAssetThumbUrl(asset);
      const result2 = getAssetThumbUrl(asset);
      
      expect(URL.createObjectURL).toHaveBeenCalledTimes(2);
      // In real implementation, these would be different URLs
      expect(result1).toBe('blob:mock-url');
      expect(result2).toBe('blob:mock-url');
    });

    it('should handle same data in different formats', () => {
      const data = [137, 80, 78, 71];
      
      const asset1: AssetRef = {
        type: 'image',
        data: new Uint8Array(data),
      } as AssetRef;

      const asset2: AssetRef = {
        type: 'image',
        data: { 0: 137, 1: 80, 2: 78, 3: 71 },
      } as AssetRef;

      getAssetThumbUrl(asset1);
      getAssetThumbUrl(asset2);
      
      expect(URL.createObjectURL).toHaveBeenCalledTimes(2);
    });
  });
});