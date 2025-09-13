import { constants } from 'fs';
import { checkPermissions, fileExists } from '../utils';

// Mock fs module
jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  
  return {
    ...actual,
    constants: actual.constants,
    promises: {
      access: jest.fn(),
    },
  };
});

import { promises as fs } from 'fs';

describe('Utils', () => {
  const mockFs = fs as jest.Mocked<typeof fs>;
  
  beforeEach(() => {
    jest.clearAllMocks();
  });
  
  describe('checkPermissions', () => {
    it('should return accessible=true when access is granted', async () => {
      mockFs.access.mockResolvedValueOnce(undefined);
      
      const result = await checkPermissions('/path/to/file', constants.R_OK);
      
      expect(result).toEqual({ accessible: true, error: null });
      expect(mockFs.access).toHaveBeenCalledWith('/path/to/file', constants.R_OK);
    });
    
    it('should return accessible=false with error when file does not exist', async () => {
      const error = new Error('ENOENT: no such file or directory');
      (error as any).code = 'ENOENT';
      mockFs.access.mockRejectedValueOnce(error);
      
      const result = await checkPermissions('/path/to/non-existent', constants.R_OK);
      
      expect(result).toEqual({
        accessible: false,
        error: 'Cannot access /path/to/non-existent: File/directory does not exist'
      });
    });
    
    it('should return accessible=false with error when permission is denied', async () => {
      const error = new Error('EACCES: permission denied');
      (error as any).code = 'EACCES';
      mockFs.access.mockRejectedValueOnce(error);
      
      const result = await checkPermissions('/path/to/protected', constants.W_OK);
      
      expect(result).toEqual({
        accessible: false,
        error: 'Cannot access /path/to/protected: Permission denied'
      });
    });
    
    it('should return accessible=false with generic error for other errors', async () => {
      const error = new Error('Something else went wrong');
      mockFs.access.mockRejectedValueOnce(error);
      
      const result = await checkPermissions('/path/to/file', constants.R_OK);
      
      expect(result).toEqual({
        accessible: false,
        error: 'Cannot access /path/to/file: Something else went wrong'
      });
    });
  });
  
  describe('fileExists', () => {
    it('should return true when file exists', async () => {
      mockFs.access.mockResolvedValueOnce(undefined);
      
      const result = await fileExists('/path/to/existing-file');
      
      expect(result).toBe(true);
      expect(mockFs.access).toHaveBeenCalledWith('/path/to/existing-file', constants.F_OK);
    });
    
    it('should return false when file does not exist', async () => {
      const error = new Error('ENOENT: no such file or directory');
      (error as any).code = 'ENOENT';
      mockFs.access.mockRejectedValueOnce(error);
      
      const result = await fileExists('/path/to/non-existent-file');
      
      expect(result).toBe(false);
    });
  });
});