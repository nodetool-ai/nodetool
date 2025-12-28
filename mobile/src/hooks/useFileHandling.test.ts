/**
 * Tests for useFileHandling hook
 */

import { renderHook, act } from '@testing-library/react-native';
import { useFileHandling } from './useFileHandling';
import { DroppedFile } from '../types/chat.types';

describe('useFileHandling', () => {
  const mockImageFile: DroppedFile = {
    dataUri: 'data:image/png;base64,abc123',
    type: 'image/png',
    name: 'test-image.png',
  };

  const mockAudioFile: DroppedFile = {
    dataUri: 'data:audio/mpeg;base64,xyz789',
    type: 'audio/mpeg',
    name: 'test-audio.mp3',
  };

  const mockVideoFile: DroppedFile = {
    dataUri: 'data:video/mp4;base64,def456',
    type: 'video/mp4',
    name: 'test-video.mp4',
  };

  const mockPdfFile: DroppedFile = {
    dataUri: 'data:application/pdf;base64,pdf123',
    type: 'application/pdf',
    name: 'test-document.pdf',
  };

  const mockUnknownFile: DroppedFile = {
    dataUri: 'data:application/octet-stream;base64,unknown',
    type: 'application/octet-stream',
    name: 'unknown-file.bin',
  };

  describe('Initial state', () => {
    it('starts with empty droppedFiles array', () => {
      const { result } = renderHook(() => useFileHandling());
      expect(result.current.droppedFiles).toEqual([]);
    });

    it('provides all expected functions', () => {
      const { result } = renderHook(() => useFileHandling());
      expect(typeof result.current.addDroppedFiles).toBe('function');
      expect(typeof result.current.removeFile).toBe('function');
      expect(typeof result.current.clearFiles).toBe('function');
      expect(typeof result.current.getFileContents).toBe('function');
    });
  });

  describe('addDroppedFiles', () => {
    it('adds files to droppedFiles array', () => {
      const { result } = renderHook(() => useFileHandling());

      act(() => {
        result.current.addDroppedFiles([mockImageFile]);
      });

      expect(result.current.droppedFiles).toHaveLength(1);
      expect(result.current.droppedFiles[0]).toEqual(mockImageFile);
    });

    it('adds multiple files at once', () => {
      const { result } = renderHook(() => useFileHandling());

      act(() => {
        result.current.addDroppedFiles([mockImageFile, mockAudioFile]);
      });

      expect(result.current.droppedFiles).toHaveLength(2);
    });

    it('appends to existing files', () => {
      const { result } = renderHook(() => useFileHandling());

      act(() => {
        result.current.addDroppedFiles([mockImageFile]);
      });

      act(() => {
        result.current.addDroppedFiles([mockAudioFile]);
      });

      expect(result.current.droppedFiles).toHaveLength(2);
      expect(result.current.droppedFiles[0]).toEqual(mockImageFile);
      expect(result.current.droppedFiles[1]).toEqual(mockAudioFile);
    });
  });

  describe('removeFile', () => {
    it('removes file at specified index', () => {
      const { result } = renderHook(() => useFileHandling());

      act(() => {
        result.current.addDroppedFiles([mockImageFile, mockAudioFile, mockVideoFile]);
      });

      act(() => {
        result.current.removeFile(1);
      });

      expect(result.current.droppedFiles).toHaveLength(2);
      expect(result.current.droppedFiles[0]).toEqual(mockImageFile);
      expect(result.current.droppedFiles[1]).toEqual(mockVideoFile);
    });

    it('removes first file correctly', () => {
      const { result } = renderHook(() => useFileHandling());

      act(() => {
        result.current.addDroppedFiles([mockImageFile, mockAudioFile]);
      });

      act(() => {
        result.current.removeFile(0);
      });

      expect(result.current.droppedFiles).toHaveLength(1);
      expect(result.current.droppedFiles[0]).toEqual(mockAudioFile);
    });

    it('removes last file correctly', () => {
      const { result } = renderHook(() => useFileHandling());

      act(() => {
        result.current.addDroppedFiles([mockImageFile, mockAudioFile]);
      });

      act(() => {
        result.current.removeFile(1);
      });

      expect(result.current.droppedFiles).toHaveLength(1);
      expect(result.current.droppedFiles[0]).toEqual(mockImageFile);
    });
  });

  describe('clearFiles', () => {
    it('clears all files', () => {
      const { result } = renderHook(() => useFileHandling());

      act(() => {
        result.current.addDroppedFiles([mockImageFile, mockAudioFile, mockVideoFile]);
      });

      expect(result.current.droppedFiles).toHaveLength(3);

      act(() => {
        result.current.clearFiles();
      });

      expect(result.current.droppedFiles).toHaveLength(0);
    });
  });

  describe('getFileContents', () => {
    it('converts image file to image_url MessageContent', () => {
      const { result } = renderHook(() => useFileHandling());

      act(() => {
        result.current.addDroppedFiles([mockImageFile]);
      });

      const contents = result.current.getFileContents();
      expect(contents).toHaveLength(1);
      expect(contents[0]).toEqual({
        type: 'image_url',
        image: {
          type: 'image',
          uri: mockImageFile.dataUri,
        },
      });
    });

    it('converts audio file to audio MessageContent', () => {
      const { result } = renderHook(() => useFileHandling());

      act(() => {
        result.current.addDroppedFiles([mockAudioFile]);
      });

      const contents = result.current.getFileContents();
      expect(contents).toHaveLength(1);
      expect(contents[0]).toEqual({
        type: 'audio',
        audio: {
          type: 'audio',
          uri: mockAudioFile.dataUri,
        },
      });
    });

    it('converts video file to video MessageContent', () => {
      const { result } = renderHook(() => useFileHandling());

      act(() => {
        result.current.addDroppedFiles([mockVideoFile]);
      });

      const contents = result.current.getFileContents();
      expect(contents).toHaveLength(1);
      expect(contents[0]).toEqual({
        type: 'video',
        video: {
          type: 'video',
          uri: mockVideoFile.dataUri,
        },
      });
    });

    it('converts PDF file to document MessageContent', () => {
      const { result } = renderHook(() => useFileHandling());

      act(() => {
        result.current.addDroppedFiles([mockPdfFile]);
      });

      const contents = result.current.getFileContents();
      expect(contents).toHaveLength(1);
      expect(contents[0]).toEqual({
        type: 'document',
        document: {
          type: 'document',
          uri: mockPdfFile.dataUri,
        },
      });
    });

    it('converts unknown file type to text MessageContent with filename', () => {
      const { result } = renderHook(() => useFileHandling());

      act(() => {
        result.current.addDroppedFiles([mockUnknownFile]);
      });

      const contents = result.current.getFileContents();
      expect(contents).toHaveLength(1);
      expect(contents[0]).toEqual({
        type: 'text',
        text: mockUnknownFile.name,
      });
    });

    it('converts multiple files of different types', () => {
      const { result } = renderHook(() => useFileHandling());

      act(() => {
        result.current.addDroppedFiles([mockImageFile, mockAudioFile, mockVideoFile]);
      });

      const contents = result.current.getFileContents();
      expect(contents).toHaveLength(3);
      expect(contents[0].type).toBe('image_url');
      expect(contents[1].type).toBe('audio');
      expect(contents[2].type).toBe('video');
    });

    it('returns empty array when no files', () => {
      const { result } = renderHook(() => useFileHandling());
      const contents = result.current.getFileContents();
      expect(contents).toEqual([]);
    });
  });
});
